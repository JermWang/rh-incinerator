"use client";

import { useCapabilities, useConnection } from "wagmi";
import { ACTIVE_CHAIN_ID } from "@/lib/network";

export type AccountPath = "sponsored-capable" | "atomic" | "legacy";

export interface AccountCapabilities {
  loading: boolean;
  /** Wallet can route UserOperations through an ERC-7677 paymaster (EIP-5792 paymasterService). */
  paymaster: boolean;
  /** Wallet can execute a batch atomically (EIP-5792 atomic / atomicBatch). */
  atomic: boolean;
  /** Best available execution path irrespective of sponsor availability. */
  path: AccountPath;
  raw: unknown;
}

/**
 * Capability detection, run automatically after connection.
 *
 * Preferred hierarchy:
 *   1. EIP-7702 / ERC-4337 smart account exposing paymasterService  -> sponsorship possible
 *   2. Atomic batching without paymaster                            -> user-paid, single signature
 *   3. Legacy EOA                                                   -> user-paid, one transaction per operation
 *
 * Custody never changes: we only read what the wallet advertises.
 */
export function useAccountCapabilities(): AccountCapabilities {
  const { address, isConnected } = useConnection();
  const query = useCapabilities({
    account: address,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: Boolean(address && isConnected), retry: false, staleTime: 60_000 },
  });

  const caps = query.data as
    | {
        paymasterService?: { supported?: boolean };
        atomic?: { status?: string };
        atomicBatch?: { supported?: boolean };
      }
    | undefined;

  const paymaster = caps?.paymasterService?.supported === true;
  const atomic = caps?.atomic?.status === "supported" || caps?.atomic?.status === "ready" || caps?.atomicBatch?.supported === true;

  return {
    loading: query.isLoading,
    paymaster,
    atomic,
    path: paymaster ? "sponsored-capable" : atomic ? "atomic" : "legacy",
    raw: query.data,
  };
}
