import { describe, expect, it } from "vitest";
import { classifyAsset, type ClassifyInput } from "../src/classify";
import { ROBINHOOD_CHAIN_TESTNET_ID } from "../src/constants";

const base: ClassifyInput = {
  chainId: ROBINHOOD_CHAIN_TESTNET_ID,
  standard: "ERC20",
  address: "0x1111111111111111111111111111111111111111",
  name: "Dogcoin",
  symbol: "DOG",
  verified: false,
  isScam: false,
  reputation: "ok",
  holdersCount: 12,
  valueUsd: null,
};

describe("classifyAsset", () => {
  it("protects Robinhood Chain Stock Tokens by implementation fingerprint", () => {
    const r = classifyAsset({
      ...base,
      name: "Netflix",
      symbol: "NFLX",
      implementation: { address: "0xBd14156E05c6AF28ad39aA53a2AB8eB9CDf657DA", name: "Stock" },
    });
    expect(r.classification).toBe("PROTECTED");
    expect(r.protectedAsset).toBe(true);
    expect(r.reasons[0]).toMatch(/Stock Token/);
  });

  it("protects a stock token by implementation name even if the address is not pinned", () => {
    const r = classifyAsset({
      ...base,
      implementation: { address: "0x9999999999999999999999999999999999999999", name: "Stock" },
    });
    expect(r.classification).toBe("PROTECTED");
  });

  it("protects registry assets (WETH on testnet)", () => {
    const r = classifyAsset({ ...base, address: "0x33e4191705c386532ba27cBF171Db86919200B94", symbol: "WETH" });
    expect(r.classification).toBe("PROTECTED");
    expect(r.reasons[0]).toMatch(/Wrapped/);
  });

  it("protects verified stablecoins and wrapped assets by symbol", () => {
    expect(classifyAsset({ ...base, symbol: "USDT", verified: true }).classification).toBe("PROTECTED");
    expect(classifyAsset({ ...base, symbol: "WBTC", holdersCount: 5000 }).classification).toBe("PROTECTED");
  });

  it("flags a fake USDC as SUSPICIOUS rather than protecting it", () => {
    const r = classifyAsset({ ...base, symbol: "USDC", name: "USDC", verified: false, holdersCount: 3 });
    expect(r.classification).toBe("SUSPICIOUS");
    expect(r.reasons.join(" ")).toMatch(/not the canonical USDC/);
  });

  it("protects LP / lending / staking positions", () => {
    expect(classifyAsset({ ...base, name: "Uniswap V3 Positions NFT", symbol: "UNI-V3-POS" }).classification).toBe("PROTECTED");
    expect(classifyAsset({ ...base, name: "Edel Variable Debt PLTR", symbol: "variableDebtPLTR" }).classification).toBe("PROTECTED");
    expect(classifyAsset({ ...base, name: "Edel TSLA", symbol: "eTSLA" }).classification).toBe("PROTECTED");
    expect(classifyAsset({ ...base, name: "Staked ETH", symbol: "stETH" }).classification).toBe("PROTECTED");
  });

  it("protects assets with meaningful market value", () => {
    expect(classifyAsset({ ...base, valueUsd: 120 }).classification).toBe("PROTECTED");
    expect(classifyAsset({ ...base, valueUsd: 3 }).classification).toBe("VALUABLE");
  });

  it("marks URL-bearing names as SUSPICIOUS without calling them scams", () => {
    const r = classifyAsset({ ...base, name: "WWW.BTCFORUMS.XYZ", symbol: "WWW.BTCFORUMS.XYZ" });
    expect(r.classification).toBe("SUSPICIOUS");
    expect(r.reasons.join(" ").toLowerCase()).not.toContain("scam");
  });

  it("marks explorer-flagged tokens as SUSPICIOUS and non-ok reputation as HIDDEN", () => {
    expect(classifyAsset({ ...base, isScam: true }).classification).toBe("SUSPICIOUS");
    expect(classifyAsset({ ...base, reputation: "spam" }).classification).toBe("HIDDEN");
  });

  it("uses trust tiers for ordinary tokens", () => {
    expect(classifyAsset({ ...base, verified: true }).classification).toBe("VERIFIED");
    expect(classifyAsset({ ...base, holdersCount: 50_000 }).classification).toBe("KNOWN");
    expect(classifyAsset(base).classification).toBe("UNVERIFIED");
  });

  it("never marks a non-protected asset as protected", () => {
    for (const c of [classifyAsset(base), classifyAsset({ ...base, verified: true })]) {
      expect(c.protectedAsset).toBe(false);
    }
  });
});
