import { parseEther, parseGwei } from "viem";

/**
 * Sponsor policy limits.
 *
 * These are the operational defaults. Admin overrides (stored in the sponsor
 * store) can tighten or loosen them at runtime within HARD_BOUNDS. Nothing in
 * the frontend reads this file.
 *
 * Economics are examples, not recommendations: retune on real testnet data.
 */
export interface SponsorPolicy {
  /** Per inner call. */
  MAX_GAS_PER_CALL: bigint;
  /** Sum of simulated gas across the batch, and the ceiling for callGasLimit. */
  MAX_GAS_PER_BATCH: bigint;
  MAX_CALLS_PER_BATCH: number;
  /** Bytes of UserOperation callData. */
  MAX_CALLDATA_BYTES: number;
  /** Ceilings for the non-call gas fields a wallet may request. */
  MAX_VERIFICATION_GAS: bigint;
  MAX_PRE_VERIFICATION_GAS: bigint;
  /** Absolute fee cap; also capped relative to the live base fee. */
  MAX_FEE_PER_GAS: bigint;
  MAX_FEE_MULTIPLIER_OVER_BASE: bigint;
  /** Hard cap on the worst-case cost of one sponsored UserOperation. */
  MAX_COST_PER_OPERATION: bigint;

  MAX_SPONSORED_OPS_PER_WALLET_PER_DAY: number;
  MAX_SPONSORED_GAS_PER_WALLET_PER_DAY: bigint;
  /** After this many failed simulations in the window the wallet is cooled down. */
  WALLET_FAILED_SIM_THRESHOLD: number;
  WALLET_FAILED_SIM_WINDOW_MS: number;
  WALLET_COOLDOWN_MS: number;

  /** Token contract abuse controls. */
  CONTRACT_FAILURE_THRESHOLD: number;
  CONTRACT_FAILURE_WINDOW_MS: number;
  CONTRACT_TEMP_DENY_MS: number;
  CONTRACT_SUSPICIOUS_AVG_GAS: bigint;

  MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR: bigint;
  MAX_GLOBAL_SPONSOR_SPEND_PER_DAY: bigint;
  /** Sponsorship pauses automatically below this hot balance. */
  LOW_BALANCE_THRESHOLD: bigint;

  /** Signed sponsorship validity window. */
  SPONSORSHIP_VALIDITY_SECONDS: number;
  /** Wallet session lifetime. */
  SESSION_TTL_MS: number;
}

export const DEFAULT_POLICY: SponsorPolicy = {
  MAX_GAS_PER_CALL: 250_000n,
  MAX_GAS_PER_BATCH: 2_500_000n,
  MAX_CALLS_PER_BATCH: 25,
  MAX_CALLDATA_BYTES: 12_000,
  MAX_VERIFICATION_GAS: 1_500_000n,
  MAX_PRE_VERIFICATION_GAS: 1_000_000n,
  MAX_FEE_PER_GAS: parseGwei("1"),
  MAX_FEE_MULTIPLIER_OVER_BASE: 8n,
  MAX_COST_PER_OPERATION: parseEther("0.002"),

  MAX_SPONSORED_OPS_PER_WALLET_PER_DAY: 10,
  MAX_SPONSORED_GAS_PER_WALLET_PER_DAY: 6_000_000n,
  WALLET_FAILED_SIM_THRESHOLD: 5,
  WALLET_FAILED_SIM_WINDOW_MS: 60 * 60 * 1000,
  WALLET_COOLDOWN_MS: 15 * 60 * 1000,

  CONTRACT_FAILURE_THRESHOLD: 6,
  CONTRACT_FAILURE_WINDOW_MS: 24 * 60 * 60 * 1000,
  CONTRACT_TEMP_DENY_MS: 24 * 60 * 60 * 1000,
  CONTRACT_SUSPICIOUS_AVG_GAS: 200_000n,

  MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR: parseEther("0.01"),
  MAX_GLOBAL_SPONSOR_SPEND_PER_DAY: parseEther("0.05"),
  LOW_BALANCE_THRESHOLD: parseEther("0.003"),

  SPONSORSHIP_VALIDITY_SECONDS: 5 * 60,
  SESSION_TTL_MS: 30 * 60 * 1000,
};

/** Admin overrides can never exceed these. */
export const HARD_BOUNDS = {
  MAX_GAS_PER_CALL: 1_000_000n,
  MAX_GAS_PER_BATCH: 8_000_000n,
  MAX_CALLS_PER_BATCH: 50,
  MAX_FEE_PER_GAS: parseGwei("10"),
  MAX_COST_PER_OPERATION: parseEther("0.01"),
  MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR: parseEther("0.1"),
  MAX_GLOBAL_SPONSOR_SPEND_PER_DAY: parseEther("0.5"),
} as const;

/** Keys an admin may override at runtime. */
export const OVERRIDABLE_KEYS = [
  "MAX_GAS_PER_CALL",
  "MAX_GAS_PER_BATCH",
  "MAX_CALLS_PER_BATCH",
  "MAX_FEE_PER_GAS",
  "MAX_COST_PER_OPERATION",
  "MAX_SPONSORED_OPS_PER_WALLET_PER_DAY",
  "MAX_SPONSORED_GAS_PER_WALLET_PER_DAY",
  "MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR",
  "MAX_GLOBAL_SPONSOR_SPEND_PER_DAY",
  "LOW_BALANCE_THRESHOLD",
] as const satisfies readonly (keyof SponsorPolicy)[];
export type OverridableKey = (typeof OVERRIDABLE_KEYS)[number];

export type PolicyOverrides = Partial<Record<OverridableKey, string>>;

/** Merge stored overrides into the default policy, clamping to hard bounds. */
export function resolvePolicy(overrides: PolicyOverrides | null | undefined): SponsorPolicy {
  const p: SponsorPolicy = { ...DEFAULT_POLICY };
  if (!overrides) return p;
  for (const key of OVERRIDABLE_KEYS) {
    const raw = overrides[key];
    if (raw === undefined) continue;
    if (typeof DEFAULT_POLICY[key] === "bigint") {
      let v = BigInt(raw);
      const bound = (HARD_BOUNDS as Record<string, bigint | number | undefined>)[key];
      if (typeof bound === "bigint" && v > bound) v = bound;
      if (v < 0n) v = 0n;
      (p as unknown as Record<string, unknown>)[key] = v;
    } else {
      let v = Number(raw);
      const bound = (HARD_BOUNDS as Record<string, bigint | number | undefined>)[key];
      if (typeof bound === "number" && v > bound) v = bound;
      if (!Number.isFinite(v) || v < 0) v = 0;
      (p as unknown as Record<string, unknown>)[key] = Math.floor(v);
    }
  }
  return p;
}

export function serializePolicy(p: SponsorPolicy): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) out[k] = typeof v === "bigint" ? v.toString() : v;
  return out;
}
