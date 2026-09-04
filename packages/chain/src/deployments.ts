import type { Address } from "viem";
import {
  ENTRYPOINT_V07,
  ROBINHOOD_CHAIN_MAINNET_ID,
  ROBINHOOD_CHAIN_TESTNET_ID,
  type SupportedChainId,
} from "./constants";

/**
 * Deployed sponsor infrastructure per network.
 *
 * Addresses are filled in by `packages/contracts/script/Deploy.s.sol` output.
 * Undefined means "not deployed on this network"; every consumer must treat
 * that as sponsorship unavailable (fail closed) and the transparency page must
 * say so instead of showing zeros.
 */
export interface Deployment {
  entryPoint: Address;
  feeRouter?: Address;
  sponsorReserve?: Address;
  paymaster?: Address;
  /** Cold creator-fee treasury. Read-only reference for transparency; never touched by the app. */
  treasury?: Address;
  deployedAtBlock?: number;
}

export const DEPLOYMENTS: Record<SupportedChainId, Deployment> = {
  [ROBINHOOD_CHAIN_TESTNET_ID]: {
    entryPoint: ENTRYPOINT_V07,
  },
  [ROBINHOOD_CHAIN_MAINNET_ID]: {
    entryPoint: ENTRYPOINT_V07,
  },
};

export function getDeployment(chainId: SupportedChainId): Deployment {
  return DEPLOYMENTS[chainId];
}

export function sponsorContractsDeployed(chainId: SupportedChainId): boolean {
  const d = DEPLOYMENTS[chainId];
  return Boolean(d.sponsorReserve && d.paymaster);
}
