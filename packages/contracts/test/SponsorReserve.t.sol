// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SponsorReserve, IEntryPointDeposit} from "../src/SponsorReserve.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract MockEntryPoint is IEntryPointDeposit {
    mapping(address => uint256) public deposits;

    function depositTo(address account) external payable {
        deposits[account] += msg.value;
    }

    function balanceOf(address account) external view returns (uint256) {
        return deposits[account];
    }

    /// test helper: simulate gas being spent by the paymaster
    function burn(address account, uint256 amount) external {
        deposits[account] -= amount;
    }
}

contract SponsorReserveTest is Test {
    SponsorReserve reserve;
    MockEntryPoint ep;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address paymaster = makeAddr("paymaster");
    address payable treasury = payable(makeAddr("treasury"));

    SponsorReserve.Params p = SponsorReserve.Params({
        lowWaterMark: 0.005 ether,
        targetBalance: 0.020 ether,
        maxHotBalance: 0.030 ether,
        maxRefillPerDay: 0.050 ether,
        minRefillInterval: 10 minutes
    });

    function setUp() public {
        ep = new MockEntryPoint();
        reserve = new SponsorReserve(owner, treasury, ep, paymaster, keeper, p);
        vm.deal(address(reserve), 1 ether);
        vm.warp(1_800_000_000);
    }

    // ---- construction -------------------------------------------------------

    function test_rejectsZeroAddresses() public {
        vm.expectRevert(SponsorReserve.ZeroAddress.selector);
        new SponsorReserve(owner, payable(address(0)), ep, paymaster, keeper, p);
        vm.expectRevert(SponsorReserve.ZeroAddress.selector);
        new SponsorReserve(owner, treasury, IEntryPointDeposit(address(0)), paymaster, keeper, p);
        vm.expectRevert(SponsorReserve.ZeroAddress.selector);
        new SponsorReserve(owner, treasury, ep, address(0), keeper, p);
    }

    function test_rejectsInvalidParams() public {
        SponsorReserve.Params memory bad = p;
        bad.lowWaterMark = bad.targetBalance;
        vm.expectRevert(SponsorReserve.InvalidParams.selector);
        new SponsorReserve(owner, treasury, ep, paymaster, keeper, bad);

        bad = p;
        bad.targetBalance = bad.maxHotBalance + 1;
        vm.expectRevert(SponsorReserve.InvalidParams.selector);
        new SponsorReserve(owner, treasury, ep, paymaster, keeper, bad);

        bad = p;
        bad.maxHotBalance = 2 ether;
        bad.targetBalance = 1.5 ether;
        vm.expectRevert(SponsorReserve.InvalidParams.selector);
        new SponsorReserve(owner, treasury, ep, paymaster, keeper, bad);

        bad = p;
        bad.maxRefillPerDay = 0;
        vm.expectRevert(SponsorReserve.InvalidParams.selector);
        new SponsorReserve(owner, treasury, ep, paymaster, keeper, bad);
    }

    // ---- inbound ------------------------------------------------------------

    function test_receiveEmits() public {
        vm.expectEmit(true, false, false, true);
        emit SponsorReserve.ReserveFunded(address(this), 1 ether);
        (bool ok,) = address(reserve).call{value: 1 ether}("");
        assertTrue(ok);
    }

    function test_fallbackRejects() public {
        (bool ok,) = address(reserve).call(abi.encodeWithSignature("pullFromTreasury(uint256)", 1));
        assertFalse(ok);
        (ok,) = address(reserve).call{value: 1}(hex"01");
        assertFalse(ok);
    }

    // ---- refill -------------------------------------------------------------

    function test_refillToTargetWhenBelowLowWaterMark() public {
        assertEq(reserve.refillable(), 0.020 ether);
        vm.prank(keeper);
        uint256 amount = reserve.refill();
        assertEq(amount, 0.020 ether);
        assertEq(ep.balanceOf(paymaster), 0.020 ether);
        assertEq(address(reserve).balance, 0.98 ether);
    }

    function test_noRefillAboveLowWaterMark() public {
        vm.prank(keeper);
        reserve.refill();
        vm.warp(block.timestamp + 1 hours);
        ep.burn(paymaster, 0.010 ether); // 0.010 left, above 0.005
        assertEq(reserve.refillable(), 0);
        vm.prank(keeper);
        vm.expectRevert(SponsorReserve.NothingToRefill.selector);
        reserve.refill();
    }

    function test_refillRespectsInterval() public {
        vm.prank(keeper);
        reserve.refill();
        ep.burn(paymaster, 0.020 ether);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SponsorReserve.RefillTooSoon.selector, block.timestamp + 10 minutes));
        reserve.refill();
        vm.warp(block.timestamp + 10 minutes);
        vm.prank(keeper);
        reserve.refill();
    }

    function test_refillRespectsDailyCap() public {
        // 0.050 daily cap => two full refills (0.020 each) then 0.010 then nothing
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(keeper);
            reserve.refill();
            ep.burn(paymaster, 0.020 ether);
            vm.warp(block.timestamp + 10 minutes);
        }
        assertEq(reserve.refillable(), 0.010 ether);
        vm.prank(keeper);
        assertEq(reserve.refill(), 0.010 ether);
        ep.burn(paymaster, 0.010 ether);
        vm.warp(block.timestamp + 10 minutes);
        assertEq(reserve.refillable(), 0);
        vm.warp(block.timestamp + 1 days);
        assertEq(reserve.refillable(), 0.020 ether);
    }

    function test_refillNeverExceedsMaxHot() public {
        // hot balance is at 0.004 with maxHot 0.030 and target 0.020 -> refill 0.016
        ep.depositTo{value: 0.004 ether}(paymaster);
        assertEq(reserve.refillable(), 0.016 ether);
        // shrink maxHot to 0.010: refill capped at 0.006
        SponsorReserve.Params memory q = p;
        q.targetBalance = 0.010 ether;
        q.maxHotBalance = 0.010 ether;
        vm.prank(owner);
        reserve.setParams(q);
        assertEq(reserve.refillable(), 0.006 ether);
    }

    function test_refillCappedByReserveBalance() public {
        vm.deal(address(reserve), 0.001 ether);
        assertEq(reserve.refillable(), 0.001 ether);
    }

    function test_refillAuth() public {
        vm.expectRevert(SponsorReserve.NotKeeper.selector);
        reserve.refill();
        vm.prank(owner);
        reserve.refill(); // owner may also refill
    }

    function test_refillBlockedWhenPaused() public {
        vm.prank(owner);
        reserve.pause();
        assertEq(reserve.refillable(), 0);
        vm.prank(keeper);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        reserve.refill();
    }

    function test_setKeeper() public {
        address k2 = makeAddr("k2");
        vm.prank(owner);
        reserve.setKeeper(k2);
        vm.prank(keeper);
        vm.expectRevert(SponsorReserve.NotKeeper.selector);
        reserve.refill();
        vm.prank(k2);
        reserve.refill();
    }

    // ---- outbound to treasury only -----------------------------------------

    function test_returnToTreasuryOnlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        reserve.returnToTreasury(1);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, keeper));
        reserve.returnToTreasury(1);
        vm.prank(owner);
        reserve.returnToTreasury(0.5 ether);
        assertEq(treasury.balance, 0.5 ether);
    }

    function test_setParamsOnlyOwnerAndBounded() public {
        SponsorReserve.Params memory q = p;
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        reserve.setParams(q);
        q.maxHotBalance = 5 ether;
        q.targetBalance = 4 ether;
        vm.prank(owner);
        vm.expectRevert(SponsorReserve.InvalidParams.selector);
        reserve.setParams(q);
    }

    function test_forcedEthDoesNotBreakAccounting() public {
        vm.deal(address(reserve), 0); // drained
        assertEq(reserve.refillable(), 0);
        vm.deal(address(reserve), 0.003 ether); // "forced" ETH
        assertEq(reserve.refillable(), 0.003 ether);
    }

    /// forge-config: default.fuzz.runs = 512
    function testFuzz_refillNeverAboveCaps(uint96 hot, uint96 reserveBal, uint32 elapsed) public {
        hot = uint96(bound(hot, 0, 0.030 ether));
        vm.deal(address(reserve), reserveBal);
        if (hot > 0) ep.depositTo{value: hot}(paymaster);
        vm.warp(block.timestamp + elapsed);
        uint256 r = reserve.refillable();
        assertLe(r, reserveBal, "never more than reserve holds");
        assertLe(hot + r, p.maxHotBalance, "never above max hot");
        assertLe(r, p.maxRefillPerDay, "never above daily cap");
        if (r > 0) {
            vm.prank(keeper);
            assertEq(reserve.refill(), r);
            assertEq(ep.balanceOf(paymaster), hot + r);
        }
    }
}
