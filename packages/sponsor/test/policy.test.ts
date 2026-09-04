import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { DEAD_ADDRESS, MAX_UINT256, ZERO_ADDRESS } from "@incinerator/chain";
import { callsToOperations } from "../src/policy";
import { NFT, OTHER_WALLET, PAYMASTER, SPENDER, TOKEN_A, WALLET, erc20, erc721 } from "./helpers";

const erc1155 = parseAbi([
  "function burn(address account, uint256 id, uint256 value)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
]);

describe("callsToOperations (allowlist)", () => {
  it("accepts every allowed cleanup shape", () => {
    const r = callsToOperations(
      [
        { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [DEAD_ADDRESS, 5n] }) },
        { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "burn", args: [5n] }) },
        { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc721, functionName: "transferFrom", args: [WALLET, DEAD_ADDRESS, 9n] }) },
        { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc1155, functionName: "burn", args: [WALLET, 1n, 2n] }) },
        { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc1155, functionName: "safeTransferFrom", args: [WALLET, DEAD_ADDRESS, 1n, 2n, "0x"] }) },
        { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [SPENDER, 0n] }) },
        { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc721, functionName: "approve", args: [ZERO_ADDRESS, 9n] }) },
        { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc721, functionName: "setApprovalForAll", args: [SPENDER, false] }) },
      ],
      WALLET,
      [PAYMASTER],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.operations.map((o) => o.kind)).toEqual([
        "ERC20_DEAD",
        "ERC20_BURN",
        "ERC721_DEAD",
        "ERC1155_BURN",
        "ERC1155_DEAD",
        "ERC20_REVOKE",
        "ERC721_REVOKE",
        "OPERATOR_REVOKE",
      ]);
    }
  });

  const cases: [string, { to: `0x${string}`; value: bigint; data: `0x${string}` }, string][] = [
    ["native value", { to: TOKEN_A, value: 1n, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [DEAD_ADDRESS, 5n] }) }, "VALUE_NOT_ALLOWED"],
    ["arbitrary transfer recipient", { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [OTHER_WALLET, 5n] }) }, "ARBITRARY_RECIPIENT"],
    ["transferFrom someone else", { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc721, functionName: "transferFrom", args: [OTHER_WALLET, DEAD_ADDRESS, 9n] }) }, "NOT_OWNER"],
    ["transferFrom to arbitrary", { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc721, functionName: "transferFrom", args: [WALLET, OTHER_WALLET, 9n] }) }, "ARBITRARY_RECIPIENT"],
    ["approve non-zero", { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [SPENDER, 1n] }) }, "APPROVAL_NOT_REVOKE"],
    ["approve max", { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [SPENDER, MAX_UINT256] }) }, "APPROVAL_NOT_REVOKE"],
    ["setApprovalForAll true", { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc721, functionName: "setApprovalForAll", args: [SPENDER, true] }) }, "APPROVAL_NOT_REVOKE"],
    ["1155 burn other account", { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc1155, functionName: "burn", args: [OTHER_WALLET, 1n, 2n] }) }, "NOT_OWNER"],
    ["1155 with data payload", { to: NFT, value: 0n, data: encodeFunctionData({ abi: erc1155, functionName: "safeTransferFrom", args: [WALLET, DEAD_ADDRESS, 1n, 2n, "0x01"] }) }, "UNSUPPORTED_CALL"],
    ["unknown selector", { to: TOKEN_A, value: 0n, data: "0xdeadbeef0000" }, "UNSUPPORTED_CALL"],
    ["empty calldata", { to: TOKEN_A, value: 0n, data: "0x" }, "UNSUPPORTED_CALL"],
    ["zero-amount burn", { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "burn", args: [0n] }) }, "ZERO_AMOUNT"],
    ["targets paymaster", { to: PAYMASTER, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [DEAD_ADDRESS, 5n] }) }, "SELF_TARGET"],
    ["targets sender", { to: WALLET, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [DEAD_ADDRESS, 5n] }) }, "SELF_TARGET"],
  ];

  for (const [name, call, code] of cases) {
    it(`denies ${name}`, () => {
      const r = callsToOperations([call], WALLET, [PAYMASTER]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe(code);
    });
  }

  it("reports the index of the offending call", () => {
    const good = { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [DEAD_ADDRESS, 5n] }) };
    const bad = { to: TOKEN_A, value: 0n, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [SPENDER, 1n] }) };
    const r = callsToOperations([good, good, bad], WALLET, []);
    expect(!r.ok && r.index === 2).toBe(true);
  });
});
