import { getAddress, isAddressEqual, numberToHex, pad, type Address, type Hex, type PublicClient } from "viem";
import { ALCHEMY_NETWORK_SLUG, TOPIC_APPROVAL, TOPIC_APPROVAL_FOR_ALL, ZERO_ADDRESS, type SupportedChainId } from "../constants";
import type { AddressInfo, ApprovalLogHint, IndexerProvider, NftHint, TokenHint, TokenMeta } from "../indexer";
import { resolveImplementation } from "../proxy";

/**
 * Alchemy-backed indexer (Token API, NFT API v3, eth_getLogs). Used when a
 * server-side key is configured; required for mainnet where the public
 * explorer blocks non-browser clients. Verification status is unknown here
 * and is left null so the classifier stays conservative.
 */
export class AlchemyProvider implements IndexerProvider {
  readonly name = "alchemy";
  private readonly rpc: string;
  private readonly nft: string;
  private readonly metaCache = new Map<string, TokenMeta | null>();

  constructor(
    readonly apiKey: string,
    readonly chainId: SupportedChainId,
    readonly client: PublicClient,
    private readonly timeoutMs = 20_000,
  ) {
    const slug = ALCHEMY_NETWORK_SLUG[chainId];
    this.rpc = `https://${slug}.g.alchemy.com/v2/${apiKey}`;
    this.nft = `https://${slug}.g.alchemy.com/nft/v3/${apiKey}`;
  }

  async tokenBalances(owner: Address): Promise<TokenHint[]> {
    const out: TokenHint[] = [];
    let pageKey: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = (await this.call("alchemy_getTokenBalances", [owner, "erc20", pageKey ? { pageKey } : {}])) as {
        tokenBalances: { contractAddress: Address; tokenBalance: Hex | null; error?: string | null }[];
        pageKey?: string;
      };
      for (const b of res.tokenBalances) {
        if (b.error || !b.tokenBalance || BigInt(b.tokenBalance) === 0n) continue;
        const meta = await this.tokenMeta(b.contractAddress);
        out.push({
          address: getAddress(b.contractAddress),
          symbol: meta?.symbol ?? null,
          name: meta?.name ?? null,
          decimals: meta?.decimals ?? null,
          balanceHint: BigInt(b.tokenBalance),
          iconUrl: (meta as { logo?: string | null } | null)?.logo ?? null,
          priceUsd: null,
          holdersCount: null,
          reputation: null,
        });
      }
      pageKey = res.pageKey;
      if (!pageKey) break;
    }
    return out;
  }

  async nftHoldings(owner: Address): Promise<NftHint[]> {
    const out: NftHint[] = [];
    let pageKey: string | undefined;
    for (let page = 0; page < 6; page++) {
      const q = new URLSearchParams({ owner, withMetadata: "true", pageSize: "100" });
      if (pageKey) q.set("pageKey", pageKey);
      const res = (await this.get(`${this.nft}/getNFTsForOwner?${q.toString()}`)) as {
        ownedNfts: {
          contract: { address: Address; name?: string | null; symbol?: string | null; tokenType?: string };
          tokenId: string;
          tokenType?: string;
          balance?: string;
          image?: { cachedUrl?: string | null; originalUrl?: string | null };
        }[];
        pageKey?: string;
      };
      for (const n of res.ownedNfts ?? []) {
        const type = n.tokenType ?? n.contract.tokenType ?? "ERC721";
        out.push({
          address: getAddress(n.contract.address),
          tokenId: n.tokenId,
          standard: type === "ERC1155" ? "ERC1155" : "ERC721",
          collectionName: n.contract.name ?? null,
          symbol: n.contract.symbol ?? null,
          imageUrl: n.image?.cachedUrl ?? n.image?.originalUrl ?? null,
          amountHint: n.balance ? BigInt(n.balance) : null,
          holdersCount: null,
          reputation: null,
        });
      }
      pageKey = res.pageKey;
      if (!pageKey) break;
    }
    return out;
  }

  /**
   * Approval discovery via eth_getLogs over the whole chain, bisecting block
   * ranges when the provider's result cap is hit.
   */
  async approvalLogs(owner: Address): Promise<ApprovalLogHint[]> {
    const ownerTopic = pad(owner, { size: 32 }).toLowerCase() as Hex;
    const latest = Number(await this.client.getBlockNumber());
    const [a, b] = await Promise.all([
      this.getLogsBisect([TOPIC_APPROVAL, ownerTopic], 0, latest, 0),
      this.getLogsBisect([TOPIC_APPROVAL_FOR_ALL, ownerTopic], 0, latest, 0),
    ]);
    const out: ApprovalLogHint[] = [];
    const ts = new Map<number, number>();
    const stamp = async (block: number) => {
      let t = ts.get(block);
      if (t === undefined) {
        try {
          t = Number((await this.client.getBlock({ blockNumber: BigInt(block) })).timestamp);
        } catch {
          t = 0;
        }
        ts.set(block, t);
      }
      return t;
    };
    for (const log of a) {
      const t = log.topics;
      const block = Number(log.blockNumber);
      if (t.length === 3) out.push({ token: getAddress(log.address), kind: "ERC20_ALLOWANCE", spender: topicAddress(t[2]!), block, timestamp: await stamp(block), txHash: log.transactionHash });
      else if (t.length === 4)
        out.push({ token: getAddress(log.address), kind: "ERC721_TOKEN", spender: topicAddress(t[2]!), tokenId: BigInt(t[3]!), block, timestamp: await stamp(block), txHash: log.transactionHash });
    }
    for (const log of b) {
      const t = log.topics;
      const block = Number(log.blockNumber);
      if (t.length === 3) out.push({ token: getAddress(log.address), kind: "OPERATOR", spender: topicAddress(t[2]!), block, timestamp: await stamp(block), txHash: log.transactionHash });
    }
    return out.filter((x) => !isAddressEqual(x.spender, ZERO_ADDRESS));
  }

  private async getLogsBisect(topics: Hex[], from: number, to: number, depth: number): Promise<RawLog[]> {
    if (depth > 12) return [];
    try {
      return (await this.call("eth_getLogs", [{ fromBlock: numberToHex(from), toBlock: numberToHex(to), topics }])) as RawLog[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/log|range|response size|limit|too many/i.test(msg) || to - from < 2) throw e;
      const mid = Math.floor((from + to) / 2);
      const [l, r] = await Promise.all([this.getLogsBisect(topics, from, mid, depth + 1), this.getLogsBisect(topics, mid + 1, to, depth + 1)]);
      return [...l, ...r];
    }
  }

  async addressInfo(address: Address): Promise<AddressInfo | null> {
    const code = await this.client.getCode({ address }).catch(() => undefined);
    const isContract = Boolean(code && code !== "0x");
    const impl = isContract ? await resolveImplementation(this.client, address) : null;
    return { isContract, isVerified: null, isScam: false, name: null, implementation: impl ? { address: impl, name: null } : null, reputation: null };
  }

  async tokenMeta(address: Address): Promise<TokenMeta | null> {
    const key = address.toLowerCase();
    if (this.metaCache.has(key)) return this.metaCache.get(key) ?? null;
    let meta: (TokenMeta & { logo?: string | null }) | null = null;
    try {
      const r = (await this.call("alchemy_getTokenMetadata", [address])) as { name: string | null; symbol: string | null; decimals: number | null; logo: string | null };
      meta = { symbol: r.symbol, name: r.name, decimals: r.decimals, type: "ERC-20", holdersCount: null, reputation: null, logo: r.logo };
    } catch {
      meta = null;
    }
    this.metaCache.set(key, meta);
    return meta;
  }

  private async call(method: string, params: unknown[]): Promise<unknown> {
    const body = (await this.post(this.rpc, { jsonrpc: "2.0", id: 1, method, params })) as { result?: unknown; error?: { message: string } };
    if (body.error) throw new Error(`alchemy ${method}: ${body.error.message}`);
    return body.result;
  }

  private async post(url: string, payload: unknown): Promise<unknown> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
      if (!res.ok) throw new Error(`alchemy http ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  private async get(url: string): Promise<unknown> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`alchemy nft http ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }
}

interface RawLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
}

function topicAddress(topic: Hex): Address {
  return getAddress(`0x${topic.slice(-40)}`);
}
