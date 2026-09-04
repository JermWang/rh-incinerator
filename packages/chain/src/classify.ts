import type { Address } from "viem";
import type { SupportedChainId } from "./constants";
import {
  POSITION_PATTERNS,
  STABLECOIN_SYMBOLS,
  SUSPICIOUS_PATTERNS,
  WRAPPED_SYMBOLS,
  canonicalAddressForSymbol,
  isStockTokenImplementation,
  lookupProtected,
} from "./registry";
import type { AssetStandard, ClassificationResult } from "./types";

export interface ClassifyInput {
  chainId: SupportedChainId;
  standard: AssetStandard;
  address: Address;
  name: string;
  symbol: string;
  verified: boolean;
  isScam: boolean;
  reputation: string | null;
  holdersCount: number | null;
  valueUsd: number | null;
  implementation?: { address: Address; name: string | null } | undefined;
}

const WIDELY_HELD = 1_000;
const VALUABLE_USD = 1;

/**
 * Evidence-based classification. Order matters: PROTECTED wins, then
 * SUSPICIOUS/HIDDEN, then VALUABLE, then trust tiers.
 *
 * Nothing here ever pre-selects an asset for destruction.
 */
export function classifyAsset(input: ClassifyInput): ClassificationResult {
  const reasons: string[] = [];
  const sym = input.symbol.trim().toUpperCase();
  const text = `${input.name} ${input.symbol}`;

  // --- PROTECTED -----------------------------------------------------------
  if (isStockTokenImplementation(input.chainId, input.implementation)) {
    return protectedResult(["Stock Token (Robinhood Chain issuer implementation)"]);
  }
  const registry = lookupProtected(input.chainId, input.address);
  if (registry) return protectedResult([registry.reason]);

  const trusted = input.verified || (input.holdersCount ?? 0) >= WIDELY_HELD;
  if (input.standard === "ERC20" && trusted && STABLECOIN_SYMBOLS.has(sym)) {
    return protectedResult([`Stablecoin (${sym})`]);
  }
  if (input.standard === "ERC20" && trusted && WRAPPED_SYMBOLS.has(sym)) {
    return protectedResult([`Wrapped asset (${sym})`]);
  }
  if (input.valueUsd !== null && input.valueUsd >= 25) {
    return protectedResult([`Meaningful market value (${usd(input.valueUsd)})`]);
  }
  for (const p of POSITION_PATTERNS) {
    if (p.test(input.name) || p.test(input.symbol)) {
      return protectedResult(["Looks like a protocol position, receipt or LP token"]);
    }
  }

  // --- SUSPICIOUS / HIDDEN --------------------------------------------------
  if (input.isScam) reasons.push("Flagged by explorer");
  for (const p of SUSPICIOUS_PATTERNS) {
    if (p.test(text)) {
      reasons.push("Name contains a URL, claim prompt or lookalike characters");
      break;
    }
  }
  const canonical = canonicalAddressForSymbol(input.chainId, sym);
  if (canonical && canonical.toLowerCase() !== input.address.toLowerCase()) {
    reasons.push(`Uses the ${sym} symbol but is not the canonical ${sym} contract`);
  }
  if (reasons.length > 0) return { classification: "SUSPICIOUS", reasons, protectedAsset: false };

  if (input.reputation && input.reputation !== "ok") {
    return { classification: "HIDDEN", reasons: [`Explorer reputation: ${input.reputation}`], protectedAsset: false };
  }

  // --- VALUABLE -------------------------------------------------------------
  if (input.valueUsd !== null && input.valueUsd >= VALUABLE_USD) {
    return { classification: "VALUABLE", reasons: [`Estimated value ${usd(input.valueUsd)}`], protectedAsset: false };
  }

  // --- Trust tiers ----------------------------------------------------------
  if (input.verified) {
    return { classification: "VERIFIED", reasons: ["Contract source verified on explorer"], protectedAsset: false };
  }
  if ((input.holdersCount ?? 0) >= WIDELY_HELD) {
    return {
      classification: "KNOWN",
      reasons: [`Widely held (${input.holdersCount?.toLocaleString("en-US")} holders)`],
      protectedAsset: false,
    };
  }
  return { classification: "UNVERIFIED", reasons: ["Contract source not verified"], protectedAsset: false };
}

function protectedResult(reasons: string[]): ClassificationResult {
  return { classification: "PROTECTED", reasons, protectedAsset: true };
}

function usd(v: number): string {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
