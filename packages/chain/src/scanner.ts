import { getAddress, isAddress, isAddressEqual, pad, type Address, type Hex, type PublicClient } from "viem";
import { erc1155Abi, erc20Abi, erc721Abi } from "./abis";
import type { BlockscoutClient, BsAddressInfo, BsToken } from "./blockscout";
import { classifyAsset } from "./classify";
import { MAX_UINT256, TOPIC_APPROVAL, TOPIC_APPROVAL_FOR_ALL, type SupportedChainId } from "./constants";
import { formatAmount } from "./format";
import type { CleanupOperation } from "./operations";
import { simulateOperations } from "./simulate";
import type { ApprovalItem, ApprovalRisk, BurnMechanism, NftAsset, ScanResult, SimulatedCall, TokenAsset } from "./types";

export interface ScannerDeps {
  chainId: SupportedChainId;
  client: PublicClient;
  blockscout: BlockscoutClient;
  /** Probe burn mechanisms via simulation (default true). */
  probeMechanisms?: boolean;
  /** Gas ceiling used when probing mechanisms. */
  maxGasPerCall: bigint;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

const MAX_TOKENS = 400;
const MAX_NFTS = 300;
const MAX_APPROVALS = 300;
const ENRICH_CONCURRENCY = 6;
/** Ops per probe request; see DEFAULT_SIMULATE_CHUNK for the gateway limit. */
const PROBE_CHUNK = 10;

/**
 * Scan a wallet on Robinhood Chain. The indexer discovers candidates; every
 * balance, ownership and allowance is re-read on-chain before it is reported.
 */
export async function scanWallet(deps: ScannerDeps, rawAddress: Address): Promise<ScanResult> {
  const address = getAddress(rawAddress);
  const errors: string[] = [];
  const partial = { tokens: false, nfts: false, approvals: false };

  const [nativeBalance, tokens, nfts, approvals] = await Promise.all([
    deps.client.getBalance({ address }).catch(() => 0n),
    scanTokens(deps, address)
      .then((r) => {
        partial.tokens = true;
        return r;
      })
      .catch((e) => {
        errors.push(`tokens: ${errMsg(e)}`);
        return [] as TokenAsset[];
      }),
    scanNfts(deps, address)
      .then((r) => {
        partial.nfts = true;
        return r;
      })
      .catch((e) => {
        errors.push(`nfts: ${errMsg(e)}`);
        return [] as NftAsset[];
      }),
    scanApprovals(deps, address)
      .then((r) => {
        partial.approvals = true;
        return r;
      })
      .catch((e) => {
        errors.push(`approvals: ${errMsg(e)}`);
        return [] as ApprovalItem[];
      }),
  ]);

  return {
    chainId: deps.chainId,
    address,
    tokens,
    nfts,
    approvals,
    partial,
    errors,
    scannedAt: Date.now(),
    nativeBalance: nativeBalance.toString(),
  };
}

// ---------------------------------------------------------------------------
// ERC-20
// ---------------------------------------------------------------------------

async function scanTokens(deps: ScannerDeps, owner: Address): Promise<TokenAsset[]> {
  const hints = (await deps.blockscout.addressTokens(owner, "ERC-20")).slice(0, MAX_TOKENS);
  if (hints.length === 0) return [];

  // Truth from chain: balances via multicall.
  const balances = await deps.client.multicall({
    allowFailure: true,
    contracts: hints.map((h) => ({
      address: h.token.address_hash,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [owner] as const,
    })),
  });

  const live = hints
    .map((h, i) => ({ hint: h, balance: balances[i]?.status === "success" ? (balances[i]!.result as bigint) : 0n }))
    .filter((x) => x.balance > 0n);

  const infos = await mapLimit(live, ENRICH_CONCURRENCY, async ({ hint }) =>
    deps.blockscout.addressInfo(hint.token.address_hash).catch(() => null),
  );

  const assets: TokenAsset[] = live.map(({ hint, balance }, i) => {
    const t = hint.token;
    const info = infos[i] ?? null;
    const decimals = parseDecimals(t.decimals);
    const price = t.exchange_rate ? Number(t.exchange_rate) : null;
    const valueUsd = price && Number.isFinite(price) ? price * Number(formatUnitsNumber(balance, decimals)) : null;
    const cls = classifyAsset({
      chainId: deps.chainId,
      standard: "ERC20",
      address: getAddress(t.address_hash),
      name: t.name ?? "Unknown token",
      symbol: t.symbol ?? "???",
      verified: info?.is_verified ?? false,
      isScam: info?.is_scam ?? false,
      reputation: t.reputation ?? info?.reputation ?? null,
      holdersCount: t.holders_count ? Number(t.holders_count) : null,
      valueUsd,
      implementation: primaryImplementation(info),
    });
    return {
      standard: "ERC20",
      address: getAddress(t.address_hash),
      symbol: t.symbol ?? "???",
      name: t.name ?? "Unknown token",
      decimals,
      balance: balance.toString(),
      balanceFormatted: formatAmount(balance, decimals),
      valueUsd,
      iconUrl: t.icon_url,
      verified: info?.is_verified ?? false,
      holdersCount: t.holders_count ? Number(t.holders_count) : null,
      mechanism: "UNKNOWN",
      ...cls,
    };
  });

  if (deps.probeMechanisms !== false) await probeTokenMechanisms(deps, owner, assets);
  return assets.sort(sortAssets);
}

/**
 * Determine burn mechanism per token by simulating burn(amount) then
 * transfer(DEAD, amount). Anything that misbehaves is UNSUPPORTED.
 */
async function probeTokenMechanisms(deps: ScannerDeps, owner: Address, assets: TokenAsset[]): Promise<void> {
  for (const chunk of chunks(assets, PROBE_CHUNK)) {
    const burnOps: CleanupOperation[] = chunk.map((a) => ({ kind: "ERC20_BURN", token: a.address, owner, amount: a.balance }));
    const deadOps: CleanupOperation[] = chunk.map((a) => ({ kind: "ERC20_DEAD", token: a.address, owner, amount: a.balance }));
    // Sequential on purpose: the public gateway rate-limits bursts of simulations.
    const burn = await probe(deps, burnOps, "burn");
    const dead = await probe(deps, deadOps, "dead");
    chunk.forEach((a, i) => applyVerdict(a, burn?.[i], dead?.[i]));
  }
}

async function probe(deps: ScannerDeps, ops: CleanupOperation[], label: string): Promise<SimulatedCall[] | null> {
  try {
    return await withRetry(() => simulateOperations(deps.client, ops, { maxGasPerCall: deps.maxGasPerCall }));
  } catch (e) {
    deps.log?.(`probe ${label} failed`, { error: errMsg(e), ops: ops.length });
    return null;
  }
}

function applyVerdict(
  a: { mechanism: BurnMechanism; mechanismReason?: string | undefined },
  b: SimulatedCall | undefined,
  d: SimulatedCall | undefined,
): void {
  if (b && b.status === "success" && b.anomalies.length === 0) {
    a.mechanism = "BURNABLE";
  } else if (d && d.status === "success" && d.anomalies.length === 0) {
    a.mechanism = "SEND_TO_DEAD";
  } else if (!b && !d) {
    a.mechanism = "UNKNOWN";
    a.mechanismReason = "Simulation unavailable, rescan to retry";
  } else {
    a.mechanism = "UNSUPPORTED";
    a.mechanismReason = d?.anomalies[0] ?? d?.revertReason ?? b?.anomalies[0] ?? b?.revertReason ?? "Non-standard behaviour";
  }
}

/** Retry only on gateway throttling; every other failure is surfaced immediately. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 700): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!/429|too many|rate limit/i.test(errMsg(e))) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

// ---------------------------------------------------------------------------
// NFTs
// ---------------------------------------------------------------------------

async function scanNfts(deps: ScannerDeps, owner: Address): Promise<NftAsset[]> {
  const instances = (await deps.blockscout.addressNfts(owner)).slice(0, MAX_NFTS);
  if (instances.length === 0) return [];

  const ownership = await deps.client.multicall({
    allowFailure: true,
    contracts: instances.map((n) =>
      n.token_type === "ERC-1155" || n.token.type === "ERC-1155"
        ? {
            address: n.token.address_hash,
            abi: erc1155Abi,
            functionName: "balanceOf" as const,
            args: [owner, BigInt(n.id)] as const,
          }
        : {
            address: n.token.address_hash,
            abi: erc721Abi,
            functionName: "ownerOf" as const,
            args: [BigInt(n.id)] as const,
          },
    ),
  });

  const live = instances
    .map((n, i) => {
      const r = ownership[i];
      const is1155 = n.token_type === "ERC-1155" || n.token.type === "ERC-1155";
      if (!r || r.status !== "success") return null;
      if (is1155) {
        const bal = r.result as bigint;
        return bal > 0n ? { n, is1155, amount: bal } : null;
      }
      const o = r.result as Address;
      return isAddress(o) && isAddressEqual(o, owner) ? { n, is1155, amount: 1n } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const collections = [...new Set(live.map((x) => x.n.token.address_hash.toLowerCase()))];
  const infoByCollection = new Map<string, BsAddressInfo | null>();
  await mapLimit(collections, ENRICH_CONCURRENCY, async (addr) => {
    infoByCollection.set(addr, await deps.blockscout.addressInfo(addr as Address).catch(() => null));
  });

  const assets: NftAsset[] = live.map(({ n, is1155, amount }) => {
    const t = n.token;
    const info = infoByCollection.get(t.address_hash.toLowerCase()) ?? null;
    const cls = classifyAsset({
      chainId: deps.chainId,
      standard: is1155 ? "ERC1155" : "ERC721",
      address: getAddress(t.address_hash),
      name: t.name ?? "Unknown collection",
      symbol: t.symbol ?? "",
      verified: info?.is_verified ?? false,
      isScam: info?.is_scam ?? false,
      reputation: t.reputation ?? info?.reputation ?? null,
      holdersCount: t.holders_count ? Number(t.holders_count) : null,
      valueUsd: null,
      implementation: primaryImplementation(info),
    });
    return {
      standard: is1155 ? "ERC1155" : "ERC721",
      address: getAddress(t.address_hash),
      collectionName: t.name ?? "Unknown collection",
      symbol: t.symbol ?? "",
      tokenId: n.id,
      amount: amount.toString(),
      imageUrl: n.image_url ?? n.metadata?.image ?? null,
      verified: info?.is_verified ?? false,
      mechanism: "UNKNOWN",
      ...cls,
    };
  });

  if (deps.probeMechanisms !== false) await probeNftMechanisms(deps, owner, assets);
  return assets;
}

/**
 * NFT mechanism is a property of the collection contract, so one representative
 * token per collection is probed and the verdict applied to its siblings.
 * Every selected token is still simulated individually at review time.
 */
async function probeNftMechanisms(deps: ScannerDeps, owner: Address, assets: NftAsset[]): Promise<void> {
  const groups = new Map<string, NftAsset[]>();
  for (const a of assets) {
    const key = `${a.address.toLowerCase()}:${a.standard}`;
    const g = groups.get(key);
    if (g) g.push(a);
    else groups.set(key, [a]);
  }
  const reps = [...groups.values()].map((g) => g[0]!);
  for (const chunk of chunks(reps, PROBE_CHUNK)) {
    const burnOps: CleanupOperation[] = chunk.map((a) =>
      a.standard === "ERC1155"
        ? { kind: "ERC1155_BURN", token: a.address, owner, tokenId: a.tokenId, amount: a.amount }
        : { kind: "ERC721_BURN", token: a.address, owner, tokenId: a.tokenId },
    );
    const deadOps: CleanupOperation[] = chunk.map((a) =>
      a.standard === "ERC1155"
        ? { kind: "ERC1155_DEAD", token: a.address, owner, tokenId: a.tokenId, amount: a.amount }
        : { kind: "ERC721_DEAD", token: a.address, owner, tokenId: a.tokenId },
    );
    const burn = await probe(deps, burnOps, "nft burn");
    const dead = await probe(deps, deadOps, "nft dead");
    chunk.forEach((rep, i) => {
      const verdict = { mechanism: "UNKNOWN" as BurnMechanism, mechanismReason: undefined as string | undefined };
      applyVerdict(verdict, burn?.[i], dead?.[i]);
      for (const a of groups.get(`${rep.address.toLowerCase()}:${rep.standard}`) ?? []) {
        a.mechanism = verdict.mechanism;
        if (verdict.mechanismReason) a.mechanismReason = verdict.mechanismReason;
        else delete a.mechanismReason;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

interface ApprovalCandidate {
  kind: ApprovalItem["kind"];
  token: Address;
  spender: Address;
  tokenId?: bigint;
  block: number;
  timestamp: number;
  txHash: Hex;
}

async function scanApprovals(deps: ScannerDeps, owner: Address): Promise<ApprovalItem[]> {
  const ownerTopic = pad(owner, { size: 32 }).toLowerCase() as Hex;
  const [approvalLogs, operatorLogs] = await Promise.all([
    deps.blockscout.logs({ topic0: TOPIC_APPROVAL, topic1: ownerTopic }),
    deps.blockscout.logs({ topic0: TOPIC_APPROVAL_FOR_ALL, topic1: ownerTopic }),
  ]);

  // Keep only the latest event per (token, spender[, tokenId]).
  const latest = new Map<string, ApprovalCandidate>();
  const consider = (c: ApprovalCandidate) => {
    const key = `${c.kind}:${c.token.toLowerCase()}:${c.spender.toLowerCase()}:${c.tokenId?.toString() ?? ""}`;
    const prev = latest.get(key);
    if (!prev || prev.block < c.block) latest.set(key, c);
  };

  for (const log of approvalLogs) {
    const topics = log.topics.filter((t): t is Hex => Boolean(t));
    if (topics.length === 3) {
      // ERC-20 Approval(owner, spender, value)
      consider({
        kind: "ERC20_ALLOWANCE",
        token: getAddress(log.address),
        spender: topicAddress(topics[2]!),
        block: Number(log.blockNumber),
        timestamp: Number(log.timeStamp),
        txHash: log.transactionHash,
      });
    } else if (topics.length === 4) {
      // ERC-721 Approval(owner, approved, tokenId)
      consider({
        kind: "ERC721_TOKEN",
        token: getAddress(log.address),
        spender: topicAddress(topics[2]!),
        tokenId: BigInt(topics[3]!),
        block: Number(log.blockNumber),
        timestamp: Number(log.timeStamp),
        txHash: log.transactionHash,
      });
    }
  }
  for (const log of operatorLogs) {
    const topics = log.topics.filter((t): t is Hex => Boolean(t));
    if (topics.length !== 3) continue;
    consider({
      kind: "OPERATOR",
      token: getAddress(log.address),
      spender: topicAddress(topics[2]!),
      block: Number(log.blockNumber),
      timestamp: Number(log.timeStamp),
      txHash: log.transactionHash,
    });
  }

  const candidates = [...latest.values()]
    .filter((c) => !isAddressEqual(c.spender, "0x0000000000000000000000000000000000000000"))
    .slice(0, MAX_APPROVALS);
  if (candidates.length === 0) return [];

  // Truth from chain: live allowance / approval / operator status.
  const live = await deps.client.multicall({
    allowFailure: true,
    contracts: candidates.map((c) => {
      if (c.kind === "ERC20_ALLOWANCE")
        return { address: c.token, abi: erc20Abi, functionName: "allowance" as const, args: [owner, c.spender] as const };
      if (c.kind === "ERC721_TOKEN")
        return { address: c.token, abi: erc721Abi, functionName: "getApproved" as const, args: [c.tokenId!] as const };
      return {
        address: c.token,
        abi: erc721Abi,
        functionName: "isApprovedForAll" as const,
        args: [owner, c.spender] as const,
      };
    }),
  });

  const active = candidates
    .map((c, i) => {
      const r = live[i];
      if (!r || r.status !== "success") return null;
      if (c.kind === "ERC20_ALLOWANCE") {
        const v = r.result as bigint;
        return v > 0n ? { c, amount: v } : null;
      }
      if (c.kind === "ERC721_TOKEN") {
        const a = r.result as Address;
        return isAddress(a) && isAddressEqual(a, c.spender) ? { c, amount: undefined } : null;
      }
      return (r.result as boolean) ? { c, amount: undefined } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // ERC-721 token approvals only matter if the wallet still owns the token.
  const erc721Checks = active.filter((a) => a.c.kind === "ERC721_TOKEN");
  if (erc721Checks.length > 0) {
    const owners = await deps.client.multicall({
      allowFailure: true,
      contracts: erc721Checks.map((a) => ({
        address: a.c.token,
        abi: erc721Abi,
        functionName: "ownerOf" as const,
        args: [a.c.tokenId!] as const,
      })),
    });
    const stillOwned = new Set<string>();
    erc721Checks.forEach((a, i) => {
      const r = owners[i];
      if (r?.status === "success" && isAddressEqual(r.result as Address, owner)) {
        stillOwned.add(`${a.c.token}:${a.c.tokenId}`);
      }
    });
    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i]!;
      if (a.c.kind === "ERC721_TOKEN" && !stillOwned.has(`${a.c.token}:${a.c.tokenId}`)) active.splice(i, 1);
    }
  }

  const tokenAddrs = [...new Set(active.map((a) => a.c.token.toLowerCase()))];
  const spenderAddrs = [...new Set(active.map((a) => a.c.spender.toLowerCase()))];
  const tokenInfo = new Map<string, BsToken | null>();
  const spenderInfo = new Map<string, BsAddressInfo | null>();
  await Promise.all([
    mapLimit(tokenAddrs, ENRICH_CONCURRENCY, async (a) => {
      tokenInfo.set(a, await deps.blockscout.tokenInfo(a as Address).catch(() => null));
    }),
    mapLimit(spenderAddrs, ENRICH_CONCURRENCY, async (a) => {
      spenderInfo.set(a, await deps.blockscout.addressInfo(a as Address).catch(() => null));
    }),
  ]);

  return active
    .map(({ c, amount }) => {
      const t = tokenInfo.get(c.token.toLowerCase()) ?? null;
      const s = spenderInfo.get(c.spender.toLowerCase()) ?? null;
      const decimals = t?.decimals ? parseDecimals(t.decimals) : null;
      const unlimited = amount !== undefined && amount >= MAX_UINT256 / 2n;
      const { risk, reasons } = assessSpender(s, unlimited, c.kind);
      const standard = c.kind === "ERC20_ALLOWANCE" ? "ERC20" : t?.type === "ERC-1155" ? "ERC1155" : "ERC721";
      const item: ApprovalItem = {
        id: `${c.kind}:${c.token}:${c.spender}:${c.tokenId?.toString() ?? ""}`,
        kind: c.kind,
        standard,
        asset: { address: c.token, symbol: t?.symbol ?? "???", name: t?.name ?? "Unknown asset", decimals },
        spender: c.spender,
        spenderName: s?.name ?? null,
        spenderIsContract: s?.is_contract ?? false,
        spenderVerified: s?.is_verified ?? false,
        risk,
        riskReasons: reasons,
        lastActivityBlock: c.block,
        lastActivityAt: c.timestamp * 1000,
        txHash: c.txHash,
      };
      if (amount !== undefined) {
        item.amount = amount.toString();
        item.amountFormatted = unlimited ? "Unlimited" : formatAmount(amount, decimals ?? 18);
        item.unlimited = unlimited;
      }
      if (c.tokenId !== undefined) item.tokenId = c.tokenId.toString();
      return item;
    })
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || (b.lastActivityBlock ?? 0) - (a.lastActivityBlock ?? 0));
}

function assessSpender(
  s: BsAddressInfo | null,
  unlimited: boolean,
  kind: ApprovalItem["kind"],
): { risk: ApprovalRisk; reasons: string[] } {
  const reasons: string[] = [];
  if (!s) return { risk: "UNKNOWN", reasons: ["Spender could not be resolved"] };
  if (s.is_scam) reasons.push("Spender flagged by explorer");
  if (!s.is_contract) reasons.push("Spender is an externally owned account, not a contract");
  if (s.is_contract && !s.is_verified) reasons.push("Spender contract source is not verified");
  if (unlimited) reasons.push("Unlimited allowance");
  if (kind === "OPERATOR") reasons.push("Operator can move every token in the collection");
  if (s.is_scam || !s.is_contract) return { risk: "HIGH", reasons };
  if (!s.is_verified || unlimited || kind === "OPERATOR") return { risk: "MEDIUM", reasons };
  return { risk: "LOW", reasons: reasons.length ? reasons : ["Verified contract"] };
}

function riskRank(r: ApprovalRisk): number {
  return { HIGH: 3, MEDIUM: 2, UNKNOWN: 1, LOW: 0 }[r];
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sortAssets(a: TokenAsset, b: TokenAsset): number {
  const order = (t: TokenAsset) =>
    t.classification === "PROTECTED" ? 3 : t.classification === "VALUABLE" ? 2 : t.classification === "VERIFIED" ? 1 : 0;
  return order(a) - order(b) || (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || a.symbol.localeCompare(b.symbol);
}

function primaryImplementation(info: BsAddressInfo | null): { address: Address; name: string | null } | undefined {
  const impl = info?.implementations?.[0];
  return impl ? { address: impl.address_hash, name: impl.name } : undefined;
}

function parseDecimals(d: string | null): number {
  const n = d ? Number(d) : 18;
  return Number.isFinite(n) && n >= 0 && n <= 77 ? n : 18;
}

function formatUnitsNumber(v: bigint, decimals: number): number {
  return Number(v) / 10 ** decimals;
}

function topicAddress(topic: Hex): Address {
  return getAddress(`0x${topic.slice(-40)}`);
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
