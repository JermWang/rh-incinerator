// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FeeRouter} from "../src/FeeRouter.sol";

contract FeeRouterHandler is Test {
    FeeRouter public router;
    address public owner;
    uint256 public totalReceived;

    constructor(FeeRouter r, address o) {
        router = r;
        owner = o;
    }

    function fund(uint96 amount) external {
        amount = uint96(bound(amount, 0, 100 ether));
        vm.deal(address(this), amount);
        (bool ok,) = address(router).call{value: amount}("");
        require(ok);
        totalReceived += amount;
    }

    function distribute() external {
        try router.distribute() {} catch {}
    }

    function setAllocation(uint16 bps) external {
        bps = uint16(bound(bps, 0, 5_000));
        vm.prank(owner);
        router.setAllocation(bps);
    }

    function togglePause(bool p) external {
        vm.prank(owner);
        if (p && !router.paused()) router.pause();
        if (!p && router.paused()) router.unpause();
    }
}

contract FeeRouterInvariantTest is Test {
    FeeRouter router;
    FeeRouterHandler handler;
    address owner = makeAddr("owner");
    address payable treasury = payable(makeAddr("treasury"));
    address payable reserve = payable(makeAddr("reserve"));

    function setUp() public {
        router = new FeeRouter(owner, treasury, reserve, 1_000);
        handler = new FeeRouterHandler(router, owner);
        targetContract(address(handler));
    }

    /// Every wei that entered is either still in the router or at one of the two recipients.
    function invariant_valueConserved() public view {
        assertEq(address(router).balance + treasury.balance + reserve.balance, handler.totalReceived());
    }

    /// Sponsor side never receives more than the hard cap share of everything distributed.
    function invariant_sponsorShareBounded() public view {
        uint256 distributed = treasury.balance + reserve.balance;
        assertLe(reserve.balance * 10_000, distributed * 5_000 + 10_000);
    }

    function invariant_allocationSums() public view {
        assertEq(uint256(router.sponsorBps()) + router.treasuryBps(), 10_000);
    }

    function invariant_recipientsImmutable() public view {
        assertEq(router.treasury(), treasury);
        assertEq(router.sponsorReserve(), reserve);
    }
}
