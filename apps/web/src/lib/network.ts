import {
  CHAIN_DISPLAY_NAME,
  EXPLORER_URL,
  ROBINHOOD_CHAIN_MAINNET_ID,
  ROBINHOOD_CHAIN_TESTNET_ID,
  chainById,
  explorerAddressUrl,
  explorerTokenUrl,
  explorerTxUrl,
  type SupportedChainId,
} from "@incinerator/chain";

/** Client-safe network selection. Testnet unless explicitly set to mainnet. */
export const ACTIVE_NETWORK: "testnet" | "mainnet" =
  process.env.NEXT_PUBLIC_INCINERATOR_NETWORK === "mainnet" ? "mainnet" : "testnet";

export const ACTIVE_CHAIN_ID: SupportedChainId =
  ACTIVE_NETWORK === "mainnet" ? ROBINHOOD_CHAIN_MAINNET_ID : ROBINHOOD_CHAIN_TESTNET_ID;

export const activeChain = chainById(ACTIVE_CHAIN_ID);
export const activeChainName = CHAIN_DISPLAY_NAME[ACTIVE_CHAIN_ID];
export const activeExplorer = EXPLORER_URL[ACTIVE_CHAIN_ID];
export const IS_TESTNET = ACTIVE_NETWORK === "testnet";

export const txUrl = (hash: string) => explorerTxUrl(ACTIVE_CHAIN_ID, hash);
export const addressUrl = (a: string) => explorerAddressUrl(ACTIVE_CHAIN_ID, a);
export const tokenUrl = (a: string) => explorerTokenUrl(ACTIVE_CHAIN_ID, a);
