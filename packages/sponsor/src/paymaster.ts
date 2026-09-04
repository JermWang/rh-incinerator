import { isAddressEqual, numberToHex, type Address, type Hex, type PrivateKeyAccount } from "viem";
import { getUserOperationHash } from "viem/account-abstraction";
import { ENTRYPOINT_V07, type Deployment } from "@incinerator/chain";
import { alchemyPaymasterCall, userOpToWire } from "./alchemy";
import { decodeAccountCallData } from "./decode";
import type { SponsorEnv } from "./env";
import { checkSponsorLimits, evaluateOperations, type DenialCode, type EvalDeps } from "./evaluate";
import { callsToOperations, type PolicyCode } from "./policy";
import type { SessionPayload } from "./session";
import { DEFAULT_PAYMASTER_GAS, signPaymasterData, stubPaymasterData } from "./signer";
import { getSponsorStatus } from "./status";
import { dayKey } from "./store";
import { paymasterRpcParamsSchema, rpcError, rpcResult, type JsonRpcRequest, type JsonRpcResponse, type UserOperationV07 } from "./userop";

/**
 * ERC-7677 paymaster service.
 *
 * Wallets that support EIP-5792 `paymasterService` call this endpoint with the
 * UserOperation they intend to send. Nothing is signed until every layer of
 * the policy engine has passed.
 */

export interface PaymasterDeps extends EvalDeps {
  env: SponsorEnv;
  deployment: Deployment;
  signer: PrivateKeyAccount | null;
  session: SessionPayload | null;
}

export type SponsorDenialCode = DenialCode | PolicyCode | "WRONG_CHAIN" | "UNAUTHENTICATED" | "UNSUPPORTED_ENTRYPOINT" | "UNSUPPORTED_ACCOUNT" | "SPONSOR_PAUSED";

const RPC_POLICY_DENIED = -32002;
const RPC_INVALID_PARAMS = -32602;
const RPC_METHOD_NOT_FOUND = -32601;

export async function handlePaymasterRpc(deps: PaymasterDeps, req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = req.id ?? null;
  if (req.method !== "pm_getPaymasterStubData" && req.method !== "pm_getPaymasterData") {
    return rpcError(id, RPC_METHOD_NOT_FOUND, `method ${req.method} not supported`);
  }
  const parsed = paymasterRpcParamsSchema.safeParse(req.params);
  if (!parsed.success) return rpcError(id, RPC_INVALID_PARAMS, "invalid ERC-7677 params", parsed.error.issues.slice(0, 3));
  const [userOp, entryPoint, chainIdHex, context] = parsed.data;
  const isFinal = req.method === "pm_getPaymasterData";

  const verdict = await sponsorUserOperation(deps, { userOp, entryPoint, chainId: Number(BigInt(chainIdHex)), context, isFinal });
  if (!verdict.ok) return rpcError(id, RPC_POLICY_DENIED, verdict.reason, { code: verdict.code, index: verdict.index });
  return rpcResult(id, verdict.result);
}

export interface SponsorInput {
  userOp: UserOperationV07;
  entryPoint: Address;
  chainId: number;
  context?: Record<string, unknown> | null | undefined;
  isFinal: boolean;
}

export type SponsorVerdict =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; code: SponsorDenialCode; reason: string; index?: number };

export async function sponsorUserOperation(deps: PaymasterDeps, input: SponsorInput): Promise<SponsorVerdict> {
  const { userOp, env, policy } = { ...input, env: deps.env, policy: deps.policy };
  const now = deps.now();

  // 1. chain + entrypoint
  if (input.chainId !== deps.chainId) return deny("WRONG_CHAIN", `expected chain ${deps.chainId}`);
  if (!isAddressEqual(input.entryPoint, ENTRYPOINT_V07) || !isAddressEqual(deps.deployment.entryPoint, ENTRYPOINT_V07)) {
    return deny("UNSUPPORTED_ENTRYPOINT", "only EntryPoint v0.7 is sponsored");
  }
  if (userOp.initCode && userOp.initCode !== "0x" && !userOp.factory) {
    return deny("UNSUPPORTED_ACCOUNT", "packed initCode is not supported; send factory/factoryData");
  }

  // 2. authenticated wallet owns the request
  if (!deps.session) return deny("UNAUTHENTICATED", "wallet session required");
  if (deps.session.chainId !== deps.chainId || !isAddressEqual(deps.session.address, userOp.sender)) {
    return deny("UNAUTHENTICATED", "UserOperation sender does not match the authenticated wallet");
  }

  // 3. sponsor availability (kill switch, balance, budget, configuration)
  const status = await getSponsorStatus({
    chainId: deps.chainId,
    backend: env.backend,
    client: deps.client as never,
    store: deps.store,
    policy,
    deployment: deps.deployment,
    now: deps.now,
  });
  if (!status.active) return deny(status.state === "PAUSED" ? "SPONSOR_PAUSED" : "SPONSOR_UNAVAILABLE", status.reason);
  if (env.backend === "self" && (!deps.signer || !deps.deployment.paymaster)) {
    return deny("SPONSOR_UNAVAILABLE", "paymaster signer not configured");
  }

  // 4. decode calldata; unknown wrappers are rejected
  if ((userOp.callData.length - 2) / 2 > policy.MAX_CALLDATA_BYTES) return deny("CALLDATA_TOO_LARGE", "callData too large");
  const decoded = decodeAccountCallData(userOp.callData);
  if (!decoded.ok) return deny("UNSUPPORTED_ACCOUNT", decoded.reason);

  // 5. allowlist policy
  const forbidden = [deps.deployment.paymaster, deps.deployment.sponsorReserve, deps.deployment.feeRouter, deps.deployment.treasury, input.entryPoint].filter(
    (a): a is Address => Boolean(a),
  );
  const policyResult = callsToOperations(decoded.calls, userOp.sender, forbidden);
  if (!policyResult.ok) return { ok: false, code: policyResult.code, reason: policyResult.reason, index: policyResult.index };

  // 6-13. ownership truth, simulation, gas ceilings
  const evaluated = await evaluateOperations(deps, userOp.sender, policyResult.operations);
  if (!evaluated.ok) return { ok: false, code: evaluated.code, reason: evaluated.reason, ...(evaluated.index !== undefined ? { index: evaluated.index } : {}) };

  // Wallet-supplied gas fields are bounded independently of the simulation.
  if (userOp.callGasLimit > policy.MAX_GAS_PER_BATCH) return deny("GAS_CEILING", "callGasLimit above ceiling");
  if (userOp.verificationGasLimit > policy.MAX_VERIFICATION_GAS) return deny("GAS_CEILING", "verificationGasLimit above ceiling");
  if (userOp.preVerificationGas > policy.MAX_PRE_VERIFICATION_GAS) return deny("GAS_CEILING", "preVerificationGas above ceiling");
  const pmGas = DEFAULT_PAYMASTER_GAS;
  const gasUnits =
    userOp.callGasLimit +
    userOp.verificationGasLimit +
    userOp.preVerificationGas +
    pmGas.paymasterVerificationGasLimit +
    pmGas.paymasterPostOpGasLimit;
  const maxCostWei = gasUnits * userOp.maxFeePerGas;

  // 14-16. rate limits and budgets
  const limits = await checkSponsorLimits(deps, {
    sender: userOp.sender,
    gasTotal: evaluated.gasTotal,
    maxCostWei,
    maxFeePerGas: userOp.maxFeePerGas,
  });
  if (!limits.ok) return { ok: false, code: limits.code, reason: limits.reason };

  // 17. issue sponsorship
  const validAfter = 0;
  const validUntil = Math.floor(now / 1000) + policy.SPONSORSHIP_VALIDITY_SECONDS;

  if (env.backend === "alchemy") {
    const wire = userOpToWire(userOp);
    let result: unknown;
    try {
      result = await alchemyPaymasterCall({
        apiKey: env.alchemyApiKey!,
        policyId: env.alchemyGasPolicyId!,
        chainId: deps.chainId,
        method: input.isFinal ? "pm_getPaymasterData" : "pm_getPaymasterStubData",
        userOp: wire,
        entryPoint: input.entryPoint,
      });
    } catch (e) {
      deps.log?.("alchemy paymaster error", { error: e instanceof Error ? e.message : String(e) });
      return deny("SPONSOR_UNAVAILABLE", "sponsor backend rejected the request");
    }
    if (input.isFinal) await recordReservation(deps, userOp, evaluated.operations.map((o) => o.kind), gasUnits, maxCostWei, null, now);
    return { ok: true, result: result as Record<string, unknown> };
  }

  // self backend: VerifyingPaymaster
  const paymaster = deps.deployment.paymaster!;
  if (!input.isFinal) {
    return {
      ok: true,
      result: {
        paymaster,
        paymasterData: stubPaymasterData(validUntil, validAfter),
        paymasterVerificationGasLimit: numberToHex(pmGas.paymasterVerificationGasLimit),
        paymasterPostOpGasLimit: numberToHex(pmGas.paymasterPostOpGasLimit),
        sponsor: { name: "Incinerator creator-fee sponsor" },
        isFinal: false,
      },
    };
  }

  const paymasterData = await signPaymasterData({
    account: deps.signer!,
    userOp: { ...userOp, paymaster, paymasterVerificationGasLimit: pmGas.paymasterVerificationGasLimit, paymasterPostOpGasLimit: pmGas.paymasterPostOpGasLimit },
    paymaster,
    chainId: deps.chainId,
    gas: pmGas,
    validUntil,
    validAfter,
  });

  let userOpHash: Hex | null = null;
  try {
    userOpHash = getUserOperationHash({
      chainId: deps.chainId,
      entryPointAddress: input.entryPoint,
      entryPointVersion: "0.7",
      userOperation: {
        sender: userOp.sender,
        nonce: userOp.nonce,
        ...(userOp.factory ? { factory: userOp.factory, factoryData: userOp.factoryData ?? "0x" } : {}),
        callData: userOp.callData,
        callGasLimit: userOp.callGasLimit,
        verificationGasLimit: userOp.verificationGasLimit,
        preVerificationGas: userOp.preVerificationGas,
        maxFeePerGas: userOp.maxFeePerGas,
        maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
        paymaster,
        paymasterVerificationGasLimit: pmGas.paymasterVerificationGasLimit,
        paymasterPostOpGasLimit: pmGas.paymasterPostOpGasLimit,
        paymasterData,
        signature: userOp.signature ?? "0x",
      },
    });
  } catch {
    userOpHash = null;
  }

  await recordReservation(deps, userOp, evaluated.operations.map((o) => o.kind), gasUnits, maxCostWei, userOpHash, now);

  return {
    ok: true,
    result: {
      paymaster,
      paymasterData,
      paymasterVerificationGasLimit: numberToHex(pmGas.paymasterVerificationGasLimit),
      paymasterPostOpGasLimit: numberToHex(pmGas.paymasterPostOpGasLimit),
      sponsor: { name: "Incinerator creator-fee sponsor" },
      isFinal: true,
    },
  };
}

async function recordReservation(
  deps: PaymasterDeps,
  userOp: UserOperationV07,
  kinds: string[],
  gasUnits: bigint,
  maxCostWei: bigint,
  userOpHash: Hex | null,
  now: number,
): Promise<void> {
  const id = `${now}-${userOp.sender.slice(2, 10)}-${Math.random().toString(36).slice(2, 8)}`;
  await deps.store.insertSponsoredOperation({
    id,
    chainId: deps.chainId,
    wallet: userOp.sender,
    userOpHash,
    txHash: null,
    kinds,
    callCount: kinds.length,
    gasLimit: gasUnits,
    maxFeePerGas: userOp.maxFeePerGas,
    reservedCostWei: maxCostWei,
    actualCostWei: null,
    status: "RESERVED",
    createdAt: now,
    confirmedAt: null,
  });
  await deps.store.recordWalletSponsoredOp(userOp.sender, dayKey(now), gasUnits);
}

function deny(code: SponsorDenialCode, reason: string): SponsorVerdict {
  return { ok: false, code, reason };
}
