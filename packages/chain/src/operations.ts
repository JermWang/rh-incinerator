import { encodeFunctionData, getAddress, isAddress, type Address, type Hex } from "viem";
import { z } from "zod";
import { erc1155Abi, erc20Abi, erc721Abi } from "./abis";
import { DEAD_ADDRESS, ZERO_ADDRESS } from "./constants";

/**
 * The closed set of cleanup operations. Anything outside this set is never
 * constructed by the app and never sponsored by the policy engine.
 */
export const OPERATION_KINDS = [
  "ERC20_BURN",
  "ERC20_DEAD",
  "ERC721_BURN",
  "ERC721_DEAD",
  "ERC1155_BURN",
  "ERC1155_DEAD",
  "ERC20_REVOKE",
  "ERC721_REVOKE",
  "OPERATOR_REVOKE",
] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

const addressSchema = z
  .string()
  .refine((s) => isAddress(s), "invalid address")
  .transform((s) => getAddress(s) as Address);

const uintSchema = z
  .string()
  .refine((s) => /^\d{1,78}$/.test(s) && BigInt(s) <= (1n << 256n) - 1n, "expected uint256 decimal string");

export const cleanupOperationSchema = z.object({
  kind: z.enum(OPERATION_KINDS),
  token: addressSchema,
  owner: addressSchema,
  amount: uintSchema.optional(),
  tokenId: uintSchema.optional(),
  spender: addressSchema.optional(),
  label: z
    .object({ title: z.string().max(80), subtitle: z.string().max(120) })
    .optional(),
});

export type CleanupOperation = z.infer<typeof cleanupOperationSchema>;

export interface EncodedCall {
  to: Address;
  data: Hex;
  value: 0n;
}

export function isDestructive(kind: OperationKind): boolean {
  return !kind.endsWith("REVOKE");
}

/** Deterministically encode an operation. Recipients are hard-coded; amounts come from the op. */
export function encodeOperation(op: CleanupOperation): EncodedCall {
  switch (op.kind) {
    case "ERC20_BURN":
      return call(op.token, encodeFunctionData({ abi: erc20Abi, functionName: "burn", args: [need(op.amount, "amount")] }));
    case "ERC20_DEAD":
      return call(
        op.token,
        encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [DEAD_ADDRESS, need(op.amount, "amount")] }),
      );
    case "ERC721_BURN":
      return call(op.token, encodeFunctionData({ abi: erc721Abi, functionName: "burn", args: [need(op.tokenId, "tokenId")] }));
    case "ERC721_DEAD":
      return call(
        op.token,
        encodeFunctionData({
          abi: erc721Abi,
          functionName: "transferFrom",
          args: [op.owner, DEAD_ADDRESS, need(op.tokenId, "tokenId")],
        }),
      );
    case "ERC1155_BURN":
      return call(
        op.token,
        encodeFunctionData({
          abi: erc1155Abi,
          functionName: "burn",
          args: [op.owner, need(op.tokenId, "tokenId"), need(op.amount, "amount")],
        }),
      );
    case "ERC1155_DEAD":
      return call(
        op.token,
        encodeFunctionData({
          abi: erc1155Abi,
          functionName: "safeTransferFrom",
          args: [op.owner, DEAD_ADDRESS, need(op.tokenId, "tokenId"), need(op.amount, "amount"), "0x"],
        }),
      );
    case "ERC20_REVOKE":
      return call(
        op.token,
        encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [needAddr(op.spender), 0n] }),
      );
    case "ERC721_REVOKE":
      return call(
        op.token,
        encodeFunctionData({ abi: erc721Abi, functionName: "approve", args: [ZERO_ADDRESS, need(op.tokenId, "tokenId")] }),
      );
    case "OPERATOR_REVOKE":
      return call(
        op.token,
        encodeFunctionData({ abi: erc721Abi, functionName: "setApprovalForAll", args: [needAddr(op.spender), false] }),
      );
  }
}

export function describeOperation(kind: OperationKind): string {
  switch (kind) {
    case "ERC20_BURN":
    case "ERC721_BURN":
    case "ERC1155_BURN":
      return "Burn via token contract";
    case "ERC20_DEAD":
    case "ERC721_DEAD":
    case "ERC1155_DEAD":
      return "Transfer to dead address";
    case "ERC20_REVOKE":
      return "Revoke token allowance";
    case "ERC721_REVOKE":
      return "Revoke token approval";
    case "OPERATOR_REVOKE":
      return "Revoke operator approval";
  }
}

function call(to: Address, data: Hex): EncodedCall {
  return { to, data, value: 0n };
}
function need(v: string | undefined, name: string): bigint {
  if (v === undefined) throw new Error(`operation missing ${name}`);
  return BigInt(v);
}
function needAddr(v: Address | undefined): Address {
  if (!v) throw new Error("operation missing spender");
  return v;
}
