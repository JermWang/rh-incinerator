import { decodeFunctionData, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { erc1155Abi, erc20Abi, erc721Abi } from "../src/abis";
import { DEAD_ADDRESS, ZERO_ADDRESS } from "../src/constants";
import { cleanupOperationSchema, encodeOperation, isDestructive } from "../src/operations";

const owner = getAddress("0x000000000000000000000000000000000000aaaa");
const token = getAddress("0x000000000000000000000000000000000000bbbb");
const spender = getAddress("0x000000000000000000000000000000000000cccc");

describe("encodeOperation", () => {
  it("ERC20_DEAD always targets the dead address", () => {
    const c = encodeOperation({ kind: "ERC20_DEAD", token, owner, amount: "123" });
    const d = decodeFunctionData({ abi: erc20Abi, data: c.data });
    expect(d.functionName).toBe("transfer");
    expect(d.args).toEqual([DEAD_ADDRESS, 123n]);
    expect(c.value).toBe(0n);
    expect(c.to).toBe(token);
  });

  it("ERC721_DEAD transfers from owner to dead", () => {
    const c = encodeOperation({ kind: "ERC721_DEAD", token, owner, tokenId: "7" });
    const d = decodeFunctionData({ abi: erc721Abi, data: c.data });
    expect(d.functionName).toBe("transferFrom");
    expect(d.args).toEqual([owner, DEAD_ADDRESS, 7n]);
  });

  it("ERC1155_DEAD uses empty data payload", () => {
    const c = encodeOperation({ kind: "ERC1155_DEAD", token, owner, tokenId: "7", amount: "2" });
    const d = decodeFunctionData({ abi: erc1155Abi, data: c.data });
    expect(d.functionName).toBe("safeTransferFrom");
    expect(d.args).toEqual([owner, DEAD_ADDRESS, 7n, 2n, "0x"]);
  });

  it("revocations only reduce authority", () => {
    const a = decodeFunctionData({ abi: erc20Abi, data: encodeOperation({ kind: "ERC20_REVOKE", token, owner, spender }).data });
    expect(a.args).toEqual([spender, 0n]);
    const b = decodeFunctionData({ abi: erc721Abi, data: encodeOperation({ kind: "ERC721_REVOKE", token, owner, tokenId: "9" }).data });
    expect(b.args).toEqual([ZERO_ADDRESS, 9n]);
    const c = decodeFunctionData({ abi: erc721Abi, data: encodeOperation({ kind: "OPERATOR_REVOKE", token, owner, spender }).data });
    expect(c.args).toEqual([spender, false]);
  });

  it("throws when a required field is missing", () => {
    expect(() => encodeOperation({ kind: "ERC20_DEAD", token, owner })).toThrow(/amount/);
    expect(() => encodeOperation({ kind: "OPERATOR_REVOKE", token, owner })).toThrow(/spender/);
  });

  it("classifies destructive vs revoke", () => {
    expect(isDestructive("ERC20_DEAD")).toBe(true);
    expect(isDestructive("ERC20_REVOKE")).toBe(false);
  });
});

describe("cleanupOperationSchema", () => {
  it("rejects unknown kinds and bad addresses", () => {
    expect(cleanupOperationSchema.safeParse({ kind: "CALL", token, owner }).success).toBe(false);
    expect(cleanupOperationSchema.safeParse({ kind: "ERC20_DEAD", token: "0x12", owner, amount: "1" }).success).toBe(false);
  });
  it("rejects non-integer amounts and overflow", () => {
    expect(cleanupOperationSchema.safeParse({ kind: "ERC20_DEAD", token, owner, amount: "1.5" }).success).toBe(false);
    expect(cleanupOperationSchema.safeParse({ kind: "ERC20_DEAD", token, owner, amount: "1" + "0".repeat(80) }).success).toBe(false);
  });
  it("checksums addresses", () => {
    const r = cleanupOperationSchema.parse({ kind: "ERC20_DEAD", token: token.toLowerCase(), owner: owner.toLowerCase(), amount: "1" });
    expect(r.token).toBe(token);
  });
});
