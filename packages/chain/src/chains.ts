import { defineChain, type Chain } from "viem";
import {
  EXPLORER_URL,
  MULTICALL3_ADDRESS,
  PUBLIC_RPC,
  ROBINHOOD_CHAIN_MAINNET_ID,
  ROBINHOOD_CHAIN_TESTNET_ID,
  type SupportedChainId,
} from "./constants";

/**
 * Robinhood Chain mainnet. Arbitrum Orbit (Nitro) L2 settling to Ethereum.
 * Public name must always be "Robinhood Chain".
 */
export const robinhoodChain: Chain = defineChain({
  id: ROBINHOOD_CHAIN_MAINNET_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [PUBLIC_RPC[ROBINHOOD_CHAIN_MAINNET_ID]] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: EXPLORER_URL[ROBINHOOD_CHAIN_MAINNET_ID],
      apiUrl: `${EXPLORER_URL[ROBINHOOD_CHAIN_MAINNET_ID]}/api`,
    },
  },
  contracts: { multicall3: { address: MULTICALL3_ADDRESS } },
});

export const robinhoodChainTestnet: Chain = defineChain({
  id: ROBINHOOD_CHAIN_TESTNET_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [PUBLIC_RPC[ROBINHOOD_CHAIN_TESTNET_ID]] } },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: EXPLORER_URL[ROBINHOOD_CHAIN_TESTNET_ID],
      apiUrl: `${EXPLORER_URL[ROBINHOOD_CHAIN_TESTNET_ID]}/api`,
    },
  },
  contracts: { multicall3: { address: MULTICALL3_ADDRESS } },
  testnet: true,
});

export const CHAINS: Record<SupportedChainId, Chain> = {
  [ROBINHOOD_CHAIN_MAINNET_ID]: robinhoodChain,
  [ROBINHOOD_CHAIN_TESTNET_ID]: robinhoodChainTestnet,
};

export function chainById(id: SupportedChainId): Chain {
  return CHAINS[id];
}
