import { getAddress, isAddressEqual, pad, type Address, type Hex } from "viem";
import { BlockscoutClient, type BsLegacyLog } from "../blockscout";
import { TOPIC_APPROVAL, TOPIC_APPROVAL_FOR_ALL, ZERO_ADDRESS, type SupportedChainId } from "../constants";
import type { AddressInfo, ApprovalLogHint, IndexerProvider, NftHint, TokenHint, TokenMeta } from "../indexer";

/** Blockscout-backed indexer. Works without credentials on testnet. */
export class BlockscoutProvider implements IndexerProvider {
  readonly name = "blockscout";
  constructor(
    readonly client: BlockscoutClient,
    readonly chainId: SupportedChainId,
  ) {}

  async tokenBalances(owner: Address): Promise<TokenHint[]> {
    const items = await this.client.addressTokens(owner, "ERC-20");
    return items.map((h) => ({
      address: getAddress(h.token.address_hash),
      symbol: h.token.symbol,
      name: h.token.name,
      decimals: h.token.decimals ? Number(h.token.decimals) : null,
      balanceHint: safeBigInt(h.value),
      iconUrl: h.token.icon_url,
      priceUsd: h.token.exchange_rate ? Number(h.token.exchange_rate) : null,
      holdersCount: h.token.holders_count ? Number(h.token.holders_count) : null,
      reputation: h.token.reputation,
    }));
  }

  async nftHoldings(owner: Address): Promise<NftHint[]> {
    const items = await this.client.addressNfts(owner);
    return items.map((n) => ({
      address: getAddress(n.token.address_hash),
      tokenId: n.id,
      standard: n.token_type === "ERC-1155" || n.token.type === "ERC-1155" ? "ERC1155" : "ERC721",
      collectionName: n.token.name,
      symbol: n.token.symbol,
      imageUrl: n.image_url ?? n.metadata?.image ?? null,
      amountHint: safeBigInt(n.value ?? null),
      holdersCount: n.token.holders_count ? Number(n.token.holders_count) : null,
      reputation: n.token.reputation,
    }));
  }

  async approvalLogs(owner: Address): Promise<ApprovalLogHint[]> {
    const ownerTopic = pad(owner, { size: 32 }).toLowerCase() as Hex;
    const [approval, operator] = await Promise.all([
      this.client.logsPaged({ topic0: TOPIC_APPROVAL, topic1: ownerTopic }),
      this.client.logsPaged({ topic0: TOPIC_APPROVAL_FOR_ALL, topic1: ownerTopic }),
    ]);
    const out: ApprovalLogHint[] = [];
    for (const log of approval) {
      const t = topics(log);
      if (t.length === 3) out.push({ token: getAddress(log.address), kind: "ERC20_ALLOWANCE", spender: topicAddress(t[2]!), ...meta(log) });
      else if (t.length === 4)
        out.push({ token: getAddress(log.address), kind: "ERC721_TOKEN", spender: topicAddress(t[2]!), tokenId: BigInt(t[3]!), ...meta(log) });
    }
    for (const log of operator) {
      const t = topics(log);
      if (t.length === 3) out.push({ token: getAddress(log.address), kind: "OPERATOR", spender: topicAddress(t[2]!), ...meta(log) });
    }
    return out.filter((a) => !isAddressEqual(a.spender, ZERO_ADDRESS));
  }

  async addressInfo(address: Address): Promise<AddressInfo | null> {
    const info = await this.client.addressInfo(address);
    if (!info) return null;
    const impl = info.implementations?.[0];
    return {
      isContract: info.is_contract,
      isVerified: info.is_verified,
      isScam: info.is_scam,
      name: info.name,
      implementation: impl ? { address: getAddress(impl.address_hash), name: impl.name } : null,
      reputation: info.reputation,
    };
  }

  async tokenMeta(address: Address): Promise<TokenMeta | null> {
    const t = await this.client.tokenInfo(address);
    if (!t) return null;
    return {
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals ? Number(t.decimals) : null,
      type: (t.type as TokenMeta["type"]) ?? null,
      holdersCount: t.holders_count ? Number(t.holders_count) : null,
      reputation: t.reputation,
    };
  }
}

function topics(log: BsLegacyLog): Hex[] {
  return log.topics.filter((t): t is Hex => Boolean(t));
}
function meta(log: BsLegacyLog) {
  return { block: Number(log.blockNumber), timestamp: Number(log.timeStamp), txHash: log.transactionHash };
}
function topicAddress(topic: Hex): Address {
  return getAddress(`0x${topic.slice(-40)}`);
}
function safeBigInt(v: string | null): bigint | null {
  try {
    return v === null ? null : BigInt(v);
  } catch {
    return null;
  }
}
