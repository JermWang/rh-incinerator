import { decodeAbiParameters, getAddress, size, slice, type Address, type Hex } from "viem";

/**
 * Decode a smart-account `callData` into the inner calls it would execute.
 *
 * Only well-known execution entrypoints are understood. Anything else is
 * rejected: an unknown wrapper could hide arbitrary execution, and the policy
 * engine must see every call it sponsors.
 */

export interface InnerCall {
  to: Address;
  value: bigint;
  data: Hex;
}

export type DecodeResult = { ok: true; calls: InnerCall[]; accountKind: string } | { ok: false; reason: string };

// Selectors
const SEL_EXECUTE = "0xb61d27f6"; // execute(address,uint256,bytes)                         SimpleAccount, ModularAccount, Kernel v2
const SEL_EXECUTE_BATCH_2 = "0x18dfb3c7"; // executeBatch(address[],bytes[])                SimpleAccount v0.6
const SEL_EXECUTE_BATCH_3 = "0x47e1da2a"; // executeBatch(address[],uint256[],bytes[])      SimpleAccount v0.6 variant
const SEL_EXECUTE_BATCH_STRUCT = "0x34fcd5be"; // executeBatch((address,uint256,bytes)[])   SimpleAccount v0.7, ModularAccount
const SEL_EXECUTE_MODE = "0xe9ae5c53"; // execute(bytes32,bytes)                            ERC-7579 / ERC-7821 (Kernel v3, MetaMask 7702, Ithaca)
const SEL_SAFE_EXECUTE_USEROP = "0x7bb37428"; // executeUserOp(address,uint256,bytes,uint8) Safe4337Module
const SEL_SAFE_EXECUTE_USEROP_ERR = "0x541d63c8"; // executeUserOpWithErrorString(...)      Safe4337Module

const CALL_TUPLE = [
  {
    type: "tuple[]",
    components: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
  },
] as const;

export function decodeAccountCallData(callData: Hex): DecodeResult {
  if (size(callData) < 4) return { ok: false, reason: "callData too short" };
  const selector = slice(callData, 0, 4).toLowerCase();
  const args: Hex = size(callData) > 4 ? slice(callData, 4) : "0x";
  try {
    switch (selector) {
      case SEL_EXECUTE: {
        const [to, value, data] = decodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
          args,
        );
        return { ok: true, accountKind: "execute", calls: [{ to: getAddress(to), value, data }] };
      }
      case SEL_EXECUTE_BATCH_2: {
        const [targets, datas] = decodeAbiParameters([{ type: "address[]" }, { type: "bytes[]" }], args);
        if (targets.length !== datas.length) return { ok: false, reason: "batch length mismatch" };
        return {
          ok: true,
          accountKind: "executeBatch(address[],bytes[])",
          calls: targets.map((t, i) => ({ to: getAddress(t), value: 0n, data: datas[i]! })),
        };
      }
      case SEL_EXECUTE_BATCH_3: {
        const [targets, values, datas] = decodeAbiParameters(
          [{ type: "address[]" }, { type: "uint256[]" }, { type: "bytes[]" }],
          args,
        );
        if (targets.length !== datas.length || (values.length !== 0 && values.length !== targets.length)) {
          return { ok: false, reason: "batch length mismatch" };
        }
        return {
          ok: true,
          accountKind: "executeBatch(address[],uint256[],bytes[])",
          calls: targets.map((t, i) => ({ to: getAddress(t), value: values[i] ?? 0n, data: datas[i]! })),
        };
      }
      case SEL_EXECUTE_BATCH_STRUCT: {
        const [calls] = decodeAbiParameters(CALL_TUPLE, args);
        return {
          ok: true,
          accountKind: "executeBatch(Call[])",
          calls: calls.map((c) => ({ to: getAddress(c.target), value: c.value, data: c.data })),
        };
      }
      case SEL_EXECUTE_MODE: {
        const [mode, executionData] = decodeAbiParameters([{ type: "bytes32" }, { type: "bytes" }], args);
        return decodeErc7579(mode, executionData);
      }
      case SEL_SAFE_EXECUTE_USEROP:
      case SEL_SAFE_EXECUTE_USEROP_ERR: {
        const [to, value, data, operation] = decodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }, { type: "bytes" }, { type: "uint8" }],
          args,
        );
        if (operation !== 0) return { ok: false, reason: "Safe delegatecall operation is not sponsorable" };
        return { ok: true, accountKind: "safe.executeUserOp", calls: [{ to: getAddress(to), value, data }] };
      }
      default:
        return { ok: false, reason: `unsupported account execution selector ${selector}` };
    }
  } catch (e) {
    return { ok: false, reason: `callData decode failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * ERC-7579 / ERC-7821 execution modes. Byte 0 is the call type:
 *   0x00 single (packed target|value|data), 0x01 batch (abi Call[]), 0xFE static, 0xFF delegatecall.
 * Byte 1 is exec type: 0x00 revert-on-failure, 0x01 try. Only 0x00 is accepted.
 */
function decodeErc7579(mode: Hex, executionData: Hex): DecodeResult {
  const callType = slice(mode, 0, 1).toLowerCase();
  const execType = slice(mode, 1, 2).toLowerCase();
  if (execType !== "0x00") return { ok: false, reason: "try-execution mode is not sponsorable" };
  if (callType === "0x00") {
    if (size(executionData) < 52) return { ok: false, reason: "single-call executionData too short" };
    const to = getAddress(slice(executionData, 0, 20));
    const value = BigInt(slice(executionData, 20, 52));
    const data = size(executionData) > 52 ? slice(executionData, 52) : ("0x" as Hex);
    return { ok: true, accountKind: "erc7579.single", calls: [{ to, value, data }] };
  }
  if (callType === "0x01") {
    // Batch: abi.encode(Call[]) optionally followed by opData: abi.encode(Call[], bytes)
    let calls: readonly { target: Address; value: bigint; data: Hex }[];
    try {
      [calls] = decodeAbiParameters(CALL_TUPLE, executionData);
    } catch {
      [calls] = decodeAbiParameters([...CALL_TUPLE, { type: "bytes" }], executionData);
    }
    return {
      ok: true,
      accountKind: "erc7579.batch",
      calls: calls.map((c) => ({ to: getAddress(c.target), value: c.value, data: c.data })),
    };
  }
  if (callType === "0xff") return { ok: false, reason: "delegatecall mode is not sponsorable" };
  return { ok: false, reason: `unsupported ERC-7579 call type ${callType}` };
}
