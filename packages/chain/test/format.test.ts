import { describe, expect, it } from "vitest";
import { formatAmount, formatEth, shortAddress } from "../src/format";

describe("format", () => {
  it("groups large balances and drops fractions", () => {
    expect(formatAmount(84920193n * 10n ** 18n, 18)).toBe("84,920,193");
  });
  it("keeps small fractions", () => {
    expect(formatAmount(1_234_500n, 6)).toBe("1.2345");
    expect(formatAmount(1n, 18)).toBe("<0.0001");
    expect(formatAmount(0n, 18)).toBe("0");
  });
  it("formats ETH at gas precision", () => {
    expect(formatEth(13_400_000_000_000n)).toBe("0.0000134");
    expect(formatEth(0n)).toBe("0");
  });
  it("shortens addresses", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });
});
