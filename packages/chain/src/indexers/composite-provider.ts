import type { Address, PublicClient } from "viem";
import type { AddressInfo, ApprovalLogHint, IndexerProvider, NftHint, TokenHint, TokenMeta } from "../indexer";
import { resolveImplementation } from "../proxy";

/**
 * Discovery from the primary provider; metadata enriched from the secondary
 * (explorer) provider on a best-effort basis; proxy implementation always
 * confirmed on-chain so Stock Token protection never depends on an explorer.
 */
export class CompositeProvider implements IndexerProvider {
  readonly name: string;
  constructor(
    private readonly primary: IndexerProvider,
    private readonly secondary: IndexerProvider | null,
    private readonly client: PublicClient,
  ) {
    this.name = secondary ? `${primary.name}+${secondary.name}` : primary.name;
  }

  tokenBalances(owner: Address): Promise<TokenHint[]> {
    return this.primary.tokenBalances(owner);
  }
  nftHoldings(owner: Address): Promise<NftHint[]> {
    return this.primary.nftHoldings(owner);
  }
  approvalLogs(owner: Address): Promise<ApprovalLogHint[]> {
    return this.primary.approvalLogs(owner);
  }

  async addressInfo(address: Address): Promise<AddressInfo | null> {
    const [p, s] = await Promise.all([
      this.primary.addressInfo(address).catch(() => null),
      this.secondary ? this.secondary.addressInfo(address).catch(() => null) : Promise.resolve(null),
    ]);
    const onchainImpl = await resolveImplementation(this.client, address).catch(() => null);
    const base = s ?? p;
    if (!base && !onchainImpl) return null;
    const implementation = onchainImpl
      ? { address: onchainImpl, name: s?.implementation?.name ?? p?.implementation?.name ?? null }
      : (s?.implementation ?? p?.implementation ?? null);
    return {
      isContract: base?.isContract ?? Boolean(onchainImpl),
      isVerified: s?.isVerified ?? p?.isVerified ?? null,
      isScam: s?.isScam ?? p?.isScam ?? false,
      name: s?.name ?? p?.name ?? null,
      implementation,
      reputation: s?.reputation ?? p?.reputation ?? null,
    };
  }

  async tokenMeta(address: Address): Promise<TokenMeta | null> {
    const s = this.secondary ? await this.secondary.tokenMeta(address).catch(() => null) : null;
    if (s) return s;
    return this.primary.tokenMeta(address).catch(() => null);
  }
}
