// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {VerifyingPaymaster} from "@account-abstraction/contracts/samples/VerifyingPaymaster.sol";

/// @title IncineratorPaymaster
/// @notice The audited eth-infinitism VerifyingPaymaster (EntryPoint v0.7),
///         unchanged. The off-chain policy engine signs each validated
///         UserOperation; the contract only checks that signature.
/// @dev Ownership (deposit withdrawal, stake management) must be transferred to
///      the operations multisig after deployment. The verifying signer is the
///      hot key with bounded blast radius: the EntryPoint deposit.
contract IncineratorPaymaster is VerifyingPaymaster {
    constructor(IEntryPoint entryPoint_, address verifyingSigner_) VerifyingPaymaster(entryPoint_, verifyingSigner_) {}
}
