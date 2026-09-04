import {
  decodeErrorResult,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  numberToHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { erc1155Abi, erc20Abi, erc721Abi } from "./abis";
import { DEAD_ADDRESS, TOPIC_TRANSFER, ZERO_ADDRESS } from "./constants";
import { encodeOperation, type CleanupOperation } from "./operations";
import type { SimulatedCall } from "./types";

/**
 * Simulation engine built on eth_simulateV1 (supported by Robinhood Chain's Nitro nodes).
 *
 * Every operation is wrapped with pre/post state reads executed in the same
 * simulated block, so we can verify the token actually did what a standard
 * token would do. Any deviation is an anomaly and disqualifies sponsorship.
 */

export interface SimulateOptions {
  /** Hard ceiling on gas per inner call. Above this the call is flagged, not sponsored. */
  maxGasPerCall: bigint;
  /**
   * Operations per eth_simulateV1 request. The public Robinhood Chain gateway
   * rejects requests above ~30 inner calls with HTTP 429, so 10 ops (30 calls)
   * is the safe default; raise it behind a dedicated provider.
   */
  chunkSize?: number | undefined;
}

export const DEFAULT_SIMULATE_CHUNK = 10;

interface RpcCall {
  from: Address;
  to: Address;
  data: Hex;
  value?: Hex;
  gas?: Hex;
}

interface RpcCallResult {
  status: Hex;
  returnData: Hex;
  gasUsed: Hex;
  logs: { address: Address; topics: Hex[]; data: Hex }[];
  error?: { code: number; message: string; data?: Hex };
}

interface RpcBlockResult {
  calls: RpcCallResult[];
}

const ERC20_SUCCESS_TRUE = "0x0000000000000000000000000000000000000000000000000000000000000001";

/**
 * Gas budget handed to each simulated call. Comfortably above the policy
 * ceiling so over-consumption is measured rather than truncated, but small
 * enough that a chunk stays within public gateway limits.
 */
const SIM_CALL_GAS = 600_000n;
const SIM_READ_GAS = 150_000n;

export async function simulateOperations(
  client: PublicClient,
  ops: CleanupOperation[],
  opts: SimulateOptions,
): Promise<SimulatedCall[]> {
  if (ops.length === 0) return [];
  const size = Math.max(1, opts.chunkSize ?? DEFAULT_SIMULATE_CHUNK);
  if (ops.length > size) {
    const out: SimulatedCall[] = [];
    for (let i = 0; i < ops.length; i += size) {
      out.push(...(await simulateOperations(client, ops.slice(i, i + size), { ...opts, chunkSize: size })));
    }
    return out;
  }
  const plans = ops.map(planOperation);
  const calls: RpcCall[] = plans.flatMap((p) => p.calls);

  const res = (await client.request({
    // eth_simulateV1 is not in viem's typed schema; the cast is deliberate.
    method: "eth_simulateV1" as never,
    params: [
      {
        blockStateCalls: [{ calls }],
        validation: false,
        traceTransfers: true,
      },
      "latest",
    ] as never,
  })) as RpcBlockResult[];

  const block = res[0];
  if (!block) throw new Error("simulation returned no block");
  const results = block.calls;
  if (results.length !== calls.length) throw new Error("simulation result length mismatch");

  let cursor = 0;
  return plans.map((plan) => {
    const slice = results.slice(cursor, cursor + plan.calls.length);
    cursor += plan.calls.length;
    return plan.evaluate(slice, opts);
  });
}

interface Plan {
  calls: RpcCall[];
  evaluate: (results: RpcCallResult[], opts: SimulateOptions) => SimulatedCall;
}

/**
 * Build [pre-reads..., op, post-reads...] for one operation together with the
 * evaluator that turns raw results into a verdict.
 */
function planOperation(op: CleanupOperation): Plan {
  const encoded = encodeOperation(op);
  const owner = op.owner;
  const token = op.token;
  const opCall: RpcCall = { from: owner, to: token, data: encoded.data, value: "0x0", gas: numberToHex(SIM_CALL_GAS) };
  const read = (data: Hex): RpcCall => ({ from: owner, to: token, data, gas: numberToHex(SIM_READ_GAS) });

  const base = (results: RpcCallResult[], opIndex: number, opts: SimulateOptions) => {
    const r = results[opIndex]!;
    const anomalies: string[] = [];
    const status: "success" | "revert" = r.status === "0x1" ? "success" : "revert";
    const gasUsed = BigInt(r.gasUsed);
    const revertReason = status === "revert" ? decodeRevert(r.error?.data ?? r.returnData) : null;

    if (status === "success") {
      if (gasUsed > opts.maxGasPerCall) anomalies.push(`Gas use ${gasUsed} exceeds ceiling ${opts.maxGasPerCall}`);
      for (const log of r.logs ?? []) {
        if (isAddressEqual(log.address, ZERO_ADDRESS)) {
          // eth_simulateV1 traceTransfers reports ETH movement as Transfer logs from address(0).
          if (log.topics[0] === TOPIC_TRANSFER) anomalies.push("Native ETH transfer during token operation");
          continue;
        }
        if (!isAddressEqual(log.address, token)) {
          anomalies.push(`Emitted events from external contract ${getAddress(log.address)}`);
          break;
        }
      }
    }
    return { r, anomalies, status, gasUsed, revertReason };
  };

  const finish = (
    ctx: ReturnType<typeof base>,
    extra: string[],
  ): SimulatedCall => ({
    to: token,
    data: encoded.data,
    status: ctx.status,
    gasUsed: ctx.gasUsed.toString(),
    revertReason: ctx.revertReason,
    anomalies: [...ctx.anomalies, ...extra],
    logsCount: ctx.r.logs?.length ?? 0,
  });

  switch (op.kind) {
    case "ERC20_BURN":
    case "ERC20_DEAD": {
      const amount = BigInt(op.amount ?? "0");
      const balanceOf = read(encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [owner] }));
      return {
        calls: [balanceOf, opCall, balanceOf],
        evaluate: (results, opts) => {
          const ctx = base(results, 1, opts);
          const extra: string[] = [];
          if (ctx.status === "success") {
            const before = safeUint(results[0]);
            const after = safeUint(results[2]);
            if (before === null || after === null) extra.push("balanceOf did not return a uint256");
            else if (before - after !== amount) extra.push(`Balance changed by ${before - after}, expected ${amount}`);
            if (op.kind === "ERC20_DEAD" && ctx.r.returnData !== "0x" && ctx.r.returnData !== ERC20_SUCCESS_TRUE) {
              extra.push("transfer() returned false");
            }
            if (op.kind === "ERC20_DEAD" && !hasTransferLog(ctx.r, owner, DEAD_ADDRESS)) {
              extra.push("No Transfer event to dead address");
            }
          }
          return finish(ctx, extra);
        },
      };
    }
    case "ERC721_BURN":
    case "ERC721_DEAD": {
      const tokenId = BigInt(op.tokenId ?? "0");
      const ownerOf = read(encodeFunctionData({ abi: erc721Abi, functionName: "ownerOf", args: [tokenId] }));
      return {
        calls: [ownerOf, opCall, ownerOf],
        evaluate: (results, opts) => {
          const ctx = base(results, 1, opts);
          const extra: string[] = [];
          if (ctx.status === "success") {
            const before = safeAddress(results[0]);
            if (!before || !isAddressEqual(before, owner)) extra.push("Token not owned by wallet");
            const afterRes = results[2]!;
            const after = afterRes.status === "0x1" ? safeAddress(afterRes) : null;
            if (after && isAddressEqual(after, owner)) extra.push("Token still owned by wallet after operation");
            if (op.kind === "ERC721_DEAD" && after && !isAddressEqual(after, DEAD_ADDRESS)) {
              extra.push("Token did not end up at dead address");
            }
          }
          return finish(ctx, extra);
        },
      };
    }
    case "ERC1155_BURN":
    case "ERC1155_DEAD": {
      const tokenId = BigInt(op.tokenId ?? "0");
      const amount = BigInt(op.amount ?? "0");
      const balanceOf = read(encodeFunctionData({ abi: erc1155Abi, functionName: "balanceOf", args: [owner, tokenId] }));
      return {
        calls: [balanceOf, opCall, balanceOf],
        evaluate: (results, opts) => {
          const ctx = base(results, 1, opts);
          const extra: string[] = [];
          if (ctx.status === "success") {
            const before = safeUint(results[0]);
            const after = safeUint(results[2]);
            if (before === null || after === null) extra.push("balanceOf did not return a uint256");
            else if (before - after !== amount) extra.push(`Balance changed by ${before - after}, expected ${amount}`);
          }
          return finish(ctx, extra);
        },
      };
    }
    case "ERC20_REVOKE": {
      const spender = op.spender!;
      const allowance = read(encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [owner, spender] }));
      return {
        calls: [opCall, allowance],
        evaluate: (results, opts) => {
          const ctx = base(results, 0, opts);
          const extra: string[] = [];
          if (ctx.status === "success") {
            const after = safeUint(results[1]);
            if (after === null) extra.push("allowance did not return a uint256");
            else if (after !== 0n) extra.push(`Allowance still ${after} after revoke`);
          }
          return finish(ctx, extra);
        },
      };
    }
    case "ERC721_REVOKE": {
      const tokenId = BigInt(op.tokenId ?? "0");
      const approved = read(encodeFunctionData({ abi: erc721Abi, functionName: "getApproved", args: [tokenId] }));
      return {
        calls: [opCall, approved],
        evaluate: (results, opts) => {
          const ctx = base(results, 0, opts);
          const extra: string[] = [];
          if (ctx.status === "success") {
            const after = results[1]!.status === "0x1" ? safeAddress(results[1]) : null;
            if (after && !isAddressEqual(after, ZERO_ADDRESS)) extra.push("Token approval still set after revoke");
          }
          return finish(ctx, extra);
        },
      };
    }
    case "OPERATOR_REVOKE": {
      const operator = op.spender!;
      const isApproved = read(
        encodeFunctionData({ abi: erc721Abi, functionName: "isApprovedForAll", args: [owner, operator] }),
      );
      return {
        calls: [opCall, isApproved],
        evaluate: (results, opts) => {
          const ctx = base(results, 0, opts);
          const extra: string[] = [];
          if (ctx.status === "success") {
            const after = safeBool(results[1]);
            if (after === null) extra.push("isApprovedForAll did not return a bool");
            else if (after) extra.push("Operator still approved after revoke");
          }
          return finish(ctx, extra);
        },
      };
    }
  }
}

function hasTransferLog(r: RpcCallResult, from: Address, to: Address): boolean {
  return (r.logs ?? []).some(
    (l) =>
      l.topics[0] === TOPIC_TRANSFER &&
      l.topics.length >= 3 &&
      topicToAddress(l.topics[1]!) === from.toLowerCase() &&
      topicToAddress(l.topics[2]!) === to.toLowerCase(),
  );
}

function topicToAddress(topic: Hex): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function safeUint(r: RpcCallResult | undefined): bigint | null {
  if (!r || r.status !== "0x1" || r.returnData.length < 66) return null;
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: r.returnData });
  } catch {
    return null;
  }
}
function safeAddress(r: RpcCallResult | undefined): Address | null {
  if (!r || r.status !== "0x1" || r.returnData.length < 66) return null;
  try {
    return getAddress(`0x${r.returnData.slice(26, 66)}`);
  } catch {
    return null;
  }
}
function safeBool(r: RpcCallResult | undefined): boolean | null {
  if (!r || r.status !== "0x1" || r.returnData.length < 66) return null;
  return BigInt(r.returnData) !== 0n;
}

export function decodeRevert(data: Hex | undefined): string {
  if (!data || data === "0x") return "Reverted without reason";
  try {
    const decoded = decodeErrorResult({ abi: [], data });
    if (decoded.errorName === "Error") return String(decoded.args?.[0] ?? "Error");
    if (decoded.errorName === "Panic") return `Panic(${String(decoded.args?.[0])})`;
    return decoded.errorName;
  } catch {
    return `Reverted (${data.slice(0, 10)})`;
  }
}
