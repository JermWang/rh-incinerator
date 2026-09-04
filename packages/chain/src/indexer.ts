import type { Address, Hex } from "viem";

/**
 * Indexer abstraction. The scanner discovers candidates through one of these
 * and then verifies every balance, ownership and allowance on-chain. Providers
 * are discovery hints and metadata sources, never the source of truth.
 */

export interface TokenHint {
  address: Address;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  /** Indexer-reported balance (raw units). Advisory only. */
  balanceHint: bigint | null;
  iconUrl: string | null;
  priceUsd: number | null;
  holdersCount: number | null;
  reputation: string | null;
}

export interface NftHint {
  address: Address;
  tokenId: string;
  standard: "ERC721" | "ERC1155";
  collectionName: string | null;
  symbol: string | null;
  imageUrl: string | null;
  amountHint: bigint | null;
  holdersCount: number | null;
  reputation: string | null;
}

export interface ApprovalLogHint {
  token: Address;
  kind: "ERC20_ALLOWANCE" | "ERC721_TOKEN" | "OPERATOR";
  spender: Address;
  tokenId?: bigint;
  block: number;
  timestamp: number;
  txHash: Hex;
}

export interface AddressInfo {
  isContract: boolean;
  /** null when the provider cannot tell (e.g. RPC-only). */
  isVerified: boolean | null;
  isScam: boolean;
  name: string | null;
  implementation: { address: Address; name: string | null } | null;
  reputation: string | null;
}

export interface TokenMeta {
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  type: "ERC-20" | "ERC-721" | "ERC-1155" | null;
  holdersCount: number | null;
  reputation: string | null;
}

export interface IndexerProvider {
  readonly name: string;
  tokenBalances(owner: Address): Promise<TokenHint[]>;
  nftHoldings(owner: Address): Promise<NftHint[]>;
  approvalLogs(owner: Address): Promise<ApprovalLogHint[]>;
  addressInfo(address: Address): Promise<AddressInfo | null>;
  tokenMeta(address: Address): Promise<TokenMeta | null>;
}
