import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";

/**
 * ERC-7677 UserOperation (EntryPoint v0.7 unpacked form) as sent by wallets
 * to pm_getPaymasterStubData / pm_getPaymasterData.
 */

const hex = z.string().refine((s): s is Hex => isHex(s, { strict: true }), "expected hex");
const hexQty = hex.transform((h) => BigInt(h));
const address = z
  .string()
  .refine((s) => isAddress(s), "expected address")
  .transform((s) => getAddress(s) as Address);

export const userOperationSchema = z
  .object({
    sender: address,
    nonce: hexQty,
    factory: address.optional(),
    factoryData: hex.optional(),
    /** Some wallets send packed initCode; accepted only when empty. */
    initCode: hex.optional(),
    callData: hex,
    callGasLimit: hexQty,
    verificationGasLimit: hexQty,
    preVerificationGas: hexQty,
    maxFeePerGas: hexQty,
    maxPriorityFeePerGas: hexQty,
    paymaster: address.optional(),
    paymasterVerificationGasLimit: hexQty.optional(),
    paymasterPostOpGasLimit: hexQty.optional(),
    paymasterData: hex.optional(),
    signature: hex.optional(),
    eip7702Auth: z.unknown().optional(),
  })
  .passthrough();

export type UserOperationV07 = z.infer<typeof userOperationSchema>;

export const paymasterRpcParamsSchema = z.tuple([
  userOperationSchema,
  address, // entryPoint
  hex, // chainId
  z.record(z.string(), z.unknown()).nullish(), // context
]);

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function rpcResult(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

export function rpcError(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: data === undefined ? { code, message } : { code, message, data } };
}
