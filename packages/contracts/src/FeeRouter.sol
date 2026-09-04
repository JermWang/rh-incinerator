// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @title FeeRouter
/// @notice Splits incoming native ETH (creator fees) between the cold creator
///         treasury and the SponsorReserve according to configurable basis points.
/// @dev Intentionally boring. No arbitrary calls, no delegatecall, no token
///      custody, no multicall. Recipients are immutable. `receive()` never
///      reverts so an upstream fee escrow can always pay out; distribution is a
///      separate, pausable, reentrancy-guarded step.
contract FeeRouter is Ownable2Step, Pausable, ReentrancyGuard {
    using Address for address payable;

    uint16 public constant BPS = 10_000;
    /// @notice Hard cap on the sponsor share. Bounds how much of creator income can
    ///         ever be routed toward hot infrastructure.
    uint16 public constant MAX_SPONSOR_BPS = 5_000;

    address payable public immutable treasury;
    address payable public immutable sponsorReserve;

    uint16 public treasuryBps;
    uint16 public sponsorBps;

    event FeesReceived(address indexed sender, uint256 amount);
    event TreasuryFunded(uint256 amount);
    event SponsorFunded(uint256 amount);
    event AllocationChanged(uint16 treasuryBps, uint16 sponsorBps);
    event SweptToTreasury(uint256 amount);

    error ZeroAddress();
    error SponsorShareTooHigh(uint16 requested, uint16 max);
    error NothingToDistribute();
    error UnsupportedCall();

    constructor(address initialOwner, address payable treasury_, address payable sponsorReserve_, uint16 sponsorBps_)
        Ownable(initialOwner)
    {
        if (treasury_ == address(0) || sponsorReserve_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        sponsorReserve = sponsorReserve_;
        _setAllocation(sponsorBps_);
    }

    /// @notice Accept creator fees. Never reverts.
    receive() external payable {
        emit FeesReceived(msg.sender, msg.value);
    }

    /// @notice Reject any call with data. There is no other surface.
    fallback() external payable {
        revert UnsupportedCall();
    }

    /// @notice Distribute the current balance. Permissionless: anyone may trigger,
    ///         funds can only go to the two immutable recipients.
    function distribute() external nonReentrant whenNotPaused {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToDistribute();

        uint256 sponsorShare = (balance * sponsorBps) / BPS;
        uint256 treasuryShare = balance - sponsorShare;

        // Interactions (no state to update: the balance is the state).
        if (treasuryShare > 0) {
            treasury.sendValue(treasuryShare);
            emit TreasuryFunded(treasuryShare);
        }
        if (sponsorShare > 0) {
            sponsorReserve.sendValue(sponsorShare);
            emit SponsorFunded(sponsorShare);
        }
    }

    /// @notice Change the split. Sponsor share can never exceed MAX_SPONSOR_BPS.
    function setAllocation(uint16 sponsorBps_) external onlyOwner {
        _setAllocation(sponsorBps_);
    }

    /// @notice Emergency: push everything to the cold treasury.
    function sweepToTreasury() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToDistribute();
        treasury.sendValue(balance);
        emit SweptToTreasury(balance);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setAllocation(uint16 sponsorBps_) internal {
        if (sponsorBps_ > MAX_SPONSOR_BPS) revert SponsorShareTooHigh(sponsorBps_, MAX_SPONSOR_BPS);
        sponsorBps = sponsorBps_;
        treasuryBps = BPS - sponsorBps_;
        emit AllocationChanged(treasuryBps, sponsorBps);
    }
}
