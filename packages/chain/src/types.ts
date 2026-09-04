import type { Address } from "viem";
import type { SupportedChainId } from "./constants";

export type AssetStandard = "ERC20" | "ERC721" | "ERC1155";

/**
 * Asset classification. Never call an asset a "scam"; classify by evidence.
 * PROTECTED assets are excluded from destructive defaults and require a deliberate override.
 */
export type Classification =
  | "VERIFIED"
  | "KNOWN"
  | "UNVERIFIED"
  | "HIDDEN"
  | "SUSPICIOUS"
  | "VALUABLE"
  | "PROTECTED";

/** How an asset can be disposed of. UNKNOWN means not yet probed. */
export type BurnMechanism = "BURNABLE" | "SEND_TO_DEAD" | "UNSUPPORTED" | "UNKNOWN";

export interface ClassificationResult {
  classification: Classification;
  /** Human-readable evidence, e.g. "Stock Token (Robinhood issuer implementation)". */
  reasons: string[];
  /** True when the asset should never be pre-selected and needs an explicit override to select. */
  protectedAsset: boolean;
}

export interface TokenAsset extends ClassificationResult {
  standard: "ERC20";
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Raw on-chain balance as decimal string (bigint-safe over JSON). */
  balance: string;
  balanceFormatted: string;
  valueUsd: number | null;
  iconUrl: string | null;
  verified: boolean;
  holdersCount: number | null;
  mechanism: BurnMechanism;
  /** Present when mechanism is UNSUPPORTED; explains why. */
  mechanismReason?: string;
}

export interface NftAsset extends ClassificationResult {
  standard: "ERC721" | "ERC1155";
  address: Address;
  collectionName: string;
  symbol: string;
  tokenId: string;
  /** ERC-1155 balance; "1" for ERC-721. */
  amount: string;
  imageUrl: string | null;
  verified: boolean;
  mechanism: BurnMechanism;
  mechanismReason?: string;
}

export type ApprovalKind = "ERC20_ALLOWANCE" | "ERC721_TOKEN" | "OPERATOR";
export type ApprovalRisk = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  standard: AssetStandard;
  asset: { address: Address; symbol: string; name: string; decimals: number | null };
  spender: Address;
  spenderName: string | null;
  spenderIsContract: boolean;
  spenderVerified: boolean;
  /** ERC-20 allowance as decimal string; undefined for operator approvals. */
  amount?: string;
  amountFormatted?: string;
  unlimited?: boolean;
  tokenId?: string;
  risk: ApprovalRisk;
  riskReasons: string[];
  lastActivityBlock: number | null;
  lastActivityAt: number | null;
  txHash: string | null;
}

export interface ScanResult {
  chainId: SupportedChainId;
  address: Address;
  tokens: TokenAsset[];
  nfts: NftAsset[];
  approvals: ApprovalItem[];
  /** Which sections completed. A section can fail while the others succeed. */
  partial: { tokens: boolean; nfts: boolean; approvals: boolean };
  errors: string[];
  scannedAt: number;
  nativeBalance: string;
}

export interface SimulatedCall {
  to: Address;
  data: `0x${string}`;
  status: "success" | "revert";
  gasUsed: string;
  revertReason: string | null;
  /** Any deviation from expected standard behaviour. Non-empty => not sponsorable. */
  anomalies: string[];
  logsCount: number;
}
