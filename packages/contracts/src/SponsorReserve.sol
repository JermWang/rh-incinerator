// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @dev Minimal EntryPoint deposit surface (ERC-4337 IStakeManager subset).
interface IEntryPointDeposit {
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

/// @title SponsorReserve
/// @notice Holds the sponsor allocation and refills the paymaster's EntryPoint
///         deposit one way, in bounded steps. This is the isolation boundary
///         between creator funds and hot sponsor infrastructure.
/// @dev ETH can only leave this contract toward two destinations: the
///      EntryPoint deposit of the immutable paymaster, or the immutable treasury.
///      No arbitrary calls, no delegatecall, no allowances.
contract SponsorReserve is Ownable2Step, Pausable, ReentrancyGuard {
    using Address for address payable;

    /// @notice Absolute caps. Owner parameters can never exceed these.
    uint256 public constant MAX_HOT_BALANCE_CAP = 1 ether;
    uint256 public constant MAX_REFILL_PER_DAY_CAP = 1 ether;
    uint256 public constant DAY = 1 days;

    address payable public immutable treasury;
    IEntryPointDeposit public immutable entryPoint;
    address public immutable paymaster;

    address public keeper;

    uint256 public lowWaterMark;
    uint256 public targetBalance;
    uint256 public maxHotBalance;
    uint256 public maxRefillPerDay;
    uint256 public minRefillInterval;

    uint256 public lastRefillAt;
    uint256 public windowStart;
    uint256 public refilledInWindow;

    event ReserveFunded(address indexed sender, uint256 amount);
    event Refilled(address indexed keeper, uint256 amount, uint256 hotBalanceAfter);
    event ReturnedToTreasury(uint256 amount);
    event ParamsChanged(
        uint256 lowWaterMark, uint256 targetBalance, uint256 maxHotBalance, uint256 maxRefillPerDay, uint256 minRefillInterval
    );
    event KeeperChanged(address indexed keeper);

    error ZeroAddress();
    error NotKeeper();
    error InvalidParams();
    error NothingToRefill();
    error RefillTooSoon(uint256 nextAllowedAt);
    error UnsupportedCall();

    struct Params {
        uint256 lowWaterMark;
        uint256 targetBalance;
        uint256 maxHotBalance;
        uint256 maxRefillPerDay;
        uint256 minRefillInterval;
    }

    constructor(
        address initialOwner,
        address payable treasury_,
        IEntryPointDeposit entryPoint_,
        address paymaster_,
        address keeper_,
        Params memory p
    ) Ownable(initialOwner) {
        if (treasury_ == address(0) || address(entryPoint_) == address(0) || paymaster_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        entryPoint = entryPoint_;
        paymaster = paymaster_;
        keeper = keeper_;
        _setParams(p);
    }

    modifier onlyKeeperOrOwner() {
        if (msg.sender != keeper && msg.sender != owner()) revert NotKeeper();
        _;
    }

    /// @notice Accept ETH pushed from the treasury or the FeeRouter.
    receive() external payable {
        emit ReserveFunded(msg.sender, msg.value);
    }

    fallback() external payable {
        revert UnsupportedCall();
    }

    /// @notice Current paymaster deposit at the EntryPoint (the "hot" balance).
    function hotBalance() public view returns (uint256) {
        return entryPoint.balanceOf(paymaster);
    }

    /// @notice Amount a refill would move right now, or 0.
    function refillable() public view returns (uint256) {
        if (paused()) return 0;
        if (block.timestamp < lastRefillAt + minRefillInterval) return 0;
        uint256 hot = hotBalance();
        if (hot >= lowWaterMark) return 0;

        uint256 amount = targetBalance - hot;
        uint256 room = maxHotBalance > hot ? maxHotBalance - hot : 0;
        if (amount > room) amount = room;

        uint256 spentInWindow = block.timestamp >= windowStart + DAY ? 0 : refilledInWindow;
        uint256 dailyRoom = maxRefillPerDay > spentInWindow ? maxRefillPerDay - spentInWindow : 0;
        if (amount > dailyRoom) amount = dailyRoom;

        if (amount > address(this).balance) amount = address(this).balance;
        return amount;
    }

    /// @notice Top the paymaster deposit up toward the target. Bounded by every cap.
    function refill() external onlyKeeperOrOwner nonReentrant whenNotPaused returns (uint256 amount) {
        if (block.timestamp < lastRefillAt + minRefillInterval) revert RefillTooSoon(lastRefillAt + minRefillInterval);
        amount = refillable();
        if (amount == 0) revert NothingToRefill();

        // Effects
        if (block.timestamp >= windowStart + DAY) {
            windowStart = block.timestamp;
            refilledInWindow = 0;
        }
        refilledInWindow += amount;
        lastRefillAt = block.timestamp;

        // Interaction: the only outbound path besides the treasury.
        entryPoint.depositTo{value: amount}(paymaster);
        emit Refilled(msg.sender, amount, hotBalance());
    }

    /// @notice Return unallocated reserve to the cold treasury. Destination is immutable.
    function returnToTreasury(uint256 amount) external onlyOwner nonReentrant {
        treasury.sendValue(amount);
        emit ReturnedToTreasury(amount);
    }

    function setParams(Params calldata p) external onlyOwner {
        _setParams(p);
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperChanged(keeper_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _setParams(Params memory p) internal {
        if (p.lowWaterMark >= p.targetBalance) revert InvalidParams();
        if (p.targetBalance > p.maxHotBalance) revert InvalidParams();
        if (p.maxHotBalance > MAX_HOT_BALANCE_CAP) revert InvalidParams();
        if (p.maxRefillPerDay == 0 || p.maxRefillPerDay > MAX_REFILL_PER_DAY_CAP) revert InvalidParams();
        lowWaterMark = p.lowWaterMark;
        targetBalance = p.targetBalance;
        maxHotBalance = p.maxHotBalance;
        maxRefillPerDay = p.maxRefillPerDay;
        minRefillInterval = p.minRefillInterval;
        emit ParamsChanged(p.lowWaterMark, p.targetBalance, p.maxHotBalance, p.maxRefillPerDay, p.minRefillInterval);
    }
}
