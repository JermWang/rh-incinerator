// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IncineratorPaymaster} from "../src/IncineratorPaymaster.sol";
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Exercises the signature path of the (unchanged) VerifyingPaymaster and
///      pins the hash preimage that the TypeScript signer must reproduce.
contract IncineratorPaymasterTest is Test {
    EntryPoint ep;
    IncineratorPaymaster pm;
    uint256 signerKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    address signer;
    address sender = 0x1000000000000000000000000000000000000001;

    function setUp() public {
        ep = new EntryPoint();
        signer = vm.addr(signerKey);
        pm = new IncineratorPaymaster(IEntryPoint(address(ep)), signer);
        vm.chainId(46630);
    }

    function _userOp(bytes memory pmData) internal view returns (PackedUserOperation memory op) {
        op.sender = sender;
        op.nonce = 1;
        op.initCode = "";
        op.callData = hex"34fcd5be";
        op.accountGasLimits = bytes32((uint256(150_000) << 128) | uint256(300_000));
        op.preVerificationGas = 60_000;
        op.gasFees = bytes32((uint256(0) << 128) | uint256(20_000_000));
        op.paymasterAndData = abi.encodePacked(address(pm), uint128(60_000), uint128(0), pmData);
        op.signature = "";
    }

    function test_hashFixture() public view {
        // Fixture used by packages/sponsor/test/signer.test.ts
        PackedUserOperation memory op = _userOp(abi.encode(uint48(1_800_000_300), uint48(0)));
        bytes32 h = pm.getHash(op, 1_800_000_300, 0);
        console2.log("paymaster", address(pm));
        console2.logBytes32(h);
        assertTrue(h != bytes32(0));
    }

    function test_validSignatureAccepted() public {
        uint48 validUntil = 1_800_000_300;
        PackedUserOperation memory op = _userOp(abi.encode(validUntil, uint48(0)));
        bytes32 h = pm.getHash(op, validUntil, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h)));
        op.paymasterAndData = abi.encodePacked(address(pm), uint128(60_000), uint128(0), abi.encode(validUntil, uint48(0)), r, s, v);

        vm.prank(address(ep));
        (bytes memory ctx, uint256 validationData) = pm.validatePaymasterUserOp(op, bytes32(0), 0);
        assertEq(ctx.length, 0);
        // sigFailed bit is the lowest bit of validationData
        assertEq(validationData & 1, 0, "signature accepted");
        assertEq(uint48(validationData >> 160), validUntil);
    }

    function test_wrongSignerRejected() public {
        uint48 validUntil = 1_800_000_300;
        PackedUserOperation memory op = _userOp(abi.encode(validUntil, uint48(0)));
        bytes32 h = pm.getHash(op, validUntil, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h)));
        op.paymasterAndData = abi.encodePacked(address(pm), uint128(60_000), uint128(0), abi.encode(validUntil, uint48(0)), r, s, v);
        vm.prank(address(ep));
        (, uint256 validationData) = pm.validatePaymasterUserOp(op, bytes32(0), 0);
        assertEq(validationData & 1, 1, "signature rejected");
    }

    function test_tamperedCallDataRejected() public {
        uint48 validUntil = 1_800_000_300;
        PackedUserOperation memory op = _userOp(abi.encode(validUntil, uint48(0)));
        bytes32 h = pm.getHash(op, validUntil, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h)));
        op.paymasterAndData = abi.encodePacked(address(pm), uint128(60_000), uint128(0), abi.encode(validUntil, uint48(0)), r, s, v);
        op.callData = hex"deadbeef"; // attacker swaps the calls after sponsorship
        vm.prank(address(ep));
        (, uint256 validationData) = pm.validatePaymasterUserOp(op, bytes32(0), 0);
        assertEq(validationData & 1, 1);
    }

    function test_onlyEntryPointMayValidate() public {
        PackedUserOperation memory op = _userOp(abi.encode(uint48(0), uint48(0)));
        vm.expectRevert("Sender not EntryPoint");
        pm.validatePaymasterUserOp(op, bytes32(0), 0);
    }

    function test_depositAndOwnerWithdraw() public {
        pm.deposit{value: 1 ether}();
        assertEq(pm.getDeposit(), 1 ether);
        address payable to = payable(makeAddr("to"));
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, makeAddr("stranger")));
        pm.withdrawTo(to, 1 ether);
        pm.withdrawTo(to, 0.4 ether);
        assertEq(to.balance, 0.4 ether);
    }
}
