import type { Address, Hex } from "viem";
import { EXPLORER_URL, type SupportedChainId } from "./constants";

/**
 * Thin, typed client for the Blockscout API used as an indexer for the scanner.
 *
 * Only read-only metadata is cached. Balances, allowances and ownership are
 * always re-read on-chain by the scanner; the indexer is a discovery hint.
 *
 * The mainnet instance sits behind a bot challenge that rejects non-browser
 * user agents; a browser-like UA is sent deliberately. An optional API key is
 * forwarded as `apikey` for higher rate limits.
 */

export interface BsToken {
  address_hash: Address;
  name: string | null;
  symbol: string | null;
  decimals: string | null;
  type: "ERC-20" | "ERC-721" | "ERC-1155" | string;
  holders_count: string | null;
  exchange_rate: string | null;
  icon_url: string | null;
  reputation: string | null;
  total_supply: string | null;
}

export interface BsTokenBalance {
  token: BsToken;
  value: string;
  token_id: string | null;
  token_instance: BsNftInstance | null;
}

export interface BsNftInstance {
  id: string;
  image_url: string | null;
  media_url?: string | null;
  metadata: { name?: string; image?: string } | null;
  token: BsToken;
  token_type: string;
  value?: string | null;
}

export interface BsAddressInfo {
  hash: Address;
  is_contract: boolean;
  is_verified: boolean;
  is_scam: boolean;
  name: string | null;
  proxy_type: string | null;
  implementations: { address_hash: Address; name: string | null }[];
  reputation: string | null;
  creator_address_hash: Address | null;
}

export interface BsLegacyLog {
  address: Address;
  topics: (Hex | null)[];
  data: Hex;
  blockNumber: Hex;
  timeStamp: Hex;
  transactionHash: Hex;
  logIndex: Hex;
}

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const METADATA_TTL_MS = 10 * 60 * 1000;
/** Blockscout's legacy log endpoint caps a single response at this many records. */
const LEGACY_LOG_PAGE = 1000;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 incinerator-scanner/0.1";

export class BlockscoutError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "BlockscoutError";
  }
}

export class BlockscoutClient {
  readonly baseUrl: string;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly timeoutMs: number;
  private readonly apiKey: string | undefined;

  constructor(
    readonly chainId: SupportedChainId,
    opts: { baseUrl?: string; timeoutMs?: number; apiKey?: string | undefined } = {},
  ) {
    this.baseUrl = opts.baseUrl ?? EXPLORER_URL[chainId];
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.apiKey = opts.apiKey;
  }

  /** ERC-20 balances the indexer knows about. Values are indexer hints, not truth. */
  async addressTokens(address: Address, type: "ERC-20" | "ERC-721,ERC-1155", maxPages = 8): Promise<BsTokenBalance[]> {
    return this.paginate<BsTokenBalance>(`/api/v2/addresses/${address}/tokens`, { type }, maxPages);
  }

  /** NFT instances (ERC-721 tokens and ERC-1155 ids) the indexer attributes to the address. */
  async addressNfts(address: Address, maxPages = 6): Promise<BsNftInstance[]> {
    return this.paginate<BsNftInstance>(`/api/v2/addresses/${address}/nft`, { type: "ERC-721,ERC-1155" }, maxPages);
  }

  async addressInfo(address: Address): Promise<BsAddressInfo | null> {
    return this.cached(`addr:${address.toLowerCase()}`, async () => {
      const res = await this.get(`/api/v2/addresses/${address}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new BlockscoutError(`address info ${res.status}`, res.status);
      return (await res.json()) as BsAddressInfo;
    });
  }

  async tokenInfo(address: Address): Promise<BsToken | null> {
    return this.cached(`token:${address.toLowerCase()}`, async () => {
      const res = await this.get(`/api/v2/tokens/${address}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new BlockscoutError(`token info ${res.status}`, res.status);
      return (await res.json()) as BsToken;
    });
  }

  /**
   * Indexed log query (legacy API). Serves owner-filtered Approval queries across
   * full chain history without brute-force eth_getLogs. One page only.
   */
  async logs(params: { topic0: Hex; topic1?: Hex; fromBlock?: number; toBlock?: number | "latest" }): Promise<BsLegacyLog[]> {
    const q = new URLSearchParams({
      module: "logs",
      action: "getLogs",
      fromBlock: String(params.fromBlock ?? 0),
      toBlock: String(params.toBlock ?? "latest"),
      topic0: params.topic0,
    });
    if (params.topic1) {
      q.set("topic1", params.topic1);
      q.set("topic0_1_opr", "and");
    }
    const res = await this.get(`/api?${q.toString()}`);
    if (!res.ok) throw new BlockscoutError(`logs ${res.status}`, res.status);
    const body = (await res.json()) as { message: string; result: BsLegacyLog[] | string };
    if (!Array.isArray(body.result)) {
      // "No records found" comes back as message NOTOK with string result.
      if (typeof body.result === "string" && /no records/i.test(body.result)) return [];
      if (typeof body.result === "string" && /no records/i.test(body.message)) return [];
      throw new BlockscoutError(`logs: ${body.message}`);
    }
    return body.result;
  }

  /**
   * Full-history log query. When a page comes back full, continue from the
   * last block seen so wallets with thousands of approvals are not truncated.
   */
  async logsPaged(params: { topic0: Hex; topic1?: Hex; fromBlock?: number }, maxPages = 20): Promise<BsLegacyLog[]> {
    const out: BsLegacyLog[] = [];
    let from = params.fromBlock ?? 0;
    const seen = new Set<string>();
    for (let page = 0; page < maxPages; page++) {
      const batch = await this.logs({ ...params, fromBlock: from });
      for (const l of batch) {
        const key = `${l.transactionHash}:${l.logIndex}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(l);
        }
      }
      if (batch.length < LEGACY_LOG_PAGE) break;
      const lastBlock = Math.max(...batch.map((l) => Number(l.blockNumber)));
      if (!Number.isFinite(lastBlock) || lastBlock < from) break;
      // Re-query from the last block (inclusive) to avoid dropping logs that share it; de-duplicated above.
      from = lastBlock;
    }
    return out;
  }

  private async paginate<T>(path: string, base: Record<string, string>, maxPages: number): Promise<T[]> {
    const items: T[] = [];
    let next: Record<string, unknown> | null = null;
    for (let page = 0; page < maxPages; page++) {
      const q = new URLSearchParams(base);
      if (next) for (const [k, v] of Object.entries(next)) q.set(k, String(v));
      const res = await this.get(`${path}?${q.toString()}`);
      if (res.status === 404) break;
      if (!res.ok) throw new BlockscoutError(`${path} ${res.status}`, res.status);
      const body = (await res.json()) as { items: T[]; next_page_params: Record<string, unknown> | null };
      items.push(...(body.items ?? []));
      next = body.next_page_params;
      if (!next) break;
    }
    return items;
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    const now = Date.now();
    if (hit && hit.expires > now) return hit.value as T;
    const value = await load();
    this.cache.set(key, { value, expires: now + METADATA_TTL_MS });
    if (this.cache.size > 5000) {
      for (const [k, v] of this.cache) if (v.expires <= now) this.cache.delete(k);
    }
    return value;
  }

  private async get(path: string): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    const url = new URL(`${this.baseUrl}${path}`);
    if (this.apiKey) url.searchParams.set("apikey", this.apiKey);
    try {
      return await fetch(url, {
        headers: { accept: "application/json", "user-agent": BROWSER_UA },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }
}

const clients = new Map<string, BlockscoutClient>();
export function getBlockscout(chainId: SupportedChainId, apiKey?: string | undefined): BlockscoutClient {
  const key = `${chainId}:${apiKey ?? ""}`;
  let c = clients.get(key);
  if (!c) {
    c = new BlockscoutClient(chainId, { apiKey });
    clients.set(key, c);
  }
  return c;
}
