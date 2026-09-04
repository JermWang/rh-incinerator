import { parseEther } from "viem";
import { describe, expect, it } from "vitest";
import { ROBINHOOD_CHAIN_TESTNET_ID } from "@incinerator/chain";
import { reconcileSponsoredOperations } from "../src/reconcile";
import { MemoryStore, type SponsoredOperation } from "../src/store";
import { WALLET } from "./helpers";
import type { PublicClient } from "viem";

const now = 1_800_000_000_000;

function op(over: Partial<SponsoredOperation> = {}): SponsoredOperation {
  return {
    id: `op-${Math.random().toString(36).slice(2, 8)}`,
    chainId: ROBINHOOD_CHAIN_TESTNET_ID,
    wallet: WALLET,
    userOpHash: `0x${"11".repeat(32)}`,
    txHash: null,
    kinds: ["ERC20_DEAD"],
    callCount: 1,
    gasLimit: 500_000n,
    maxFeePerGas: 20_000_000n,
    reservedCostWei: parseEther("0.001"),
    actualCostWei: null,
    status: "RESERVED",
    createdAt: now,
    confirmedAt: null,
    ...over,
  };
}

const deps = (store: MemoryStore, alchemyApiKey?: string) => ({
  chainId: ROBINHOOD_CHAIN_TESTNET_ID,
  client: {} as PublicClient,
  store,
  alchemyApiKey,
  now: () => now,
});

describe("reconcileSponsoredOperations", () => {
  it("expires reservations older than the stale window and frees their budget", async () => {
    const store = new MemoryStore();
    const stale = op({ createdAt: now - 60 * 60 * 1000 });
    const fresh = op();
    await store.insertSponsoredOperation(stale);
    await store.insertSponsoredOperation(fresh);
    expect((await store.getSpend(0)).spentWei).toBe(parseEther("0.002"));

    const report = await reconcileSponsoredOperations(deps(store));
    expect(report.expired).toBe(1);
    expect(report.bundler).toBe(false);
    // Only the fresh reservation still counts against the budget.
    expect((await store.getSpend(0)).spentWei).toBe(parseEther("0.001"));
  });

  it("lists only unsettled operations that carry a UserOperation hash", async () => {
    const store = new MemoryStore();
    await store.insertSponsoredOperation(op({ status: "CONFIRMED" }));
    await store.insertSponsoredOperation(op({ userOpHash: null }));
    const pending = op();
    await store.insertSponsoredOperation(pending);
    const list = await store.listUnsettledSponsoredOperations(10);
    expect(list.map((o) => o.id)).toEqual([pending.id]);
  });

  it("settles reserved cost to actual cost once a receipt is recorded", async () => {
    const store = new MemoryStore();
    const o = op();
    await store.insertSponsoredOperation(o);
    await store.updateSponsoredOperation(o.id, { status: "CONFIRMED", actualCostWei: parseEther("0.0001"), confirmedAt: now });
    const metrics = await store.metrics(now);
    expect(metrics.lifetimeGasWei).toBe(parseEther("0.0001"));
    expect(metrics.ops24h).toBe(1);
    expect((await store.getSpend(0)).spentWei).toBe(parseEther("0.0001"));
  });
});

describe("store rate limiting", () => {
  it("allows up to the limit inside a window and refills after it", async () => {
    const store = new MemoryStore();
    let t = now;
    for (let i = 0; i < 3; i++) expect(await store.consumeRateLimit("k", 3, 60_000, t)).toBe(true);
    expect(await store.consumeRateLimit("k", 3, 60_000, t)).toBe(false);
    t += 61_000;
    expect(await store.consumeRateLimit("k", 3, 60_000, t)).toBe(true);
  });

  it("tracks keys independently", async () => {
    const store = new MemoryStore();
    expect(await store.consumeRateLimit("a", 1, 60_000, now)).toBe(true);
    expect(await store.consumeRateLimit("a", 1, 60_000, now)).toBe(false);
    expect(await store.consumeRateLimit("b", 1, 60_000, now)).toBe(true);
  });
});
