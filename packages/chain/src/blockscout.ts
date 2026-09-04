import type { Address, Hex } from "viem";
import { EXPLORER_URL, type SupportedChainId } from "./constants";

/**
 * Thin, typed client for the Blockscout API used as the indexer for the scanner.
 *
 * Only read-only metadata is cached. Balances, allowances and ownership are
 * always re-read on-chain by the scanner; the indexer is a discovery hint.
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

  constructor(
    readonly chainId: SupportedChainId,
    opts: { baseUrl?: string; timeoutMs?: number } = {},
  ) {
    this.baseUrl = opts.baseUrl ?? EXPLORER_URL[chainId];
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
   * full chain history without brute-force eth_getLogs.
   */
  async logs(params: { topic0: Hex; topic1?: Hex; fromBlock?: number }): Promise<BsLegacyLog[]> {
    const q = new URLSearchParams({
      module: "logs",
      action: "getLogs",
      fromBlock: String(params.fromBlock ?? 0),
      toBlock: "latest",
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
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        headers: { accept: "application/json", "user-agent": "incinerator-scanner/0.1" },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }
}

const clients = new Map<SupportedChainId, BlockscoutClient>();
export function getBlockscout(chainId: SupportedChainId): BlockscoutClient {
  let c = clients.get(chainId);
  if (!c) {
    c = new BlockscoutClient(chainId);
    clients.set(chainId, c);
  }
  return c;
}
