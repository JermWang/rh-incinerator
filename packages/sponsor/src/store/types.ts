import type { Address, Hex } from "viem";
import type { PolicyOverrides } from "../config";

/**
 * Persistence contract for the sponsor. Only operationally necessary state.
 * No user profiles, no signatures beyond hashes, no keys.
 */

export interface WalletUsage {
  ops: number;
  gas: bigint;
  failedSims: number;
  failedSimTimestamps: number[];
  cooldownUntil: number | null;
}

export interface ContractRiskState {
  address: Address;
  failureTimestamps: number[];
  successes: number;
  gasSamples: number;
  gasTotal: bigint;
  denyUntil: number | null;
  manualDeny: boolean;
  reason: string | null;
  updatedAt: number;
}

export type SponsoredStatus = "RESERVED" | "SUBMITTED" | "CONFIRMED" | "FAILED" | "EXPIRED";

export interface SponsoredOperation {
  id: string;
  chainId: number;
  wallet: Address;
  userOpHash: Hex | null;
  txHash: Hex | null;
  kinds: string[];
  callCount: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  /** Worst-case cost reserved against budgets at sponsorship time. */
  reservedCostWei: bigint;
  /** Actual cost once the receipt is known. */
  actualCostWei: bigint | null;
  status: SponsoredStatus;
  createdAt: number;
  confirmedAt: number | null;
}

export interface FailedSimulation {
  id: string;
  chainId: number;
  wallet: Address;
  token: Address;
  kind: string;
  reason: string;
  createdAt: number;
}

export interface RefillRecord {
  txHash: Hex;
  chainId: number;
  amountWei: bigint;
  hotBalanceAfter: bigint;
  keeper: Address;
  blockNumber: number;
  createdAt: number;
}

export interface CleanupRecord {
  id: string;
  chainId: number;
  wallet: Address;
  txHash: Hex | null;
  userOpHash: Hex | null;
  kinds: string[];
  sponsored: boolean;
  status: "SUBMITTED" | "CONFIRMED" | "FAILED";
  createdAt: number;
}

export interface SpendWindow {
  /** Sum of reserved cost for non-final ops plus actual cost for confirmed ops in the window. */
  spentWei: bigint;
  ops: number;
}

export interface Metrics {
  gas24hWei: bigint;
  ops24h: number;
  lifetimeGasWei: bigint;
  lifetimeOps: number;
  lastRefill: RefillRecord | null;
}

export interface SponsorStore {
  // wallet limits
  getWalletUsage(wallet: Address, day: string): Promise<WalletUsage>;
  recordWalletSponsoredOp(wallet: Address, day: string, gas: bigint): Promise<void>;
  recordWalletFailedSimulation(wallet: Address, day: string, at: number, cooldownUntil: number | null): Promise<void>;

  // contract risk
  getContractRisk(address: Address): Promise<ContractRiskState | null>;
  recordContractResult(address: Address, ok: boolean, gasUsed: bigint | null, at: number, denyUntil: number | null): Promise<void>;
  setContractDenylist(address: Address, manual: boolean, reason: string | null, denyUntil: number | null): Promise<void>;
  listDenylisted(): Promise<ContractRiskState[]>;

  // global spend
  getSpend(sinceMs: number): Promise<SpendWindow>;
  insertSponsoredOperation(op: SponsoredOperation): Promise<void>;
  updateSponsoredOperation(id: string, patch: Partial<SponsoredOperation>): Promise<void>;
  findSponsoredByUserOpHash(hash: Hex): Promise<SponsoredOperation | null>;
  listSponsoredOperations(limit: number): Promise<SponsoredOperation[]>;
  expireStaleReservations(olderThanMs: number): Promise<number>;

  // failed sims
  insertFailedSimulation(f: FailedSimulation): Promise<void>;
  listFailedSimulations(limit: number): Promise<FailedSimulation[]>;

  // refills & cleanups
  upsertRefill(r: RefillRecord): Promise<void>;
  listRefills(limit: number): Promise<RefillRecord[]>;
  insertCleanup(c: CleanupRecord): Promise<void>;
  updateCleanup(id: string, patch: Partial<CleanupRecord>): Promise<void>;
  listCleanupsForWallet(wallet: Address, limit: number): Promise<CleanupRecord[]>;

  // settings
  getSetting<T>(key: string): Promise<T | null>;
  setSetting<T>(key: string, value: T): Promise<void>;

  // siwe nonces
  putNonce(nonce: string, expiresAt: number): Promise<void>;
  consumeNonce(nonce: string, now: number): Promise<boolean>;

  // rate limiting (shared across instances when backed by Postgres)
  consumeRateLimit(key: string, limit: number, windowMs: number, now: number): Promise<boolean>;

  // reconciliation
  listUnsettledSponsoredOperations(limit: number): Promise<SponsoredOperation[]>;

  metrics(now: number): Promise<Metrics>;
}

export const SETTING_PAUSED = "sponsor.paused";
export const SETTING_OVERRIDES = "sponsor.policyOverrides";

export type StoredOverrides = PolicyOverrides;

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
