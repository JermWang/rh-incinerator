import { parseEther } from "viem";
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, HARD_BOUNDS, resolvePolicy } from "../src/config";
import { MemoryStore } from "../src/store";
import { denylistContract, pauseSponsorship, resumeSponsorship, setPolicyOverrides, isPaused, loadPolicy, checkAdminToken } from "../src/admin";
import { TOKEN_A } from "./helpers";

describe("policy overrides", () => {
  it("applies overrides and clamps to hard bounds", () => {
    const p = resolvePolicy({ MAX_GAS_PER_CALL: "400000", MAX_GLOBAL_SPONSOR_SPEND_PER_DAY: parseEther("100").toString(), MAX_CALLS_PER_BATCH: "999" });
    expect(p.MAX_GAS_PER_CALL).toBe(400_000n);
    expect(p.MAX_GLOBAL_SPONSOR_SPEND_PER_DAY).toBe(HARD_BOUNDS.MAX_GLOBAL_SPONSOR_SPEND_PER_DAY);
    expect(p.MAX_CALLS_PER_BATCH).toBe(HARD_BOUNDS.MAX_CALLS_PER_BATCH);
    expect(p.MAX_FEE_PER_GAS).toBe(DEFAULT_POLICY.MAX_FEE_PER_GAS);
  });

  it("admin functions persist through the store", async () => {
    const store = new MemoryStore();
    await pauseSponsorship(store);
    expect(await isPaused(store)).toBe(true);
    await resumeSponsorship(store);
    expect(await isPaused(store)).toBe(false);
    await setPolicyOverrides(store, { MAX_GAS_PER_CALL: "123456" });
    expect((await loadPolicy(store)).MAX_GAS_PER_CALL).toBe(123_456n);
    await setPolicyOverrides(store, { MAX_GAS_PER_CALL: "default" });
    expect((await loadPolicy(store)).MAX_GAS_PER_CALL).toBe(DEFAULT_POLICY.MAX_GAS_PER_CALL);
    await expect(setPolicyOverrides(store, { SESSION_TTL_MS: "1" })).rejects.toThrow(/not overridable/);
    await expect(setPolicyOverrides(store, { MAX_GAS_PER_CALL: "-1" })).rejects.toThrow();
    await denylistContract(store, TOKEN_A, "test", null);
    expect((await store.listDenylisted()).map((d) => d.address.toLowerCase())).toContain(TOKEN_A.toLowerCase());
  });

  it("admin token comparison is strict", () => {
    expect(checkAdminToken("abc", "abc")).toBe(true);
    expect(checkAdminToken("abc", "abd")).toBe(false);
    expect(checkAdminToken("", "abc")).toBe(false);
    expect(checkAdminToken("abc", undefined)).toBe(false);
  });
});
