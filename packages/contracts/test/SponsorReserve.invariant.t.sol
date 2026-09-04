// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SponsorReserve} from "../src/SponsorReserve.sol";
import {MockEntryPoint} from "./SponsorReserve.t.sol";

contract ReserveHandler is Test {
    SponsorReserve public reserve;
    MockEntryPoint public ep;
    address public owner;
    address public keeper;
    address public paymaster;
    uint256 public totalFunded;
    uint256 public totalReturned;
    uint256 public totalRefilled;
    uint256 public totalBurned;

    constructor(SponsorReserve r, MockEntryPoint e, address o, address k, address pm) {
        reserve = r;
        ep = e;
        owner = o;
        keeper = k;
        paymaster = pm;
    }

    function fund(uint96 amount) external {
        amount = uint96(bound(amount, 0, 10 ether));
        vm.deal(address(this), amount);
        (bool ok,) = address(reserve).call{value: amount}("");
        require(ok);
        totalFunded += amount;
    }

    function spendGas(uint96 amount) external {
        uint256 hot = ep.balanceOf(paymaster);
        amount = uint96(bound(amount, 0, hot));
        ep.burn(paymaster, amount);
        totalBurned += amount;
    }

    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 2 days));
    }

    function refill() external {
        vm.prank(keeper);
        try reserve.refill() returns (uint256 amt) {
            totalRefilled += amt;
        } catch {}
    }

    function returnToTreasury(uint96 amount) external {
        amount = uint96(bound(amount, 0, address(reserve).balance));
        vm.prank(owner);
        reserve.returnToTreasury(amount);
        totalReturned += amount;
    }

    function togglePause(bool p) external {
        vm.prank(owner);
        if (p && !reserve.paused()) reserve.pause();
        if (!p && reserve.paused()) reserve.unpause();
    }
}

contract SponsorReserveInvariantTest is Test {
    SponsorReserve reserve;
    MockEntryPoint ep;
    ReserveHandler handler;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address paymaster = makeAddr("paymaster");
    address payable treasury = payable(makeAddr("treasury"));

    function setUp() public {
        vm.warp(1_800_000_000);
        ep = new MockEntryPoint();
        reserve = new SponsorReserve(
            owner,
            treasury,
            ep,
            paymaster,
            keeper,
            SponsorReserve.Params({
                lowWaterMark: 0.005 ether,
                targetBalance: 0.020 ether,
                maxHotBalance: 0.030 ether,
                maxRefillPerDay: 0.050 ether,
                minRefillInterval: 10 minutes
            })
        );
        handler = new ReserveHandler(reserve, ep, owner, keeper, paymaster);
        targetContract(address(handler));
    }

    /// ETH only ever leaves toward the paymaster deposit or the treasury.
    function invariant_onlyTwoExits() public view {
        assertEq(
            address(reserve).balance + handler.totalRefilled() + handler.totalReturned(), handler.totalFunded(), "conservation"
        );
        assertEq(treasury.balance, handler.totalReturned(), "treasury receives exactly the returns");
        assertEq(ep.balanceOf(paymaster) + handler.totalBurned(), handler.totalRefilled(), "deposit == refills - spend");
    }

    /// A refill never pushes the hot balance above the configured maximum.
    function invariant_hotBalanceBounded() public view {
        assertLe(ep.balanceOf(paymaster), reserve.maxHotBalance());
    }

    /// Daily refill accounting never exceeds the cap inside a window.
    function invariant_dailyCap() public view {
        assertLe(reserve.refilledInWindow(), reserve.maxRefillPerDay());
    }

    function invariant_immutables() public view {
        assertEq(reserve.treasury(), treasury);
        assertEq(reserve.paymaster(), paymaster);
        assertEq(address(reserve.entryPoint()), address(ep));
    }
}
