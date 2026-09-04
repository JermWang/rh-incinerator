// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract Rejector {
    receive() external payable {
        revert("no");
    }
}

contract Reentrant {
    FeeRouter public router;
    uint256 public calls;

    receive() external payable {
        calls++;
        if (calls < 3) {
            try router.distribute() {} catch {}
        }
    }

    function set(FeeRouter r) external {
        router = r;
    }
}

contract FeeRouterTest is Test {
    FeeRouter router;
    address owner = makeAddr("owner");
    address payable treasury = payable(makeAddr("treasury"));
    address payable reserve = payable(makeAddr("reserve"));

    function setUp() public {
        router = new FeeRouter(owner, treasury, reserve, 1_000);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(FeeRouter.ZeroAddress.selector);
        new FeeRouter(owner, payable(address(0)), reserve, 1_000);
        vm.expectRevert(FeeRouter.ZeroAddress.selector);
        new FeeRouter(owner, treasury, payable(address(0)), 1_000);
    }

    function test_constructorRejectsSponsorShareAboveCap() public {
        vm.expectRevert(abi.encodeWithSelector(FeeRouter.SponsorShareTooHigh.selector, 5_001, 5_000));
        new FeeRouter(owner, treasury, reserve, 5_001);
    }

    function test_receiveEmitsAndNeverReverts() public {
        vm.expectEmit(true, false, false, true);
        emit FeeRouter.FeesReceived(address(this), 1 ether);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertTrue(ok);
        // even when paused
        vm.prank(owner);
        router.pause();
        (ok,) = address(router).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(router).balance, 2 ether);
    }

    function test_fallbackRejectsCalldata() public {
        (bool ok,) = address(router).call{value: 1}(hex"deadbeef");
        assertFalse(ok);
        (ok,) = address(router).call(abi.encodeWithSignature("withdrawFromTreasury()"));
        assertFalse(ok);
    }

    function test_distributeSplitsByBps() public {
        vm.deal(address(router), 10 ether);
        router.distribute();
        assertEq(treasury.balance, 9 ether);
        assertEq(reserve.balance, 1 ether);
        assertEq(address(router).balance, 0);
    }

    function test_distributeRevertsWhenEmpty() public {
        vm.expectRevert(FeeRouter.NothingToDistribute.selector);
        router.distribute();
    }

    function test_distributeRevertsWhenPaused() public {
        vm.deal(address(router), 1 ether);
        vm.prank(owner);
        router.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        router.distribute();
        vm.prank(owner);
        router.unpause();
        router.distribute();
        assertEq(address(router).balance, 0);
    }

    function test_distributeRevertsIfRecipientRejects() public {
        FeeRouter r = new FeeRouter(owner, payable(address(new Rejector())), reserve, 1_000);
        vm.deal(address(r), 1 ether);
        vm.expectRevert();
        r.distribute();
        // funds stay put (fail closed)
        assertEq(address(r).balance, 1 ether);
    }

    function test_distributeIsReentrancySafe() public {
        Reentrant attacker = new Reentrant();
        FeeRouter r = new FeeRouter(owner, payable(address(attacker)), reserve, 1_000);
        attacker.set(r);
        vm.deal(address(r), 10 ether);
        r.distribute();
        assertEq(address(attacker).balance, 9 ether);
        assertEq(reserve.balance, 1 ether);
        assertEq(attacker.calls(), 1);
    }

    function test_setAllocationOnlyOwnerAndBounded() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        router.setAllocation(2_000);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FeeRouter.SponsorShareTooHigh.selector, 6_000, 5_000));
        router.setAllocation(6_000);

        vm.prank(owner);
        router.setAllocation(2_500);
        assertEq(router.sponsorBps(), 2_500);
        assertEq(router.treasuryBps(), 7_500);
        assertEq(uint256(router.sponsorBps()) + router.treasuryBps(), 10_000);
    }

    function test_sweepToTreasuryOnlyOwner() public {
        vm.deal(address(router), 3 ether);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        router.sweepToTreasury();
        vm.prank(owner);
        router.sweepToTreasury();
        assertEq(treasury.balance, 3 ether);
        assertEq(reserve.balance, 0);
    }

    function test_ownershipIsTwoStep() public {
        address next = makeAddr("next");
        vm.prank(owner);
        router.transferOwnership(next);
        assertEq(router.owner(), owner);
        vm.prank(next);
        router.acceptOwnership();
        assertEq(router.owner(), next);
    }

    function test_forcedEthIsDistributedNormally() public {
        // ETH arriving via selfdestruct / coinbase cannot bypass the split.
        vm.deal(address(router), 1 ether);
        router.distribute();
        assertEq(treasury.balance + reserve.balance, 1 ether);
    }

    /// forge-config: default.fuzz.runs = 1024
    function testFuzz_distributeConservesValueAndRespectsSplit(uint96 amount, uint16 bps) public {
        bps = uint16(bound(bps, 0, 5_000));
        vm.prank(owner);
        router.setAllocation(bps);
        vm.assume(amount > 0);
        vm.deal(address(router), amount);
        router.distribute();
        assertEq(treasury.balance + reserve.balance, amount, "value conserved");
        assertEq(address(router).balance, 0, "no dust");
        assertEq(reserve.balance, (uint256(amount) * bps) / 10_000, "sponsor share");
        assertLe(reserve.balance * 10_000, uint256(amount) * 5_000 + 10_000, "sponsor never above cap");
    }

    function testFuzz_allocationAlwaysSumsTo10000(uint16 bps) public {
        bps = uint16(bound(bps, 0, 5_000));
        vm.prank(owner);
        router.setAllocation(bps);
        assertEq(uint256(router.sponsorBps()) + router.treasuryBps(), 10_000);
    }
}
