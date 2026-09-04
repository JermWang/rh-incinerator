import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  numberToHex,
  pad,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from "viem";
import type { UserOperationV07 } from "./userop";

/**
 * Off-chain half of the VerifyingPaymaster (eth-infinitism v0.7).
 *
 * The hot signing key can only authorise the paymaster to pay for a specific,
 * already-validated UserOperation. Its blast radius is the paymaster's
 * EntryPoint deposit, which the SponsorReserve keeps bounded.
 */

export interface PaymasterGas {
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
}

/** VerifyingPaymaster has no postOp; verification is a single ecrecover. */
export const DEFAULT_PAYMASTER_GAS: PaymasterGas = {
  paymasterVerificationGasLimit: 60_000n,
  paymasterPostOpGasLimit: 0n,
};

export function packAccountGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): Hex {
  return concatHex([pad(numberToHex(verificationGasLimit), { size: 16 }), pad(numberToHex(callGasLimit), { size: 16 })]);
}

export function packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): Hex {
  return concatHex([pad(numberToHex(maxPriorityFeePerGas), { size: 16 }), pad(numberToHex(maxFeePerGas), { size: 16 })]);
}

export function packPaymasterGasLimits(gas: PaymasterGas): Hex {
  return concatHex([
    pad(numberToHex(gas.paymasterVerificationGasLimit), { size: 16 }),
    pad(numberToHex(gas.paymasterPostOpGasLimit), { size: 16 }),
  ]);
}

export function initCodeOf(op: Pick<UserOperationV07, "factory" | "factoryData" | "initCode">): Hex {
  if (op.factory) return concatHex([op.factory, op.factoryData ?? "0x"]);
  return op.initCode ?? "0x";
}

/** Mirrors VerifyingPaymaster.getHash(). */
export function paymasterHash(params: {
  userOp: UserOperationV07;
  paymaster: Address;
  chainId: number;
  gas: PaymasterGas;
  validUntil: number;
  validAfter: number;
}): Hex {
  const { userOp, gas } = params;
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint48" },
        { type: "uint48" },
      ],
      [
        userOp.sender,
        userOp.nonce,
        keccak256(initCodeOf(userOp)),
        keccak256(userOp.callData),
        packAccountGasLimits(userOp.verificationGasLimit, userOp.callGasLimit),
        BigInt(packPaymasterGasLimits(gas)),
        userOp.preVerificationGas,
        packGasFees(userOp.maxPriorityFeePerGas, userOp.maxFeePerGas),
        BigInt(params.chainId),
        params.paymaster,
        params.validUntil,
        params.validAfter,
      ],
    ),
  );
}

/** paymasterData = abi.encode(validUntil, validAfter) ++ signature */
export function encodePaymasterData(validUntil: number, validAfter: number, signature: Hex): Hex {
  return concatHex([encodeAbiParameters([{ type: "uint48" }, { type: "uint48" }], [validUntil, validAfter]), signature]);
}

const DUMMY_SIGNATURE: Hex = `0x${"ff".repeat(64)}1c`;

export function stubPaymasterData(validUntil: number, validAfter: number): Hex {
  return encodePaymasterData(validUntil, validAfter, DUMMY_SIGNATURE);
}

export async function signPaymasterData(params: {
  account: PrivateKeyAccount;
  userOp: UserOperationV07;
  paymaster: Address;
  chainId: number;
  gas: PaymasterGas;
  validUntil: number;
  validAfter: number;
}): Promise<Hex> {
  const hash = paymasterHash(params);
  // VerifyingPaymaster verifies against toEthSignedMessageHash(hash) => personal_sign over raw bytes.
  const signature = await params.account.signMessage({ message: { raw: hash } });
  return encodePaymasterData(params.validUntil, params.validAfter, signature);
}
