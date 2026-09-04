import type { Address, Hex } from "viem";

/** Robinhood Chain mainnet chain id. */
export const ROBINHOOD_CHAIN_MAINNET_ID = 4663 as const;
/** Robinhood Chain testnet chain id. */
export const ROBINHOOD_CHAIN_TESTNET_ID = 46630 as const;

export type SupportedChainId =
  | typeof ROBINHOOD_CHAIN_MAINNET_ID
  | typeof ROBINHOOD_CHAIN_TESTNET_ID;

export const SUPPORTED_CHAIN_IDS: readonly SupportedChainId[] = [
  ROBINHOOD_CHAIN_TESTNET_ID,
  ROBINHOOD_CHAIN_MAINNET_ID,
];

export function isSupportedChainId(id: number | undefined): id is SupportedChainId {
  return id === ROBINHOOD_CHAIN_MAINNET_ID || id === ROBINHOOD_CHAIN_TESTNET_ID;
}

/** Canonical burn sink for assets without a native burn function. */
export const DEAD_ADDRESS: Address = "0x000000000000000000000000000000000000dEaD";
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** Canonical Multicall3 deployment (verified present on both networks). */
export const MULTICALL3_ADDRESS: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** ERC-4337 EntryPoints deployed on Robinhood Chain (docs.robinhood.com/chain/account-abstraction). */
export const ENTRYPOINT_V06: Address = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
export const ENTRYPOINT_V07: Address = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
export const ENTRYPOINT_V08: Address = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108";

export const PUBLIC_RPC: Record<SupportedChainId, string> = {
  [ROBINHOOD_CHAIN_MAINNET_ID]: "https://rpc.mainnet.chain.robinhood.com",
  [ROBINHOOD_CHAIN_TESTNET_ID]: "https://rpc.testnet.chain.robinhood.com",
};

export const EXPLORER_URL: Record<SupportedChainId, string> = {
  [ROBINHOOD_CHAIN_MAINNET_ID]: "https://robinhoodchain.blockscout.com",
  [ROBINHOOD_CHAIN_TESTNET_ID]: "https://explorer.testnet.chain.robinhood.com",
};

/** Alchemy network slugs (https://<slug>.g.alchemy.com/v2/<key>). */
export const ALCHEMY_NETWORK_SLUG: Record<SupportedChainId, string> = {
  [ROBINHOOD_CHAIN_MAINNET_ID]: "robinhood-mainnet",
  [ROBINHOOD_CHAIN_TESTNET_ID]: "robinhood-testnet",
};

export const CHAIN_DISPLAY_NAME: Record<SupportedChainId, string> = {
  [ROBINHOOD_CHAIN_MAINNET_ID]: "Robinhood Chain",
  [ROBINHOOD_CHAIN_TESTNET_ID]: "Robinhood Chain Testnet",
};

/** Event topics used by the approval scanner. */
export const TOPIC_APPROVAL: Hex =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"; // Approval(address,address,uint256)
export const TOPIC_APPROVAL_FOR_ALL: Hex =
  "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31"; // ApprovalForAll(address,address,bool)
export const TOPIC_TRANSFER: Hex =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)

export const MAX_UINT256 = (1n << 256n) - 1n;

export function explorerAddressUrl(chainId: SupportedChainId, address: string): string {
  return `${EXPLORER_URL[chainId]}/address/${address}`;
}
export function explorerTxUrl(chainId: SupportedChainId, hash: string): string {
  return `${EXPLORER_URL[chainId]}/tx/${hash}`;
}
export function explorerTokenUrl(chainId: SupportedChainId, address: string): string {
  return `${EXPLORER_URL[chainId]}/token/${address}`;
}
