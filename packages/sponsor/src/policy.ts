import { decodeAbiParameters, isAddressEqual, size, slice, type Address, type Hex } from "viem";
import { DEAD_ADDRESS, ZERO_ADDRESS, type CleanupOperation } from "@incinerator/chain";
import type { InnerCall } from "./decode";

/**
 * Explicit allowlist of sponsorable calls. Every rule here only ever
 * destroys the caller's own assets or reduces the caller's own approvals.
 *
 * Invariants enforced:
 *  - I2: no native value.
 *  - I3: disposal recipients are hard-coded to the dead address.
 *  - I4: approvals can only be set to zero / false.
 *  - I6: unknown selectors are rejected.
 */

export const SELECTORS = {
  BURN_UINT: "0x42966c68", // burn(uint256)
  TRANSFER: "0xa9059cbb", // transfer(address,uint256)
  TRANSFER_FROM: "0x23b872dd", // transferFrom(address,address,uint256)
  BURN_1155: "0xf5298aca", // burn(address,uint256,uint256)
  SAFE_TRANSFER_FROM_1155: "0xf242432a", // safeTransferFrom(address,address,uint256,uint256,bytes)
  APPROVE: "0x095ea7b3", // approve(address,uint256)
  SET_APPROVAL_FOR_ALL: "0xa22cb465", // setApprovalForAll(address,bool)
} as const;

export type PolicyDenial = { ok: false; code: PolicyCode; reason: string; index: number };
export type PolicyResult = { ok: true; operations: CleanupOperation[] } | PolicyDenial;

export type PolicyCode =
  | "VALUE_NOT_ALLOWED"
  | "UNSUPPORTED_CALL"
  | "ARBITRARY_RECIPIENT"
  | "NOT_OWNER"
  | "APPROVAL_NOT_REVOKE"
  | "SELF_TARGET"
  | "ZERO_AMOUNT";

/**
 * Translate raw inner calls into typed cleanup operations, or deny.
 * Pure: no chain access. Ownership/balance truth is checked in evaluate().
 */
export function callsToOperations(
  calls: InnerCall[],
  sender: Address,
  forbiddenTargets: readonly Address[],
): PolicyResult {
  const ops: CleanupOperation[] = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i]!;
    if (c.value !== 0n) return deny("VALUE_NOT_ALLOWED", "native ETH value is never sponsored", i);
    if (forbiddenTargets.some((t) => isAddressEqual(t, c.to)) || isAddressEqual(c.to, sender)) {
      return deny("SELF_TARGET", "call targets sponsor infrastructure or the sender itself", i);
    }
    if (size(c.data) < 4) return deny("UNSUPPORTED_CALL", "empty calldata", i);
    const selector = slice(c.data, 0, 4).toLowerCase();
    const args: Hex = size(c.data) > 4 ? slice(c.data, 4) : "0x";
    try {
      switch (selector) {
        case SELECTORS.BURN_UINT: {
          const [amount] = decodeAbiParameters([{ type: "uint256" }], args);
          if (amount === 0n) return deny("ZERO_AMOUNT", "burn of zero", i);
          // ERC-20 burn(amount) and ERC-721 burn(tokenId) share a selector; evaluate() resolves which.
          ops.push({ kind: "ERC20_BURN", token: c.to, owner: sender, amount: amount.toString() });
          break;
        }
        case SELECTORS.TRANSFER: {
          const [to, amount] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], args);
          if (!isAddressEqual(to, DEAD_ADDRESS)) return deny("ARBITRARY_RECIPIENT", "transfer recipient must be the dead address", i);
          if (amount === 0n) return deny("ZERO_AMOUNT", "transfer of zero", i);
          ops.push({ kind: "ERC20_DEAD", token: c.to, owner: sender, amount: amount.toString() });
          break;
        }
        case SELECTORS.TRANSFER_FROM: {
          const [from, to, tokenId] = decodeAbiParameters(
            [{ type: "address" }, { type: "address" }, { type: "uint256" }],
            args,
          );
          if (!isAddressEqual(from, sender)) return deny("NOT_OWNER", "transferFrom must move the sender's own token", i);
          if (!isAddressEqual(to, DEAD_ADDRESS)) return deny("ARBITRARY_RECIPIENT", "transferFrom recipient must be the dead address", i);
          ops.push({ kind: "ERC721_DEAD", token: c.to, owner: sender, tokenId: tokenId.toString() });
          break;
        }
        case SELECTORS.BURN_1155: {
          const [account, id, amount] = decodeAbiParameters(
            [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
            args,
          );
          if (!isAddressEqual(account, sender)) return deny("NOT_OWNER", "burn must target the sender's own balance", i);
          if (amount === 0n) return deny("ZERO_AMOUNT", "burn of zero", i);
          ops.push({ kind: "ERC1155_BURN", token: c.to, owner: sender, tokenId: id.toString(), amount: amount.toString() });
          break;
        }
        case SELECTORS.SAFE_TRANSFER_FROM_1155: {
          const [from, to, id, amount, data] = decodeAbiParameters(
            [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
            args,
          );
          if (!isAddressEqual(from, sender)) return deny("NOT_OWNER", "safeTransferFrom must move the sender's own token", i);
          if (!isAddressEqual(to, DEAD_ADDRESS)) return deny("ARBITRARY_RECIPIENT", "recipient must be the dead address", i);
          if (data !== "0x") return deny("UNSUPPORTED_CALL", "safeTransferFrom data payload must be empty", i);
          if (amount === 0n) return deny("ZERO_AMOUNT", "transfer of zero", i);
          ops.push({ kind: "ERC1155_DEAD", token: c.to, owner: sender, tokenId: id.toString(), amount: amount.toString() });
          break;
        }
        case SELECTORS.APPROVE: {
          const [spender, amount] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], args);
          if (amount === 0n) {
            ops.push({ kind: "ERC20_REVOKE", token: c.to, owner: sender, spender });
          } else if (isAddressEqual(spender, ZERO_ADDRESS)) {
            ops.push({ kind: "ERC721_REVOKE", token: c.to, owner: sender, tokenId: amount.toString() });
          } else {
            return deny("APPROVAL_NOT_REVOKE", "approve must set allowance to zero or clear a token approval", i);
          }
          break;
        }
        case SELECTORS.SET_APPROVAL_FOR_ALL: {
          const [operator, approved] = decodeAbiParameters([{ type: "address" }, { type: "bool" }], args);
          if (approved) return deny("APPROVAL_NOT_REVOKE", "setApprovalForAll must revoke", i);
          ops.push({ kind: "OPERATOR_REVOKE", token: c.to, owner: sender, spender: operator });
          break;
        }
        default:
          return deny("UNSUPPORTED_CALL", `selector ${selector} is not an allowed cleanup call`, i);
      }
    } catch (e) {
      return deny("UNSUPPORTED_CALL", `malformed arguments: ${e instanceof Error ? e.message : String(e)}`, i);
    }
  }
  return { ok: true, operations: ops };
}

function deny(code: PolicyCode, reason: string, index: number): PolicyDenial {
  return { ok: false, code, reason, index };
}

export function selectorOf(data: Hex): string {
  return size(data) >= 4 ? slice(data, 0, 4).toLowerCase() : "0x";
}
