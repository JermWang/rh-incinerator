import { createPublicClient, http, type PublicClient } from "viem";
import { chainById } from "./chains";
import { ALCHEMY_NETWORK_SLUG, PUBLIC_RPC, type SupportedChainId } from "./constants";

export interface ClientOptions {
  /** Server-side only. When set, RPC goes through Alchemy; otherwise the public endpoint. */
  alchemyApiKey?: string | undefined;
  /** Override RPC URL (tests). */
  rpcUrl?: string | undefined;
}

export function rpcUrlFor(chainId: SupportedChainId, opts: ClientOptions = {}): string {
  if (opts.rpcUrl) return opts.rpcUrl;
  if (opts.alchemyApiKey) return `https://${ALCHEMY_NETWORK_SLUG[chainId]}.g.alchemy.com/v2/${opts.alchemyApiKey}`;
  return PUBLIC_RPC[chainId];
}

export function createChainClient(chainId: SupportedChainId, opts: ClientOptions = {}): PublicClient {
  return createPublicClient({
    chain: chainById(chainId),
    // No JSON-RPC HTTP batching: the public gateway rejects large payloads (429),
    // and a batch-level error would mask individual results. Multicall batching
    // of reads stays on (one eth_call).
    transport: http(rpcUrlFor(chainId, opts), { batch: false, timeout: 20_000, retryCount: 2, retryDelay: 400 }),
    batch: { multicall: { batchSize: 2048, wait: 8 } },
  });
}
