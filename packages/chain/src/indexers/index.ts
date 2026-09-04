import type { PublicClient } from "viem";
import { getBlockscout } from "../blockscout";
import type { SupportedChainId } from "../constants";
import type { IndexerProvider } from "../indexer";
import { AlchemyProvider } from "./alchemy-provider";
import { BlockscoutProvider } from "./blockscout-provider";
import { CompositeProvider } from "./composite-provider";

export { AlchemyProvider } from "./alchemy-provider";
export { BlockscoutProvider } from "./blockscout-provider";
export { CompositeProvider } from "./composite-provider";

export interface IndexerOptions {
  alchemyApiKey?: string | undefined;
  blockscoutApiKey?: string | undefined;
}

/**
 * Discovery: Alchemy when a key exists (higher limits, mainnet-safe), else
 * Blockscout. Explorer metadata (verification, reputation, names) is always
 * layered in best-effort; proxy implementations are confirmed on-chain.
 */
export function createIndexer(chainId: SupportedChainId, client: PublicClient, opts: IndexerOptions = {}): IndexerProvider {
  const blockscout = new BlockscoutProvider(getBlockscout(chainId, opts.blockscoutApiKey), chainId);
  if (opts.alchemyApiKey) {
    return new CompositeProvider(new AlchemyProvider(opts.alchemyApiKey, chainId, client), blockscout, client);
  }
  return new CompositeProvider(blockscout, null, client);
}
