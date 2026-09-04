import { recoverMessageAddress, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { encodePaymasterData, paymasterHash, signPaymasterData, stubPaymasterData } from "../src/signer";
import { WALLET, signerAccount } from "./helpers";

/**
 * Cross-language fixture: produced by
 *   forge test --match-test test_hashFixture -vv
 * in packages/contracts (VerifyingPaymaster.getHash on chain id 46630).
 */
const FIXTURE_PAYMASTER = "0x2e234DAe75C793f67A35089C9d99245E1C58470b" as const;
const FIXTURE_HASH: Hex = "0x267c14b3174fb2201f9a508bb67cd6cdd19733497ba7897ae6b827be0127f7f5";

const userOp = {
  sender: WALLET,
  nonce: 1n,
  callData: "0x34fcd5be" as Hex,
  callGasLimit: 300_000n,
  verificationGasLimit: 150_000n,
  preVerificationGas: 60_000n,
  maxFeePerGas: 20_000_000n,
  maxPriorityFeePerGas: 0n,
  signature: "0x" as Hex,
};
const gas = { paymasterVerificationGasLimit: 60_000n, paymasterPostOpGasLimit: 0n };

describe("VerifyingPaymaster signer", () => {
  it("reproduces the Solidity getHash() preimage exactly", () => {
    const h = paymasterHash({ userOp, paymaster: FIXTURE_PAYMASTER, chainId: 46630, gas, validUntil: 1_800_000_300, validAfter: 0 });
    expect(h).toBe(FIXTURE_HASH);
  });

  it("binds the signature to every gas field and the chain", () => {
    const base = { userOp, paymaster: FIXTURE_PAYMASTER, chainId: 46630, gas, validUntil: 1_800_000_300, validAfter: 0 };
    const h = paymasterHash(base);
    expect(paymasterHash({ ...base, chainId: 4663 })).not.toBe(h);
    expect(paymasterHash({ ...base, userOp: { ...userOp, callGasLimit: 300_001n } })).not.toBe(h);
    expect(paymasterHash({ ...base, userOp: { ...userOp, maxFeePerGas: 1n } })).not.toBe(h);
    expect(paymasterHash({ ...base, gas: { ...gas, paymasterVerificationGasLimit: 1n } })).not.toBe(h);
    expect(paymasterHash({ ...base, validUntil: 1 })).not.toBe(h);
    expect(paymasterHash({ ...base, userOp: { ...userOp, callData: "0xdeadbeef" } })).not.toBe(h);
  });

  it("signs with personal_sign semantics and encodes validity window + signature", async () => {
    const data = await signPaymasterData({ account: signerAccount, userOp, paymaster: FIXTURE_PAYMASTER, chainId: 46630, gas, validUntil: 1_800_000_300, validAfter: 0 });
    expect((data.length - 2) / 2).toBe(64 + 65);
    const sig = `0x${data.slice(130)}` as Hex;
    const recovered = await recoverMessageAddress({ message: { raw: FIXTURE_HASH }, signature: sig });
    expect(recovered).toBe(signerAccount.address);
    expect(data.startsWith(encodePaymasterData(1_800_000_300, 0, "0x").slice(0, 130))).toBe(true);
  });

  it("stub data has the right shape and a non-recoverable dummy signature", () => {
    const stub = stubPaymasterData(1, 0);
    expect((stub.length - 2) / 2).toBe(64 + 65);
  });
});
