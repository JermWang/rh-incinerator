import { describe, expect, it } from "vitest";
import { classifyAsset } from "../src/classify";
import { ROBINHOOD_CHAIN_MAINNET_ID, ROBINHOOD_CHAIN_TESTNET_ID } from "../src/constants";

/**
 * Both networks' Stock Token beacon implementations are pinned. Resolved
 * on-chain 2026-09-03 from the ERC-1967 beacon slot of testnet PLTR and
 * mainnet NVDA.
 */
describe("Stock Token protection across networks", () => {
  const base = {
    standard: "ERC20" as const,
    address: "0x1111111111111111111111111111111111111111" as const,
    name: "Some Stock",
    symbol: "XYZ",
    verified: true,
    isScam: false,
    reputation: "ok",
    holdersCount: 1000,
    valueUsd: null,
  };

  it("protects by pinned testnet implementation address, even without a name", () => {
    const r = classifyAsset({
      ...base,
      chainId: ROBINHOOD_CHAIN_TESTNET_ID,
      implementation: { address: "0xBd14156E05c6AF28ad39aA53a2AB8eB9CDf657DA", name: null },
    });
    expect(r.classification).toBe("PROTECTED");
  });

  it("protects by pinned mainnet implementation address, even without a name", () => {
    const r = classifyAsset({
      ...base,
      chainId: ROBINHOOD_CHAIN_MAINNET_ID,
      implementation: { address: "0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2", name: null },
    });
    expect(r.classification).toBe("PROTECTED");
  });

  it("protects canonical mainnet WETH and USDG", () => {
    expect(classifyAsset({ ...base, chainId: ROBINHOOD_CHAIN_MAINNET_ID, address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73", symbol: "WETH" }).classification).toBe("PROTECTED");
    expect(classifyAsset({ ...base, chainId: ROBINHOOD_CHAIN_MAINNET_ID, address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG" }).classification).toBe("PROTECTED");
  });

  it("flags a USDG impersonator on mainnet rather than protecting it", () => {
    const r = classifyAsset({
      ...base,
      chainId: ROBINHOOD_CHAIN_MAINNET_ID,
      address: "0x42B4FA90438eCB1A0C2676ff25A9F27355DD53c2",
      symbol: "USDG",
      name: "global dollar",
      verified: false,
      holdersCount: 172_707,
    });
    expect(r.classification).toBe("SUSPICIOUS");
    expect(r.reasons.join(" ")).toMatch(/not the canonical USDG/);
  });

  it("does not leak testnet protection onto mainnet", () => {
    const r = classifyAsset({
      ...base,
      chainId: ROBINHOOD_CHAIN_MAINNET_ID,
      address: "0x33e4191705c386532ba27cBF171Db86919200B94",
      symbol: "NOTWETH",
      name: "Random",
      verified: false,
      holdersCount: 2,
    });
    expect(r.classification).not.toBe("PROTECTED");
  });
});
