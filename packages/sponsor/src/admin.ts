import { timingSafeEqual } from "node:crypto";
import { getAddress, type Address } from "viem";
import { OVERRIDABLE_KEYS, resolvePolicy, type PolicyOverrides, type SponsorPolicy } from "./config";
import { invalidateStatusCache } from "./status";
import { SETTING_OVERRIDES, SETTING_PAUSED, type SponsorStore } from "./store";

/**
 * Internal admin operations. No treasury key operations live here; treasury
 * control is a hardware-wallet / multisig process outside this application.
 */

export function checkAdminToken(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function pauseSponsorship(store: SponsorStore): Promise<void> {
  await store.setSetting(SETTING_PAUSED, true);
  invalidateStatusCache();
}

export async function resumeSponsorship(store: SponsorStore): Promise<void> {
  await store.setSetting(SETTING_PAUSED, false);
  invalidateStatusCache();
}

export async function isPaused(store: SponsorStore): Promise<boolean> {
  return (await store.getSetting<boolean>(SETTING_PAUSED)) === true;
}

export async function loadPolicy(store: SponsorStore): Promise<SponsorPolicy> {
  const overrides = await store.getSetting<PolicyOverrides>(SETTING_OVERRIDES);
  return resolvePolicy(overrides);
}

export async function setPolicyOverrides(store: SponsorStore, patch: Record<string, string>): Promise<PolicyOverrides> {
  const current = (await store.getSetting<PolicyOverrides>(SETTING_OVERRIDES)) ?? {};
  const next: PolicyOverrides = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (!(OVERRIDABLE_KEYS as readonly string[]).includes(k)) throw new Error(`policy key ${k} is not overridable`);
    if (v === "" || v === "default") delete next[k as keyof PolicyOverrides];
    else {
      if (!/^\d+$/.test(v)) throw new Error(`policy value for ${k} must be a non-negative integer`);
      next[k as keyof PolicyOverrides] = v;
    }
  }
  await store.setSetting(SETTING_OVERRIDES, next);
  invalidateStatusCache();
  return next;
}

export async function denylistContract(store: SponsorStore, address: string, reason: string | null, ttlMs: number | null): Promise<void> {
  const a = getAddress(address);
  await store.setContractDenylist(a, ttlMs === null, reason, ttlMs === null ? null : Date.now() + ttlMs);
}

export async function undenylistContract(store: SponsorStore, address: string): Promise<void> {
  await store.setContractDenylist(getAddress(address) as Address, false, null, null);
}

export async function inspect(store: SponsorStore, now = Date.now()) {
  const [paused, overrides, hour, day, sponsored, failed, refills, denylist, metrics] = await Promise.all([
    isPaused(store),
    store.getSetting<PolicyOverrides>(SETTING_OVERRIDES),
    store.getSpend(now - 60 * 60 * 1000),
    store.getSpend(now - 24 * 60 * 60 * 1000),
    store.listSponsoredOperations(50),
    store.listFailedSimulations(50),
    store.listRefills(20),
    store.listDenylisted(),
    store.metrics(now),
  ]);
  return {
    paused,
    overrides: overrides ?? {},
    policy: resolvePolicy(overrides),
    spend: { hour, day },
    sponsored,
    failedSimulations: failed,
    refills,
    denylist,
    metrics,
  };
}
