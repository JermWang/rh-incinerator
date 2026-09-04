import type { Address } from "viem";
import { entryPointAbi, type Deployment, type SupportedChainId } from "@incinerator/chain";
import { serializePolicy, type SponsorPolicy } from "./config";
import type { SponsorBackend } from "./env";
import { SETTING_PAUSED, type SponsorStore } from "./store";

export type SponsorState =
  | "ACTIVE"
  | "PAUSED"
  | "LOW_BALANCE"
  | "BUDGET_EXHAUSTED"
  | "NOT_CONFIGURED"
  | "NOT_DEPLOYED";

export interface SponsorStatus {
  chainId: SupportedChainId;
  backend: SponsorBackend;
  active: boolean;
  state: SponsorState;
  reason: string;
  /** Paymaster EntryPoint deposit (self backend). Null when not on-chain verifiable. */
  hotBalanceWei: string | null;
  /** SponsorReserve contract balance. */
  reserveBalanceWei: string | null;
  spend: { hourWei: string; dayWei: string; hourLimitWei: string; dayLimitWei: string; opsHour: number; opsDay: number };
  contracts: {
    entryPoint: Address;
    paymaster: Address | null;
    sponsorReserve: Address | null;
    feeRouter: Address | null;
    treasury: Address | null;
  };
  limits: Record<string, string | number>;
  checkedAt: number;
}

export interface StatusDeps {
  chainId: SupportedChainId;
  backend: SponsorBackend;
  client: { getBalance: (a: { address: Address }) => Promise<bigint>; readContract: (a: never) => Promise<unknown> };
  store: SponsorStore;
  policy: SponsorPolicy;
  deployment: Deployment;
  now: () => number;
}

let cache: { key: string; value: SponsorStatus; expires: number } | null = null;
const STATUS_TTL_MS = 10_000;

export async function getSponsorStatus(deps: StatusDeps, opts: { fresh?: boolean } = {}): Promise<SponsorStatus> {
  const now = deps.now();
  const key = `${deps.chainId}:${deps.backend}`;
  if (!opts.fresh && cache && cache.key === key && cache.expires > now) return cache.value;

  const d = deps.deployment;
  const contracts = {
    entryPoint: d.entryPoint,
    paymaster: d.paymaster ?? null,
    sponsorReserve: d.sponsorReserve ?? null,
    feeRouter: d.feeRouter ?? null,
    treasury: d.treasury ?? null,
  };

  const [hour, day, paused] = await Promise.all([
    deps.store.getSpend(now - 60 * 60 * 1000),
    deps.store.getSpend(now - 24 * 60 * 60 * 1000),
    deps.store.getSetting<boolean>(SETTING_PAUSED),
  ]);

  let hotBalanceWei: bigint | null = null;
  let reserveBalanceWei: bigint | null = null;
  if (d.paymaster) {
    try {
      hotBalanceWei = (await deps.client.readContract({
        address: d.entryPoint,
        abi: entryPointAbi,
        functionName: "balanceOf",
        args: [d.paymaster],
      } as never)) as bigint;
    } catch {
      hotBalanceWei = null;
    }
  }
  if (d.sponsorReserve) {
    try {
      reserveBalanceWei = await deps.client.getBalance({ address: d.sponsorReserve });
    } catch {
      reserveBalanceWei = null;
    }
  }

  let state: SponsorState = "ACTIVE";
  let reason = "Sponsorship active";
  if (deps.backend === "none") {
    state = "NOT_CONFIGURED";
    reason = "No sponsor backend configured on this deployment";
  } else if (deps.backend === "self" && !d.paymaster) {
    state = "NOT_DEPLOYED";
    reason = "Sponsor contracts are not deployed on this network";
  } else if (paused) {
    state = "PAUSED";
    reason = "Sponsorship paused by operator";
  } else if (deps.backend === "self" && hotBalanceWei !== null && hotBalanceWei < deps.policy.LOW_BALANCE_THRESHOLD) {
    state = "LOW_BALANCE";
    reason = "Sponsor hot balance below threshold";
  } else if (deps.backend === "self" && hotBalanceWei === null) {
    state = "NOT_DEPLOYED";
    reason = "Could not read paymaster deposit";
  } else if (
    hour.spentWei >= deps.policy.MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR ||
    day.spentWei >= deps.policy.MAX_GLOBAL_SPONSOR_SPEND_PER_DAY
  ) {
    state = "BUDGET_EXHAUSTED";
    reason = "Global sponsor budget exhausted for the current window";
  }

  const value: SponsorStatus = {
    chainId: deps.chainId,
    backend: deps.backend,
    active: state === "ACTIVE",
    state,
    reason,
    hotBalanceWei: hotBalanceWei?.toString() ?? null,
    reserveBalanceWei: reserveBalanceWei?.toString() ?? null,
    spend: {
      hourWei: hour.spentWei.toString(),
      dayWei: day.spentWei.toString(),
      hourLimitWei: deps.policy.MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR.toString(),
      dayLimitWei: deps.policy.MAX_GLOBAL_SPONSOR_SPEND_PER_DAY.toString(),
      opsHour: hour.ops,
      opsDay: day.ops,
    },
    contracts,
    limits: serializePolicy(deps.policy),
    checkedAt: now,
  };
  cache = { key, value, expires: now + STATUS_TTL_MS };
  return value;
}

export function invalidateStatusCache(): void {
  cache = null;
}
