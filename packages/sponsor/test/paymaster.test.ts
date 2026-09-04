import { encodeFunctionData, numberToHex, parseEther, parseGwei, recoverMessageAddress, type Hex } from "viem";
import { beforeEach, describe, expect, it } from "vitest";
import { DEAD_ADDRESS, ENTRYPOINT_V06, ENTRYPOINT_V07, ROBINHOOD_CHAIN_MAINNET_ID, ROBINHOOD_CHAIN_TESTNET_ID } from "@incinerator/chain";
import { clearCodeCache } from "../src/evaluate";
import { handlePaymasterRpc, sponsorUserOperation } from "../src/paymaster";
import { DEFAULT_PAYMASTER_GAS, paymasterHash } from "../src/signer";
import { invalidateStatusCache } from "../src/status";
import { SETTING_PAUSED } from "../src/store";
import {
  FakeChain,
  NFT,
  OTHER_WALLET,
  PAYMASTER,
  SPENDER,
  TOKEN_A,
  TOKEN_B,
  WALLET,
  batchCallData,
  deadTransfer,
  erc20,
  erc721,
  makeDeps,
  makeUserOp,
  signerAccount,
} from "./helpers";

function baseInput(callData: Hex, overrides: Parameters<typeof makeUserOp>[1] = {}) {
  return { userOp: makeUserOp(callData, overrides), entryPoint: ENTRYPOINT_V07, chainId: ROBINHOOD_CHAIN_TESTNET_ID as number, isFinal: true };
}

describe("sponsorUserOperation", () => {
  let chain: FakeChain;
  beforeEach(() => {
    chain = new FakeChain();
    chain.setErc20(TOKEN_A, WALLET, 1_000n);
    chain.setErc20(TOKEN_B, WALLET, 50n);
    chain.setErc721(NFT, 7n, WALLET);
    chain.setAllowance(TOKEN_A, WALLET, SPENDER, 10n ** 30n);
    chain.setOperator(NFT, WALLET, SPENDER, true);
    clearCodeCache();
    invalidateStatusCache();
  });

  it("sponsors a valid cleanup batch and signs for the paymaster", async () => {
    const deps = makeDeps(chain);
    const callData = batchCallData([
      { to: TOKEN_A, data: deadTransfer(1_000n) },
      { to: NFT, data: encodeFunctionData({ abi: erc721, functionName: "transferFrom", args: [WALLET, DEAD_ADDRESS, 7n] }) },
      { to: TOKEN_A, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [SPENDER, 0n] }) },
      { to: NFT, data: encodeFunctionData({ abi: erc721, functionName: "setApprovalForAll", args: [SPENDER, false] }) },
    ]);
    const input = baseInput(callData);
    const v = await sponsorUserOperation(deps, input);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.result.paymaster).toBe(PAYMASTER);
    expect(v.result.isFinal).toBe(true);
    const pmData = v.result.paymasterData as Hex;
    // abi.encode(validUntil, validAfter) is 64 bytes, signature 65 bytes
    expect((pmData.length - 2) / 2).toBe(64 + 65);
    const validUntil = Number(BigInt(`0x${pmData.slice(2, 66)}`));
    const validAfter = Number(BigInt(`0x${pmData.slice(66, 130)}`));
    const signature = `0x${pmData.slice(130)}` as Hex;
    const hash = paymasterHash({
      userOp: input.userOp,
      paymaster: PAYMASTER,
      chainId: ROBINHOOD_CHAIN_TESTNET_ID,
      gas: DEFAULT_PAYMASTER_GAS,
      validUntil,
      validAfter,
    });
    const recovered = await recoverMessageAddress({ message: { raw: hash }, signature });
    expect(recovered).toBe(signerAccount.address);

    // Budget reservation was recorded
    const ops = await deps.store.listSponsoredOperations(10);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.kinds).toEqual(["ERC20_DEAD", "ERC721_DEAD", "ERC20_REVOKE", "OPERATOR_REVOKE"]);
    expect(ops[0]!.status).toBe("RESERVED");
  });

  it("returns a stub without signing or reserving budget", async () => {
    const deps = makeDeps(chain);
    const v = await sponsorUserOperation(deps, { ...baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(10n) }])), isFinal: false });
    expect(v.ok && v.result.isFinal === false).toBe(true);
    expect(await deps.store.listSponsoredOperations(10)).toHaveLength(0);
  });

  it("resolves burn(uint256) to ERC-721 when the wallet owns that token id", async () => {
    const deps = makeDeps(chain);
    const v = await sponsorUserOperation(deps, baseInput(batchCallData([{ to: NFT, data: encodeFunctionData({ abi: erc20, functionName: "burn", args: [7n] }) }])));
    expect(v.ok).toBe(true);
    const ops = await deps.store.listSponsoredOperations(1);
    expect(ops[0]!.kinds).toEqual(["ERC721_BURN"]);
  });

  const denial = async (deps: ReturnType<typeof makeDeps>, input: ReturnType<typeof baseInput>, code: string) => {
    const v = await sponsorUserOperation(deps, input);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe(code);
  };

  it("rejects the wrong chain", async () => {
    await denial(makeDeps(chain), { ...baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }])), chainId: ROBINHOOD_CHAIN_MAINNET_ID }, "WRONG_CHAIN");
  });

  it("rejects EntryPoint v0.6", async () => {
    await denial(makeDeps(chain), { ...baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }])), entryPoint: ENTRYPOINT_V06 }, "UNSUPPORTED_ENTRYPOINT");
  });

  it("rejects a forged wallet (session mismatch) and missing session", async () => {
    const cd = batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }]);
    await denial(makeDeps(chain, { session: { address: OTHER_WALLET, chainId: ROBINHOOD_CHAIN_TESTNET_ID, iat: 0, exp: 9e15 } }), baseInput(cd), "UNAUTHENTICATED");
    await denial(makeDeps(chain, { session: null }), baseInput(cd), "UNAUTHENTICATED");
  });

  it("rejects when sponsorship is paused, unconfigured, or the hot balance is low", async () => {
    const cd = batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }]);
    const paused = makeDeps(chain);
    await paused.store.setSetting(SETTING_PAUSED, true);
    invalidateStatusCache();
    await denial(paused, baseInput(cd), "SPONSOR_PAUSED");

    invalidateStatusCache();
    await denial(makeDeps(chain, { env: { backend: "none" } }), baseInput(cd), "SPONSOR_UNAVAILABLE");

    invalidateStatusCache();
    chain.paymasterDeposit = 1n;
    await denial(makeDeps(chain), baseInput(cd), "SPONSOR_UNAVAILABLE");
  });

  it("rejects arbitrary calldata and unsupported account wrappers", async () => {
    await denial(makeDeps(chain), baseInput("0xdeadbeef00000000"), "UNSUPPORTED_ACCOUNT");
    await denial(makeDeps(chain), baseInput(batchCallData([{ to: TOKEN_A, data: "0x12345678" }])), "UNSUPPORTED_CALL");
  });

  it("rejects ETH value, arbitrary recipients and non-revoking approvals", async () => {
    await denial(makeDeps(chain), baseInput(batchCallData([{ to: TOKEN_A, value: 1n, data: deadTransfer(1n) }])), "VALUE_NOT_ALLOWED");
    await denial(
      makeDeps(chain),
      baseInput(batchCallData([{ to: TOKEN_A, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [OTHER_WALLET, 1n] }) }])),
      "ARBITRARY_RECIPIENT",
    );
    await denial(
      makeDeps(chain),
      baseInput(batchCallData([{ to: TOKEN_A, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [SPENDER, 5n] }) }])),
      "APPROVAL_NOT_REVOKE",
    );
  });

  it("rejects assets the wallet does not hold", async () => {
    await denial(makeDeps(chain), baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1_001n) }])), "INSUFFICIENT_BALANCE");
    await denial(
      makeDeps(chain),
      baseInput(batchCallData([{ to: NFT, data: encodeFunctionData({ abi: erc721, functionName: "transferFrom", args: [WALLET, DEAD_ADDRESS, 8n] }) }])),
      "NOT_OWNER",
    );
    await denial(
      makeDeps(chain),
      baseInput(batchCallData([{ to: TOKEN_B, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [SPENDER, 0n] }) }])),
      "NOTHING_TO_REVOKE",
    );
  });

  it("rejects targets without code", async () => {
    chain.setErc20(SPENDER, WALLET, 5n);
    await denial(makeDeps(chain), baseInput(batchCallData([{ to: SPENDER, data: deadTransfer(1n) }])), "NO_CODE");
  });

  it("rejects reverting simulations and records the failure", async () => {
    chain.behave(TOKEN_A, { revert: "blacklisted" });
    const deps = makeDeps(chain);
    await denial(deps, baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }])), "SIMULATION_FAILED");
    const failed = await deps.store.listFailedSimulations(5);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toMatch(/blacklisted/);
  });

  it("rejects non-standard tokens: lying balances, external callbacks, ETH movement, false returns, missing events", async () => {
    const cd = batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }]);
    for (const b of [{ noBalanceChange: true }, { externalLog: true }, { ethTransfer: true }, { returnFalse: true }, { noTransferLog: true }]) {
      chain.behave(TOKEN_A, b);
      await denial(makeDeps(chain), baseInput(cd), "NON_STANDARD_TOKEN");
    }
  });

  it("rejects gas griefing tokens and oversized wallet gas fields", async () => {
    chain.behave(TOKEN_A, { gasUsed: 900_000n });
    const cd = batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }]);
    await denial(makeDeps(chain), baseInput(cd), "GAS_CEILING");
    chain.behave(TOKEN_A, {});
    await denial(makeDeps(chain), baseInput(cd, { callGasLimit: 9_000_000n }), "GAS_CEILING");
    await denial(makeDeps(chain), baseInput(cd, { verificationGasLimit: 9_000_000n }), "GAS_CEILING");
    await denial(makeDeps(chain), baseInput(cd, { maxFeePerGas: parseGwei("50") }), "FEE_TOO_HIGH");
    await denial(makeDeps(chain), baseInput(cd, { maxFeePerGas: parseGwei("0.5") }), "FEE_TOO_HIGH"); // >8x network price
  });

  it("rejects duplicate operations on the same asset", async () => {
    const cd = batchCallData([
      { to: TOKEN_A, data: deadTransfer(600n) },
      { to: TOKEN_A, data: deadTransfer(600n) },
    ]);
    await denial(makeDeps(chain), baseInput(cd), "DUPLICATE_OPERATION");
  });

  it("rejects batches above the call and calldata limits", async () => {
    const many = Array.from({ length: 30 }, () => ({ to: TOKEN_A, data: deadTransfer(1n) }));
    await denial(makeDeps(chain), baseInput(batchCallData(many)), "TOO_MANY_CALLS");
    await denial(makeDeps(chain, { policy: { MAX_CALLDATA_BYTES: 100 } }), baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }])), "CALLDATA_TOO_LARGE");
  });

  it("enforces per-wallet daily limits", async () => {
    const deps = makeDeps(chain, { policy: { MAX_SPONSORED_OPS_PER_WALLET_PER_DAY: 2, MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR: parseEther("1"), MAX_GLOBAL_SPONSOR_SPEND_PER_DAY: parseEther("1") } });
    const cd = batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }]);
    expect((await sponsorUserOperation(deps, baseInput(cd))).ok).toBe(true);
    expect((await sponsorUserOperation(deps, baseInput(cd))).ok).toBe(true);
    await denial(deps, baseInput(cd), "WALLET_RATE_LIMIT");
  });

  it("enforces the global budget", async () => {
    const deps = makeDeps(chain, { policy: { MAX_GLOBAL_SPONSOR_SPEND_PER_HOUR: 1n, MAX_GLOBAL_SPONSOR_SPEND_PER_DAY: 1n } });
    invalidateStatusCache();
    await denial(deps, baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }])), "BUDGET_EXHAUSTED");
  });

  it("caps the worst-case cost per operation", async () => {
    const deps = makeDeps(chain, { policy: { MAX_COST_PER_OPERATION: 1n } });
    await denial(deps, baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }])), "COST_CEILING");
  });

  it("cools a wallet down after repeated failed simulations", async () => {
    chain.behave(TOKEN_B, { revert: "nope" });
    const deps = makeDeps(chain, { policy: { WALLET_FAILED_SIM_THRESHOLD: 3 } });
    const bad = baseInput(batchCallData([{ to: TOKEN_B, data: deadTransfer(1n) }]));
    for (let i = 0; i < 3; i++) await sponsorUserOperation(deps, bad);
    await denial(deps, baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }])), "WALLET_COOLDOWN");
  });

  it("temporarily denylists a contract after repeated failures and honours manual denylists", async () => {
    chain.behave(TOKEN_B, { revert: "nope" });
    const deps = makeDeps(chain, { policy: { CONTRACT_FAILURE_THRESHOLD: 2, WALLET_FAILED_SIM_THRESHOLD: 100 } });
    const bad = baseInput(batchCallData([{ to: TOKEN_B, data: deadTransfer(1n) }]));
    await sponsorUserOperation(deps, bad);
    await sponsorUserOperation(deps, bad);
    chain.behave(TOKEN_B, {});
    await denial(deps, bad, "TOKEN_DENYLISTED");

    const deps2 = makeDeps(chain);
    await deps2.store.setContractDenylist(TOKEN_A, true, "manual", null);
    await denial(deps2, baseInput(batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }])), "TOKEN_DENYLISTED");
  });

  it("handles JSON-RPC framing", async () => {
    const deps = makeDeps(chain);
    const bad = await handlePaymasterRpc(deps, { id: 1, method: "eth_sendTransaction", params: [] });
    expect(bad.error?.code).toBe(-32601);
    const invalid = await handlePaymasterRpc(deps, { id: 2, method: "pm_getPaymasterData", params: [{}] });
    expect(invalid.error?.code).toBe(-32602);
    const ok = await handlePaymasterRpc(deps, {
      id: 3,
      method: "pm_getPaymasterStubData",
      params: [
        {
          sender: WALLET,
          nonce: "0x1",
          callData: batchCallData([{ to: TOKEN_A, data: deadTransfer(1n) }]),
          callGasLimit: numberToHex(200_000n),
          verificationGasLimit: numberToHex(100_000n),
          preVerificationGas: numberToHex(50_000n),
          maxFeePerGas: numberToHex(parseGwei("0.02")),
          maxPriorityFeePerGas: "0x0",
          signature: "0x",
        },
        ENTRYPOINT_V07,
        numberToHex(ROBINHOOD_CHAIN_TESTNET_ID),
        {},
      ],
    });
    expect(ok.error).toBeUndefined();
    expect((ok.result as { paymaster: string }).paymaster).toBe(PAYMASTER);
    const denied = await handlePaymasterRpc(deps, {
      id: 4,
      method: "pm_getPaymasterData",
      params: [
        { ...makeUserOp(batchCallData([{ to: TOKEN_A, value: 1n, data: deadTransfer(1n) }])), nonce: "0x1", callGasLimit: "0x1", verificationGasLimit: "0x1", preVerificationGas: "0x1", maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x0" },
        ENTRYPOINT_V07,
        numberToHex(ROBINHOOD_CHAIN_TESTNET_ID),
        null,
      ],
    });
    expect(denied.error?.code).toBe(-32002);
    expect((denied.error?.data as { code: string }).code).toBe("VALUE_NOT_ALLOWED");
  });
});
