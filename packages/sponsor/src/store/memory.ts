import type { Address, Hex } from "viem";
import type {
  CleanupRecord,
  ContractRiskState,
  FailedSimulation,
  Metrics,
  RefillRecord,
  SpendWindow,
  SponsorStore,
  SponsoredOperation,
  WalletUsage,
} from "./types";

/**
 * In-memory store. Suitable for local development and single-instance
 * deployments. Use the Postgres store for anything multi-instance.
 */
export class MemoryStore implements SponsorStore {
  private wallets = new Map<string, WalletUsage>();
  private contracts = new Map<string, ContractRiskState>();
  private sponsored = new Map<string, SponsoredOperation>();
  private failed: FailedSimulation[] = [];
  private refills = new Map<string, RefillRecord>();
  private cleanups = new Map<string, CleanupRecord>();
  private settings = new Map<string, unknown>();
  private nonces = new Map<string, number>();

  async getWalletUsage(wallet: Address, day: string): Promise<WalletUsage> {
    const key = `${wallet.toLowerCase()}:${day}`;
    return (
      this.wallets.get(key) ?? { ops: 0, gas: 0n, failedSims: 0, failedSimTimestamps: [], cooldownUntil: null }
    );
  }
  async recordWalletSponsoredOp(wallet: Address, day: string, gas: bigint): Promise<void> {
    const key = `${wallet.toLowerCase()}:${day}`;
    const u = await this.getWalletUsage(wallet, day);
    this.wallets.set(key, { ...u, ops: u.ops + 1, gas: u.gas + gas });
  }
  async recordWalletFailedSimulation(wallet: Address, day: string, at: number, cooldownUntil: number | null): Promise<void> {
    const key = `${wallet.toLowerCase()}:${day}`;
    const u = await this.getWalletUsage(wallet, day);
    this.wallets.set(key, {
      ...u,
      failedSims: u.failedSims + 1,
      failedSimTimestamps: [...u.failedSimTimestamps, at].slice(-50),
      cooldownUntil: cooldownUntil ?? u.cooldownUntil,
    });
  }

  async getContractRisk(address: Address): Promise<ContractRiskState | null> {
    return this.contracts.get(address.toLowerCase()) ?? null;
  }
  async recordContractResult(address: Address, ok: boolean, gasUsed: bigint | null, at: number, denyUntil: number | null): Promise<void> {
    const key = address.toLowerCase();
    const s = this.contracts.get(key) ?? blankRisk(address);
    if (ok) {
      s.successes += 1;
      if (gasUsed !== null) {
        s.gasSamples += 1;
        s.gasTotal += gasUsed;
      }
    } else {
      s.failureTimestamps = [...s.failureTimestamps, at].slice(-100);
    }
    if (denyUntil !== null) s.denyUntil = denyUntil;
    s.updatedAt = at;
    this.contracts.set(key, s);
  }
  async setContractDenylist(address: Address, manual: boolean, reason: string | null, denyUntil: number | null): Promise<void> {
    const key = address.toLowerCase();
    const s = this.contracts.get(key) ?? blankRisk(address);
    s.manualDeny = manual;
    s.reason = reason;
    s.denyUntil = denyUntil;
    s.updatedAt = Date.now();
    this.contracts.set(key, s);
  }
  async listDenylisted(): Promise<ContractRiskState[]> {
    const now = Date.now();
    return [...this.contracts.values()].filter((c) => c.manualDeny || (c.denyUntil !== null && c.denyUntil > now));
  }

  async getSpend(sinceMs: number): Promise<SpendWindow> {
    let spentWei = 0n;
    let ops = 0;
    for (const op of this.sponsored.values()) {
      if (op.createdAt < sinceMs) continue;
      if (op.status === "EXPIRED" || op.status === "FAILED") continue;
      spentWei += op.actualCostWei ?? op.reservedCostWei;
      ops += 1;
    }
    return { spentWei, ops };
  }
  async insertSponsoredOperation(op: SponsoredOperation): Promise<void> {
    this.sponsored.set(op.id, { ...op });
  }
  async updateSponsoredOperation(id: string, patch: Partial<SponsoredOperation>): Promise<void> {
    const cur = this.sponsored.get(id);
    if (cur) this.sponsored.set(id, { ...cur, ...patch });
  }
  async findSponsoredByUserOpHash(hash: Hex): Promise<SponsoredOperation | null> {
    for (const op of this.sponsored.values()) if (op.userOpHash?.toLowerCase() === hash.toLowerCase()) return op;
    return null;
  }
  async listSponsoredOperations(limit: number): Promise<SponsoredOperation[]> {
    return [...this.sponsored.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  async expireStaleReservations(olderThanMs: number): Promise<number> {
    let n = 0;
    for (const op of this.sponsored.values()) {
      if (op.status === "RESERVED" && op.createdAt < olderThanMs) {
        op.status = "EXPIRED";
        n++;
      }
    }
    return n;
  }

  async insertFailedSimulation(f: FailedSimulation): Promise<void> {
    this.failed.push(f);
    if (this.failed.length > 5000) this.failed.splice(0, this.failed.length - 5000);
  }
  async listFailedSimulations(limit: number): Promise<FailedSimulation[]> {
    return [...this.failed].reverse().slice(0, limit);
  }

  async upsertRefill(r: RefillRecord): Promise<void> {
    this.refills.set(r.txHash.toLowerCase(), r);
  }
  async listRefills(limit: number): Promise<RefillRecord[]> {
    return [...this.refills.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  async insertCleanup(c: CleanupRecord): Promise<void> {
    this.cleanups.set(c.id, { ...c });
  }
  async updateCleanup(id: string, patch: Partial<CleanupRecord>): Promise<void> {
    const cur = this.cleanups.get(id);
    if (cur) this.cleanups.set(id, { ...cur, ...patch });
  }
  async listCleanupsForWallet(wallet: Address, limit: number): Promise<CleanupRecord[]> {
    return [...this.cleanups.values()]
      .filter((c) => c.wallet.toLowerCase() === wallet.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async getSetting<T>(key: string): Promise<T | null> {
    return (this.settings.get(key) as T | undefined) ?? null;
  }
  async setSetting<T>(key: string, value: T): Promise<void> {
    this.settings.set(key, value);
  }

  async putNonce(nonce: string, expiresAt: number): Promise<void> {
    this.nonces.set(nonce, expiresAt);
    if (this.nonces.size > 10_000) {
      const now = Date.now();
      for (const [k, v] of this.nonces) if (v < now) this.nonces.delete(k);
    }
  }
  async consumeNonce(nonce: string, now: number): Promise<boolean> {
    const exp = this.nonces.get(nonce);
    this.nonces.delete(nonce);
    return exp !== undefined && exp > now;
  }

  async metrics(now: number): Promise<Metrics> {
    const dayAgo = now - 24 * 60 * 60 * 1000;
    let gas24hWei = 0n;
    let ops24h = 0;
    let lifetimeGasWei = 0n;
    let lifetimeOps = 0;
    for (const op of this.sponsored.values()) {
      if (op.status !== "CONFIRMED") continue;
      const cost = op.actualCostWei ?? op.reservedCostWei;
      lifetimeGasWei += cost;
      lifetimeOps += 1;
      if (op.createdAt >= dayAgo) {
        gas24hWei += cost;
        ops24h += 1;
      }
    }
    const refills = await this.listRefills(1);
    return { gas24hWei, ops24h, lifetimeGasWei, lifetimeOps, lastRefill: refills[0] ?? null };
  }
}

function blankRisk(address: Address): ContractRiskState {
  return {
    address,
    failureTimestamps: [],
    successes: 0,
    gasSamples: 0,
    gasTotal: 0n,
    denyUntil: null,
    manualDeny: false,
    reason: null,
    updatedAt: Date.now(),
  };
}
