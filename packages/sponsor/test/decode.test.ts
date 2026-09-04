import { concatHex, encodeAbiParameters, encodeFunctionData, pad, parseAbi, toFunctionSelector, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { decodeAccountCallData } from "../src/decode";
import { SELECTORS } from "../src/policy";
import { TOKEN_A, TOKEN_B, WALLET, batchCallData, deadTransfer } from "./helpers";

describe("selector constants", () => {
  it("match their signatures", () => {
    expect(toFunctionSelector("burn(uint256)")).toBe(SELECTORS.BURN_UINT);
    expect(toFunctionSelector("transfer(address,uint256)")).toBe(SELECTORS.TRANSFER);
    expect(toFunctionSelector("transferFrom(address,address,uint256)")).toBe(SELECTORS.TRANSFER_FROM);
    expect(toFunctionSelector("burn(address,uint256,uint256)")).toBe(SELECTORS.BURN_1155);
    expect(toFunctionSelector("safeTransferFrom(address,address,uint256,uint256,bytes)")).toBe(SELECTORS.SAFE_TRANSFER_FROM_1155);
    expect(toFunctionSelector("approve(address,uint256)")).toBe(SELECTORS.APPROVE);
    expect(toFunctionSelector("setApprovalForAll(address,bool)")).toBe(SELECTORS.SET_APPROVAL_FOR_ALL);
  });
});

describe("decodeAccountCallData", () => {
  it("decodes executeBatch(Call[])", () => {
    const cd = batchCallData([
      { to: TOKEN_A, data: deadTransfer(1n) },
      { to: TOKEN_B, data: deadTransfer(2n) },
    ]);
    expect(cd.slice(0, 10)).toBe(toFunctionSelector("executeBatch((address,uint256,bytes)[])"));
    const r = decodeAccountCallData(cd);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.calls).toHaveLength(2);
      expect(r.calls[0]!.to).toBe(TOKEN_A);
      expect(r.calls[1]!.value).toBe(0n);
    }
  });

  it("decodes execute(address,uint256,bytes)", () => {
    const abi = parseAbi(["function execute(address dest, uint256 value, bytes func)"]);
    const cd = encodeFunctionData({ abi, functionName: "execute", args: [TOKEN_A, 5n, deadTransfer(1n)] });
    const r = decodeAccountCallData(cd);
    expect(r.ok && r.calls[0]!.value === 5n).toBe(true);
  });

  it("decodes executeBatch(address[],bytes[]) and executeBatch(address[],uint256[],bytes[])", () => {
    const abi2 = parseAbi(["function executeBatch(address[] dest, bytes[] func)"]);
    const abi3 = parseAbi(["function executeBatch(address[] dest, uint256[] value, bytes[] func)"]);
    const a = decodeAccountCallData(encodeFunctionData({ abi: abi2, functionName: "executeBatch", args: [[TOKEN_A], [deadTransfer(1n)]] }));
    const b = decodeAccountCallData(encodeFunctionData({ abi: abi3, functionName: "executeBatch", args: [[TOKEN_A], [7n], [deadTransfer(1n)]] }));
    expect(a.ok && a.calls.length === 1).toBe(true);
    expect(b.ok && b.calls[0]!.value === 7n).toBe(true);
  });

  it("decodes ERC-7579 single and batch modes, rejects delegatecall and try modes", () => {
    const abi = parseAbi(["function execute(bytes32 mode, bytes executionCalldata)"]);
    const single = concatHex([TOKEN_A, pad("0x0", { size: 32 }), deadTransfer(1n)]);
    const modeSingle = pad("0x00", { size: 32, dir: "right" });
    const r1 = decodeAccountCallData(encodeFunctionData({ abi, functionName: "execute", args: [modeSingle, single] }));
    expect(r1.ok && r1.calls[0]!.to === TOKEN_A && r1.calls[0]!.data === deadTransfer(1n)).toBe(true);

    const batch = encodeAbiParameters(
      [{ type: "tuple[]", components: [{ type: "address" }, { type: "uint256" }, { type: "bytes" }] }],
      [[[TOKEN_A, 0n, deadTransfer(1n)], [TOKEN_B, 0n, deadTransfer(2n)]]],
    );
    const modeBatch = pad("0x01", { size: 32, dir: "right" });
    const r2 = decodeAccountCallData(encodeFunctionData({ abi, functionName: "execute", args: [modeBatch, batch] }));
    expect(r2.ok && r2.calls.length === 2).toBe(true);

    const batchWithOpData = encodeAbiParameters(
      [{ type: "tuple[]", components: [{ type: "address" }, { type: "uint256" }, { type: "bytes" }] }, { type: "bytes" }],
      [[[TOKEN_A, 0n, deadTransfer(1n)]], "0x1234"],
    );
    const r2b = decodeAccountCallData(encodeFunctionData({ abi, functionName: "execute", args: [modeBatch, batchWithOpData] }));
    expect(r2b.ok && r2b.calls.length === 1).toBe(true);

    const modeDelegate = pad("0xff", { size: 32, dir: "right" });
    const r3 = decodeAccountCallData(encodeFunctionData({ abi, functionName: "execute", args: [modeDelegate, single] }));
    expect(r3.ok).toBe(false);
    const modeTry = concatHex(["0x0001", pad("0x0", { size: 30 })]) as Hex;
    const r4 = decodeAccountCallData(encodeFunctionData({ abi, functionName: "execute", args: [modeTry, single] }));
    expect(r4.ok).toBe(false);
  });

  it("decodes Safe executeUserOp and rejects delegatecall operation", () => {
    const abi = parseAbi(["function executeUserOp(address to, uint256 value, bytes data, uint8 operation)"]);
    const ok = decodeAccountCallData(encodeFunctionData({ abi, functionName: "executeUserOp", args: [TOKEN_A, 0n, deadTransfer(1n), 0] }));
    expect(ok.ok).toBe(true);
    const bad = decodeAccountCallData(encodeFunctionData({ abi, functionName: "executeUserOp", args: [TOKEN_A, 0n, deadTransfer(1n), 1] }));
    expect(bad.ok).toBe(false);
  });

  it("rejects unknown wrappers and short data", () => {
    expect(decodeAccountCallData("0x12345678deadbeef").ok).toBe(false);
    expect(decodeAccountCallData("0x12").ok).toBe(false);
    // A raw token call at the account level is not an account execution wrapper.
    expect(decodeAccountCallData(deadTransfer(1n)).ok).toBe(false);
    void WALLET;
  });
});
