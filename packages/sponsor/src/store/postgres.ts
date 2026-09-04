import type { Address, Hex } from "viem";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

type Sql = import("postgres").Sql;

/**
 * PostgreSQL store. Schema lives in ../../sql/001_init.sql and is applied
 * idempotently on first use.
 */
export class PostgresStore implements SponsorStore {
  private sql: Sql | null = null;
  private ready: Promise<void> | null = null;

  constructor(private readonly url: string) {}

  private async db(): Promise<Sql> {
    if (!this.ready) {
      this.ready = (async () => {
        const postgres = (await import("postgres")).default;
        this.sql = postgres(this.url, { max: 5, idle_timeout: 30, prepare: false });
        const here = dirname(fileURLToPath(import.meta.url));
        const schema = readFileSync(join(here, "..", "..", "sql", "001_init.sql"), "utf8");
        await this.sql.unsafe(schema);
      })();
    }
    await this.ready;
    return this.sql!;
  }

  async getWalletUsage(wallet: Address, day: string): Promise<WalletUsage> {
    const sql = await this.db();
    const rows = await sql`select ops, gas, failed_sims, failed_sim_timestamps, cooldown_until from wallet_daily_usage where wallet = ${wallet.toLowerCase()} and day = ${day}`;
    const r = rows[0];
    if (!r) return { ops: 0, gas: 0n, failedSims: 0, failedSimTimestamps: [], cooldownUntil: null };
    return {
      ops: Number(r.ops),
      gas: BigInt(r.gas),
      failedSims: Number(r.failed_sims),
      failedSimTimestamps: (r.failed_sim_timestamps as (string | number)[]).map(Number),
      cooldownUntil: r.cooldown_until ? new Date(r.cooldown_until as string).getTime() : null,
    };
  }
  async recordWalletSponsoredOp(wallet: Address, day: string, gas: bigint): Promise<void> {
    const sql = await this.db();
    await sql`insert into wallet_daily_usage (wallet, day, ops, gas) values (${wallet.toLowerCase()}, ${day}, 1, ${gas.toString()})
      on conflict (wallet, day) do update set ops = wallet_daily_usage.ops + 1, gas = wallet_daily_usage.gas + ${gas.toString()}::numeric`;
  }
  async recordWalletFailedSimulation(wallet: Address, day: string, at: number, cooldownUntil: number | null): Promise<void> {
    const sql = await this.db();
    const cd = cooldownUntil ? new Date(cooldownUntil) : null;
    await sql`insert into wallet_daily_usage (wallet, day, failed_sims, failed_sim_timestamps, cooldown_until)
      values (${wallet.toLowerCase()}, ${day}, 1, ${sql.array([at])}, ${cd})
      on conflict (wallet, day) do update set
        failed_sims = wallet_daily_usage.failed_sims + 1,
        failed_sim_timestamps = (array_append(wallet_daily_usage.failed_sim_timestamps, ${at}::bigint))[greatest(1, array_length(wallet_daily_usage.failed_sim_timestamps,1) - 48):],
        cooldown_until = coalesce(${cd}::timestamptz, wallet_daily_usage.cooldown_until)`;
  }

  async getContractRisk(address: Address): Promise<ContractRiskState | null> {
    const sql = await this.db();
    const rows = await sql`select * from contract_risk_state where address = ${address.toLowerCase()}`;
    const r = rows[0];
    return r ? rowToRisk(r) : null;
  }
  async recordContractResult(address: Address, ok: boolean, gasUsed: bigint | null, at: number, denyUntil: number | null): Promise<void> {
    const sql = await this.db();
    const du = denyUntil ? new Date(denyUntil) : null;
    if (ok) {
      await sql`insert into contract_risk_state (address, successes, gas_samples, gas_total, deny_until, updated_at)
        values (${address.toLowerCase()}, 1, ${gasUsed !== null ? 1 : 0}, ${(gasUsed ?? 0n).toString()}, ${du}, ${new Date(at)})
        on conflict (address) do update set
          successes = contract_risk_state.successes + 1,
          gas_samples = contract_risk_state.gas_samples + ${gasUsed !== null ? 1 : 0},
          gas_total = contract_risk_state.gas_total + ${(gasUsed ?? 0n).toString()}::numeric,
          deny_until = coalesce(${du}::timestamptz, contract_risk_state.deny_until),
          updated_at = ${new Date(at)}`;
    } else {
      await sql`insert into contract_risk_state (address, failure_timestamps, deny_until, updated_at)
        values (${address.toLowerCase()}, ${sql.array([at])}, ${du}, ${new Date(at)})
        on conflict (address) do update set
          failure_timestamps = (array_append(contract_risk_state.failure_timestamps, ${at}::bigint))[greatest(1, array_length(contract_risk_state.failure_timestamps,1) - 98):],
          deny_until = coalesce(${du}::timestamptz, contract_risk_state.deny_until),
          updated_at = ${new Date(at)}`;
    }
  }
  async setContractDenylist(address: Address, manual: boolean, reason: string | null, denyUntil: number | null): Promise<void> {
    const sql = await this.db();
    const du = denyUntil ? new Date(denyUntil) : null;
    await sql`insert into contract_risk_state (address, manual_deny, reason, deny_until, updated_at)
      values (${address.toLowerCase()}, ${manual}, ${reason}, ${du}, now())
      on conflict (address) do update set manual_deny = ${manual}, reason = ${reason}, deny_until = ${du}, updated_at = now()`;
  }
  async listDenylisted(): Promise<ContractRiskState[]> {
    const sql = await this.db();
    const rows = await sql`select * from contract_risk_state where manual_deny or deny_until > now() order by updated_at desc limit 500`;
    return rows.map(rowToRisk);
  }

  async getSpend(sinceMs: number): Promise<SpendWindow> {
    const sql = await this.db();
    const rows = await sql`select coalesce(sum(coalesce(actual_cost_wei, reserved_cost_wei)),0) as spent, count(*) as ops
      from sponsored_operations where created_at >= ${new Date(sinceMs)} and status not in ('EXPIRED','FAILED')`;
    return { spentWei: BigInt(rows[0]?.spent ?? 0), ops: Number(rows[0]?.ops ?? 0) };
  }
  async insertSponsoredOperation(op: SponsoredOperation): Promise<void> {
    const sql = await this.db();
    await sql`insert into sponsored_operations (id, chain_id, wallet, user_op_hash, tx_hash, kinds, call_count, gas_limit, max_fee_per_gas, reserved_cost_wei, actual_cost_wei, status, created_at, confirmed_at)
      values (${op.id}, ${op.chainId}, ${op.wallet.toLowerCase()}, ${op.userOpHash}, ${op.txHash}, ${sql.array(op.kinds)}, ${op.callCount}, ${op.gasLimit.toString()}, ${op.maxFeePerGas.toString()}, ${op.reservedCostWei.toString()}, ${op.actualCostWei?.toString() ?? null}, ${op.status}, ${new Date(op.createdAt)}, ${op.confirmedAt ? new Date(op.confirmedAt) : null})`;
  }
  async updateSponsoredOperation(id: string, patch: Partial<SponsoredOperation>): Promise<void> {
    const sql = await this.db();
    const cols: Record<string, unknown> = {};
    if (patch.userOpHash !== undefined) cols.user_op_hash = patch.userOpHash;
    if (patch.txHash !== undefined) cols.tx_hash = patch.txHash;
    if (patch.actualCostWei !== undefined) cols.actual_cost_wei = patch.actualCostWei?.toString() ?? null;
    if (patch.status !== undefined) cols.status = patch.status;
    if (patch.confirmedAt !== undefined) cols.confirmed_at = patch.confirmedAt ? new Date(patch.confirmedAt) : null;
    if (Object.keys(cols).length === 0) return;
    await sql`update sponsored_operations set ${sql(cols)} where id = ${id}`;
  }
  async findSponsoredByUserOpHash(hash: Hex): Promise<SponsoredOperation | null> {
    const sql = await this.db();
    const rows = await sql`select * from sponsored_operations where lower(user_op_hash) = ${hash.toLowerCase()}`;
    return rows[0] ? rowToSponsored(rows[0]) : null;
  }
  async listSponsoredOperations(limit: number): Promise<SponsoredOperation[]> {
    const sql = await this.db();
    const rows = await sql`select * from sponsored_operations order by created_at desc limit ${limit}`;
    return rows.map(rowToSponsored);
  }
  async expireStaleReservations(olderThanMs: number): Promise<number> {
    const sql = await this.db();
    const r = await sql`update sponsored_operations set status = 'EXPIRED' where status = 'RESERVED' and created_at < ${new Date(olderThanMs)}`;
    return r.count;
  }

  async insertFailedSimulation(f: FailedSimulation): Promise<void> {
    const sql = await this.db();
    await sql`insert into failed_simulations (id, chain_id, wallet, token, kind, reason, created_at)
      values (${f.id}, ${f.chainId}, ${f.wallet.toLowerCase()}, ${f.token.toLowerCase()}, ${f.kind}, ${f.reason}, ${new Date(f.createdAt)})`;
  }
  async listFailedSimulations(limit: number): Promise<FailedSimulation[]> {
    const sql = await this.db();
    const rows = await sql`select * from failed_simulations order by created_at desc limit ${limit}`;
    return rows.map((r) => ({
      id: r.id as string,
      chainId: Number(r.chain_id),
      wallet: r.wallet as Address,
      token: r.token as Address,
      kind: r.kind as string,
      reason: r.reason as string,
      createdAt: new Date(r.created_at as string).getTime(),
    }));
  }

  async upsertRefill(r: RefillRecord): Promise<void> {
    const sql = await this.db();
    await sql`insert into sponsor_refills (tx_hash, chain_id, amount_wei, hot_balance_after, keeper, block_number, created_at)
      values (${r.txHash.toLowerCase()}, ${r.chainId}, ${r.amountWei.toString()}, ${r.hotBalanceAfter.toString()}, ${r.keeper.toLowerCase()}, ${r.blockNumber}, ${new Date(r.createdAt)})
      on conflict (tx_hash) do nothing`;
  }
  async listRefills(limit: number): Promise<RefillRecord[]> {
    const sql = await this.db();
    const rows = await sql`select * from sponsor_refills order by created_at desc limit ${limit}`;
    return rows.map((r) => ({
      txHash: r.tx_hash as Hex,
      chainId: Number(r.chain_id),
      amountWei: BigInt(r.amount_wei),
      hotBalanceAfter: BigInt(r.hot_balance_after),
      keeper: r.keeper as Address,
      blockNumber: Number(r.block_number),
      createdAt: new Date(r.created_at as string).getTime(),
    }));
  }
  async insertCleanup(c: CleanupRecord): Promise<void> {
    const sql = await this.db();
    await sql`insert into cleanup_transactions (id, chain_id, wallet, tx_hash, user_op_hash, kinds, sponsored, status, created_at)
      values (${c.id}, ${c.chainId}, ${c.wallet.toLowerCase()}, ${c.txHash}, ${c.userOpHash}, ${sql.array(c.kinds)}, ${c.sponsored}, ${c.status}, ${new Date(c.createdAt)})
      on conflict (id) do nothing`;
  }
  async updateCleanup(id: string, patch: Partial<CleanupRecord>): Promise<void> {
    const sql = await this.db();
    const cols: Record<string, unknown> = {};
    if (patch.txHash !== undefined) cols.tx_hash = patch.txHash;
    if (patch.userOpHash !== undefined) cols.user_op_hash = patch.userOpHash;
    if (patch.status !== undefined) cols.status = patch.status;
    if (Object.keys(cols).length === 0) return;
    await sql`update cleanup_transactions set ${sql(cols)} where id = ${id}`;
  }
  async listCleanupsForWallet(wallet: Address, limit: number): Promise<CleanupRecord[]> {
    const sql = await this.db();
    const rows = await sql`select * from cleanup_transactions where wallet = ${wallet.toLowerCase()} order by created_at desc limit ${limit}`;
    return rows.map((r) => ({
      id: r.id as string,
      chainId: Number(r.chain_id),
      wallet: r.wallet as Address,
      txHash: (r.tx_hash as Hex | null) ?? null,
      userOpHash: (r.user_op_hash as Hex | null) ?? null,
      kinds: r.kinds as string[],
      sponsored: Boolean(r.sponsored),
      status: r.status as CleanupRecord["status"],
      createdAt: new Date(r.created_at as string).getTime(),
    }));
  }

  async getSetting<T>(key: string): Promise<T | null> {
    const sql = await this.db();
    const rows = await sql`select value from settings where key = ${key}`;
    return rows[0] ? (rows[0].value as T) : null;
  }
  async setSetting<T>(key: string, value: T): Promise<void> {
    const sql = await this.db();
    await sql`insert into settings (key, value, updated_at) values (${key}, ${sql.json(value as never)}, now())
      on conflict (key) do update set value = ${sql.json(value as never)}, updated_at = now()`;
  }

  async putNonce(nonce: string, expiresAt: number): Promise<void> {
    const sql = await this.db();
    await sql`insert into siwe_nonces (nonce, expires_at) values (${nonce}, ${new Date(expiresAt)}) on conflict do nothing`;
    await sql`delete from siwe_nonces where expires_at < now() - interval '1 hour'`;
  }
  async consumeNonce(nonce: string, now: number): Promise<boolean> {
    const sql = await this.db();
    const rows = await sql`delete from siwe_nonces where nonce = ${nonce} returning expires_at`;
    const exp = rows[0]?.expires_at;
    return exp !== undefined && new Date(exp as string).getTime() > now;
  }

  async metrics(now: number): Promise<Metrics> {
    const sql = await this.db();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const [day] = await sql`select coalesce(sum(coalesce(actual_cost_wei, reserved_cost_wei)),0) as gas, count(*) as ops from sponsored_operations where status = 'CONFIRMED' and created_at >= ${dayAgo}`;
    const [life] = await sql`select coalesce(sum(coalesce(actual_cost_wei, reserved_cost_wei)),0) as gas, count(*) as ops from sponsored_operations where status = 'CONFIRMED'`;
    const refills = await this.listRefills(1);
    return {
      gas24hWei: BigInt(day?.gas ?? 0),
      ops24h: Number(day?.ops ?? 0),
      lifetimeGasWei: BigInt(life?.gas ?? 0),
      lifetimeOps: Number(life?.ops ?? 0),
      lastRefill: refills[0] ?? null,
    };
  }
}

function rowToRisk(r: Record<string, unknown>): ContractRiskState {
  return {
    address: r.address as Address,
    failureTimestamps: (r.failure_timestamps as (string | number)[]).map(Number),
    successes: Number(r.successes),
    gasSamples: Number(r.gas_samples),
    gasTotal: BigInt(r.gas_total as string),
    denyUntil: r.deny_until ? new Date(r.deny_until as string).getTime() : null,
    manualDeny: Boolean(r.manual_deny),
    reason: (r.reason as string | null) ?? null,
    updatedAt: new Date(r.updated_at as string).getTime(),
  };
}

function rowToSponsored(r: Record<string, unknown>): SponsoredOperation {
  return {
    id: r.id as string,
    chainId: Number(r.chain_id),
    wallet: r.wallet as Address,
    userOpHash: (r.user_op_hash as Hex | null) ?? null,
    txHash: (r.tx_hash as Hex | null) ?? null,
    kinds: r.kinds as string[],
    callCount: Number(r.call_count),
    gasLimit: BigInt(r.gas_limit as string),
    maxFeePerGas: BigInt(r.max_fee_per_gas as string),
    reservedCostWei: BigInt(r.reserved_cost_wei as string),
    actualCostWei: r.actual_cost_wei ? BigInt(r.actual_cost_wei as string) : null,
    status: r.status as SponsoredOperation["status"],
    createdAt: new Date(r.created_at as string).getTime(),
    confirmedAt: r.confirmed_at ? new Date(r.confirmed_at as string).getTime() : null,
  };
}
