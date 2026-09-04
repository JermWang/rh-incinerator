import type { Address } from "viem";
import { ROBINHOOD_CHAIN_MAINNET_ID, ROBINHOOD_CHAIN_TESTNET_ID, type SupportedChainId } from "./constants";

/**
 * Curated registry of protected assets per network.
 *
 * Robinhood Chain Stock Tokens are identified by the shared beacon
 * implementation their BeaconProxy points to (Blockscout reports it as
 * `implementations[].name === "Stock"`). Address-level entries cover canonical
 * wrapped/stable assets. Everything here is PROTECTED: never default-selected.
 */

export interface ProtectedEntry {
  reason: string;
}

const lc = (a: string) => a.toLowerCase() as Address;

export const STOCK_TOKEN_IMPLEMENTATIONS: Record<SupportedChainId, readonly Address[]> = {
  [ROBINHOOD_CHAIN_TESTNET_ID]: [lc("0xBd14156E05c6AF28ad39aA53a2AB8eB9CDf657DA")],
  // Mainnet implementation is resolved at runtime by implementation name "Stock";
  // pin the address here once confirmed from the mainnet explorer.
  [ROBINHOOD_CHAIN_MAINNET_ID]: [],
};

export const STOCK_TOKEN_IMPLEMENTATION_NAMES: readonly string[] = ["Stock"];

export const PROTECTED_TOKENS: Record<SupportedChainId, Record<Address, ProtectedEntry>> = {
  [ROBINHOOD_CHAIN_TESTNET_ID]: {
    [lc("0x33e4191705c386532ba27cBF171Db86919200B94")]: { reason: "Wrapped native asset (WETH)" },
    [lc("0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F")]: { reason: "Stablecoin (USDC)" },
  },
  [ROBINHOOD_CHAIN_MAINNET_ID]: {},
};

/** Symbols that are protected when the contract is verified or widely held. */
export const STABLECOIN_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "USDS",
  "USDE",
  "PYUSD",
  "FRAX",
  "GHO",
  "USDG",
  "RLUSD",
  "USD1",
  "MUSD",
]);

export const WRAPPED_SYMBOLS = new Set(["WETH", "WBTC", "WSTETH", "CBBTC", "TBTC", "RETH", "CBETH", "WEETH"]);

/** Name/symbol patterns indicating positions or receipts rather than plain tokens. */
export const POSITION_PATTERNS: readonly RegExp[] = [
  /uniswap/i,
  /\bUNI-V[234]\b/,
  /\bpositions?\b/i,
  /\bLP\b/,
  /liquidity/i,
  /debt/i,
  /^edel\b/i,
  /^e[A-Z]{2,6}$/, // Edel supply receipt symbols (eTSLA, ePLTR)
  /aave/i,
  /^a[A-Z]{3,6}$/,
  /compound/i,
  /^c[A-Z]{3,6}$/,
  /staked/i,
  /^st[A-Z]{2,6}$/,
  /receipt/i,
  /\bvault\b/i,
  /^vault/i,
  /\bshares?\b/i,
];

/** Strong signals used for SUSPICIOUS. Never used to auto-select anything. */
export const SUSPICIOUS_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /www\./i,
  /\.(com|io|xyz|org|net|app|finance|fi|site|link|club|live|pro|top)\b/i,
  /\bclaim\b/i,
  /airdrop/i,
  /\bvisit\b/i,
  /\brewards?\b/i,
  /\bbonus\b/i,
  /voucher/i,
  /\bredeem\b/i,
  /\bt\.me\b/i,
  /[Ѐ-ӿ]/, // Cyrillic lookalikes in Latin names
  /[​‌‍﻿]/, // zero-width characters
];

export function lookupProtected(chainId: SupportedChainId, address: Address): ProtectedEntry | undefined {
  return PROTECTED_TOKENS[chainId][lc(address)];
}

export function isStockTokenImplementation(
  chainId: SupportedChainId,
  impl: { address: Address; name: string | null } | undefined,
): boolean {
  if (!impl) return false;
  if (STOCK_TOKEN_IMPLEMENTATIONS[chainId].includes(lc(impl.address))) return true;
  return impl.name !== null && STOCK_TOKEN_IMPLEMENTATION_NAMES.includes(impl.name);
}

/** Canonical symbol -> address map for impersonation detection. */
export function canonicalAddressForSymbol(chainId: SupportedChainId, symbol: string): Address | undefined {
  const s = symbol.toUpperCase();
  for (const [addr, entry] of Object.entries(PROTECTED_TOKENS[chainId])) {
    if (entry.reason.includes(`(${s})`)) return addr as Address;
  }
  return undefined;
}
