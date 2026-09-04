import { isAddressEqual, type Address, type PublicClient } from "viem";
import {
  ENTRYPOINT_V06,
  ENTRYPOINT_V07,
  ENTRYPOINT_V08,
  MULTICALL3_ADDRESS,
  erc1155Abi,
  erc20Abi,
  erc721Abi,
  encodeOperation,
  simulateOperations,
  type CleanupOperation,
  type Deployment,
  type SimulatedCall,
  type SupportedChainId,
} from "@incinerator/chain";
import type { SponsorPolicy } from "./config";
import { dayKey, type SponsorStore } from "./store";

/**
 * The policy engine. Treats every request as hostile input.
 *
 * evaluateOperations(): structural checks -> ownership truth -> simulation -> gas ceilings.
 * checkSponsorLimits(): wallet, contract and global budget controls.
 */

export type DenialCode =
  | "TOO_MANY_CALLS"
  | "DUPLICATE_OPERATION"
  | "CALLDATA_TOO_LARGE"
  | "NOT_OWNER"
  | "INSUFFICIENT_BALANCE"
  | "NOTHING_TO_REVOKE"
  | "TOKEN_DENYLISTED"
  | "NO_CODE"
  | "SELF_TARGET"
  | "SIMULATION_FAILED"
  | "NON_STANDARD_TOKEN"
  | "GAS_CEILING"
  | "FEE_TOO_HIGH"
  | "COST_CEILING"
  | "WALLET_RATE_LIMIT"
  | "WALLET_COOLDOWN"
  | "BUDGET_EXHAUSTED"
  | "SPONSOR_UNAVAILABLE"
  | "INTERNAL";

export interface EvalDeps {
  chainId: SupportedChainId;
  client: PublicClient;
  store: SponsorStore;
  policy: SponsorPolicy;
  deployment: Deployment;
  now: () => number;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  /** Ops per eth_simulateV1 request. */
  simulateChunk?: number | undefined;
}

export interface EvalSuccess {
  ok: true;
  operations: CleanupOperation[];
  simulations: SimulatedCall[];
  perCallGas: bigint[];
  gasTotal: bigint;
}
export interface EvalDenial {
  ok: false;
  code: DenialCode;
  reason: string;
  /** Index of the offending operation when applicable. */
  index?: number;
  simulations?: SimulatedCall[];
}
export type EvalResult = EvalSuccess | EvalDenial;

const codeCache = new Map<string, { hasCode: boolean; expires: number }>();
const CODE_TTL_MS = 5 * 60 * 1000;

export async function evaluateOperations(deps: EvalDeps, sender: Address, input: CleanupOperation[]): Promise<EvalResult> {
  const { policy } = deps;
  const now = deps.now();

  // 1. Structure
  if (input.length === 0) return deny("TOO_MANY_CALLS", "no operations");
  if (input.length > policy.MAX_CALLS_PER_BATCH) {
    return deny("TOO_MANY_CALLS", `batch of ${input.length} exceeds ${policy.MAX_CALLS_PER_BATCH}`);
  }
  let calldataBytes = 0;
  for (const op of input) calldataBytes += (encodeOperation(op).data.length - 2) / 2;
  if (calldataBytes > policy.MAX_CALLDATA_BYTES) {
    return deny("CALLDATA_TOO_LARGE", `${calldataBytes} bytes exceeds ${policy.MAX_CALLDATA_BYTES}`);
  }
  const seen = new Set<string>();
  for (let i = 0; i < input.length; i++) {
    const op = input[i]!;
    if (!isAddressEqual(op.owner, sender)) return deny("NOT_OWNER", "operation owner is not the authenticated wallet", i);
    // Simulation runs in chunks; duplicate operations on the same asset could
    // pass independently while failing together on-chain. Refuse them.
    const key = `${op.token.toLowerCase()}:${op.tokenId ?? ""}:${op.spender?.toLowerCase() ?? ""}:${op.kind.endsWith("REVOKE") ? "r" : "d"}`;
    if (seen.has(key)) return deny("DUPLICATE_OPERATION", "duplicate operation on the same asset", i);
    seen.add(key);
  }

  // 2. Targets: no sponsor infrastructure, denylist, must have code.
  const forbidden = forbiddenTargets(deps.deployment);
  for (let i = 0; i < input.length; i++) {
    const token = input[i]!.token;
    if (forbidden.some((f) => isAddressEqual(f, token)) || isAddressEqual(token, sender)) {
      return deny("SELF_TARGET", "target is sponsor infrastructure or the wallet itself", i);
    }
    const risk = await deps.store.getContractRisk(token);
    if (risk && (risk.manualDeny || (risk.denyUntil !== null && risk.denyUntil > now))) {
      return deny("TOKEN_DENYLISTED", risk.reason ?? "token contract is temporarily excluded from sponsorship", i);
    }
  }
  const uniqueTokens = [...new Set(input.map((o) => o.token.toLowerCase()))] as Address[];
  for (const token of uniqueTokens) {
    if (!(await hasCode(deps.client, token, now))) {
      const i = input.findIndex((o) => isAddressEqual(o.token, token));
      return deny("NO_CODE", "token address has no contract code", i);
    }
  }

  // 3. Ownership / balance truth from chain, resolving burn(uint256) ambiguity.
  const resolved = await resolveOwnership(deps, sender, input);
  if (!resolved.ok) return resolved;
  const operations = resolved.operations;

  // 4. Simulation
  let simulations: SimulatedCall[];
  try {
    simulations = await simulateOperations(deps.client, operations, { maxGasPerCall: policy.MAX_GAS_PER_CALL, chunkSize: deps.simulateChunk });
  } catch (e) {
    deps.log?.("simulation error", { error: msg(e) });
    return deny("SIMULATION_FAILED", "simulation unavailable");
  }

  let gasTotal = 0n;
  const perCallGas: bigint[] = [];
  for (let i = 0; i < simulations.length; i++) {
    const s = simulations[i]!;
    const op = operations[i]!;
    const gas = BigInt(s.gasUsed);
    perCallGas.push(gas);
    if (s.status === "revert") {
      await recordFailure(deps, sender, op, `revert: ${s.revertReason ?? "unknown"}`, now);
      return { ...deny("SIMULATION_FAILED", s.revertReason ?? "operation reverts", i), simulations };
    }
    if (gas > policy.MAX_GAS_PER_CALL) {
      await recordFailure(deps, sender, op, `gas ${gas} above ceiling`, now);
      return { ...deny("GAS_CEILING", `call uses ${gas} gas, ceiling ${policy.MAX_GAS_PER_CALL}`, i), simulations };
    }
    if (s.anomalies.length > 0) {
      await recordFailure(deps, sender, op, s.anomalies.join("; "), now);
      return { ...deny("NON_STANDARD_TOKEN", s.anomalies[0]!, i), simulations };
    }
    gasTotal += gas;
  }
  if (gasTotal > policy.MAX_GAS_PER_BATCH) {
    return { ...deny("GAS_CEILING", `batch uses ${gasTotal} gas, ceiling ${policy.MAX_GAS_PER_BATCH}`), simulations };
  }

  // 5. Contract telemetry (success path)
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!;
    const gas = perCallGas[i]!;
    let denyUntil: number | null = null;
    const risk = await deps.store.getContractRisk(op.token);
    if (risk) {
      const samples = risk.gasSamples + 1;
      const avg = (risk.gasTotal + gas) / BigInt(samples);
      if (samples >= 5 && avg > policy.CONTRACT_SUSPICIOUS_AVG_GAS) denyUntil = now + policy.CONTRACT_TEMP_DENY_MS;
    }
    await deps.store.recordContractResult(op.token, true, gas, now, denyUntil);
  }

  return { ok: true, operations, simulations, perCallGas, gasTotal };
}

export interface LimitCheck {
  sender: Address;
  gasTotal: bigint;
  /** Worst-case cost the sponsor would commit to. */
  maxCostWei: bigint;
  maxFeePerGas: bigint;
}

export type LimitResult = { ok: true } | { ok: false; code: DenialCode; reason: string };

export async function checkSponsorLimits(deps: EvalDeps, check: LimitCheck): Promise<LimitResult> {
  const { policy } = deps;
  const now = deps.now();

  if (check.maxFeePerGas > policy.MAX_FEE_PER_GAS) {
    return { ok: false, code: "FEE_TOO_HIGH", reason: `maxFeePerGas above ${policy.MAX_FEE_PER_GAS} wei` };
  }
  try {
    const gasPrice = await deps.client.getGasPrice();
    if (gasPrice > 0n && check.maxFeePerGas > gasPrice * policy.MAX_FEE_MULTIPLIER_OVER_BASE) {
      return { ok: false, code: "FEE_TOO_HIGH", reason: "maxFeePerGas far above current network price" };
    }
  } catch {
    /* fall through to absolute cap only */
  }
  if (check.maxCostWei > policy.MAX_COST_PER_OPERATION) {
    return { ok: false, code: "COST_CEILING", reason: `worst-case cost exceeds ${policy.MAX_COST_PER_OPERATION} wei` };
  }

  const usage = await deps.store.getWalletUsage(check.sender, dayKey(now));
  if (usage.cooldownUntil !== null && usage.cooldownUntil > now) {
    return { ok: false, code: "WALLET_COOLDOWN", reason: "wallet is cooling down after repeated failed simulations" };
  }
  if (usage.ops >= policy.MAX_SPONSORED_OPS_PER_WALLET_PER_DAY) {
    return { ok: false, code: "WALLET_RATE_LIMIT", reason: "daily sponsored operation limit reached for this wallet" };
  }
  if (usage.gas + check.gasTotal > policy.MAX_SPONSORED_GAS_PER_WALLET_PER_DAY) {
    return { ok: false, code: "WALLET_RATE_LIMIT", reason: "daily sponsored gas limit reached for this wallet" };
  }

  await deps.store.expireStaleReservations(now - 30 * 60 * 1000);
  const hour = await deps.store.getSpend(now - 60 * 60 * 1000);
  if (hour.spentWei + check.maxCostWei > policy.MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR) {
    return { ok: false, code: "BUDGET_EXHAUSTED", reason: "hourly sponsor budget exhausted" };
  }
  const day = await deps.store.getSpend(now - 24 * 60 * 60 * 1000);
  if (day.spentWei + check.maxCostWei > policy.MAX_GLOBAL_SPONSOR_SPEND_PER_DAY) {
    return { ok: false, code: "BUDGET_EXHAUSTED", reason: "daily sponsor budget exhausted" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------

async function resolveOwnership(
  deps: EvalDeps,
  sender: Address,
  input: CleanupOperation[],
): Promise<{ ok: true; operations: CleanupOperation[] } | EvalDenial> {
  type Read = { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] };
  const reads: Read[] = input.flatMap((op): Read[] => {
    switch (op.kind) {
      case "ERC20_BURN":
        return [
          { address: op.token, abi: erc20Abi, functionName: "balanceOf" as const, args: [sender] as const },
          { address: op.token, abi: erc721Abi, functionName: "ownerOf" as const, args: [BigInt(op.amount ?? "0")] as const },
        ];
      case "ERC20_DEAD":
        return [{ address: op.token, abi: erc20Abi, functionName: "balanceOf" as const, args: [sender] as const }];
      case "ERC721_BURN":
      case "ERC721_DEAD":
        return [{ address: op.token, abi: erc721Abi, functionName: "ownerOf" as const, args: [BigInt(op.tokenId ?? "0")] as const }];
      case "ERC1155_BURN":
      case "ERC1155_DEAD":
        return [
          {
            address: op.token,
            abi: erc1155Abi,
            functionName: "balanceOf" as const,
            args: [sender, BigInt(op.tokenId ?? "0")] as const,
          },
        ];
      case "ERC20_REVOKE":
        return [{ address: op.token, abi: erc20Abi, functionName: "allowance" as const, args: [sender, op.spender!] as const }];
      case "ERC721_REVOKE":
        return [
          { address: op.token, abi: erc721Abi, functionName: "getApproved" as const, args: [BigInt(op.tokenId ?? "0")] as const },
          { address: op.token, abi: erc721Abi, functionName: "ownerOf" as const, args: [BigInt(op.tokenId ?? "0")] as const },
        ];
      case "OPERATOR_REVOKE":
        return [
          { address: op.token, abi: erc721Abi, functionName: "isApprovedForAll" as const, args: [sender, op.spender!] as const },
        ];
    }
  });

  let results: { status: "success" | "failure"; result?: unknown }[];
  try {
    results = (await deps.client.multicall({ allowFailure: true, contracts: reads as never })) as never;
  } catch (e) {
    deps.log?.("ownership multicall failed", { error: msg(e) });
    return deny("INTERNAL", "could not verify ownership");
  }

  const operations: CleanupOperation[] = [];
  let cursor = 0;
  const next = () => results[cursor++];
  for (let i = 0; i < input.length; i++) {
    const op = input[i]!;
    switch (op.kind) {
      case "ERC20_BURN": {
        const bal = next();
        const own = next();
        const amount = BigInt(op.amount ?? "0");
        if (bal?.status === "success" && (bal.result as bigint) >= amount) {
          operations.push(op);
        } else if (own?.status === "success" && isAddressEqual(own.result as Address, sender)) {
          operations.push({ ...op, kind: "ERC721_BURN", tokenId: op.amount!, amount: undefined });
        } else {
          return deny("INSUFFICIENT_BALANCE", "wallet does not hold the requested amount", i);
        }
        break;
      }
      case "ERC20_DEAD": {
        const bal = next();
        if (bal?.status !== "success" || (bal.result as bigint) < BigInt(op.amount ?? "0")) {
          return deny("INSUFFICIENT_BALANCE", "wallet does not hold the requested amount", i);
        }
        operations.push(op);
        break;
      }
      case "ERC721_BURN":
      case "ERC721_DEAD": {
        const own = next();
        if (own?.status !== "success" || !isAddressEqual(own.result as Address, sender)) {
          return deny("NOT_OWNER", "wallet does not own this token", i);
        }
        operations.push(op);
        break;
      }
      case "ERC1155_BURN":
      case "ERC1155_DEAD": {
        const bal = next();
        if (bal?.status !== "success" || (bal.result as bigint) < BigInt(op.amount ?? "0")) {
          return deny("INSUFFICIENT_BALANCE", "wallet does not hold the requested amount", i);
        }
        operations.push(op);
        break;
      }
      case "ERC20_REVOKE": {
        const al = next();
        if (al?.status !== "success" || (al.result as bigint) === 0n) {
          return deny("NOTHING_TO_REVOKE", "allowance is already zero", i);
        }
        operations.push(op);
        break;
      }
      case "ERC721_REVOKE": {
        const approved = next();
        const own = next();
        if (own?.status !== "success" || !isAddressEqual(own.result as Address, sender)) {
          return deny("NOT_OWNER", "wallet does not own this token", i);
        }
        if (
          approved?.status !== "success" ||
          isAddressEqual(approved.result as Address, "0x0000000000000000000000000000000000000000")
        ) {
          return deny("NOTHING_TO_REVOKE", "token has no approval set", i);
        }
        operations.push(op);
        break;
      }
      case "OPERATOR_REVOKE": {
        const ap = next();
        if (ap?.status !== "success" || !(ap.result as boolean)) {
          return deny("NOTHING_TO_REVOKE", "operator is not approved", i);
        }
        operations.push(op);
        break;
      }
    }
  }
  return { ok: true, operations };
}

async function recordFailure(deps: EvalDeps, wallet: Address, op: CleanupOperation, reason: string, now: number): Promise<void> {
  const { policy } = deps;
  try {
    await deps.store.insertFailedSimulation({
      id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
      chainId: deps.chainId,
      wallet,
      token: op.token,
      kind: op.kind,
      reason,
      createdAt: now,
    });
    // Wallet cooldown after repeated failures.
    const usage = await deps.store.getWalletUsage(wallet, dayKey(now));
    const recent = usage.failedSimTimestamps.filter((t) => t > now - policy.WALLET_FAILED_SIM_WINDOW_MS).length + 1;
    const cooldown = recent >= policy.WALLET_FAILED_SIM_THRESHOLD ? now + policy.WALLET_COOLDOWN_MS : null;
    await deps.store.recordWalletFailedSimulation(wallet, dayKey(now), now, cooldown);
    // Contract temp denylist after repeated failures.
    const risk = await deps.store.getContractRisk(op.token);
    const failures = (risk?.failureTimestamps ?? []).filter((t) => t > now - policy.CONTRACT_FAILURE_WINDOW_MS).length + 1;
    const denyUntil = failures >= policy.CONTRACT_FAILURE_THRESHOLD ? now + policy.CONTRACT_TEMP_DENY_MS : null;
    await deps.store.recordContractResult(op.token, false, null, now, denyUntil);
  } catch (e) {
    deps.log?.("failed to record failure", { error: msg(e) });
  }
}

export function forbiddenTargets(d: Deployment): Address[] {
  const list: (Address | undefined)[] = [
    ENTRYPOINT_V06,
    ENTRYPOINT_V07,
    ENTRYPOINT_V08,
    MULTICALL3_ADDRESS,
    d.entryPoint,
    d.paymaster,
    d.sponsorReserve,
    d.feeRouter,
    d.treasury,
  ];
  return list.filter((a): a is Address => Boolean(a));
}

async function hasCode(client: PublicClient, address: Address, now: number): Promise<boolean> {
  const key = address.toLowerCase();
  const hit = codeCache.get(key);
  if (hit && hit.expires > now) return hit.hasCode;
  const code = await client.getCode({ address });
  const hasCode = Boolean(code && code !== "0x");
  codeCache.set(key, { hasCode, expires: now + CODE_TTL_MS });
  return hasCode;
}

export function clearCodeCache(): void {
  codeCache.clear();
}

function deny(code: DenialCode, reason: string, index?: number): EvalDenial {
  return index === undefined ? { ok: false, code, reason } : { ok: false, code, reason, index };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
