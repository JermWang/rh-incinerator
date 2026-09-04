import { parseAbi } from "viem";

/** Minimal ERC-20 surface plus the common burn variant. */
export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function burn(uint256 amount)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

export const erc721Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function approve(address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function burn(uint256 tokenId)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
]);

export const erc1155Abi = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function burn(address account, uint256 id, uint256 value)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event ApprovalForAll(address indexed account, address indexed operator, bool approved)",
]);

export const multicall3Abi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calldata calls) payable returns (Result[] memory returnData)",
]);

export const entryPointAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function depositTo(address account) payable",
  "function getNonce(address sender, uint192 key) view returns (uint256)",
]);

/** Sponsor infrastructure ABIs (mirrors packages/contracts). */
export const sponsorReserveAbi = parseAbi([
  "function treasury() view returns (address)",
  "function entryPoint() view returns (address)",
  "function paymaster() view returns (address)",
  "function lowWaterMark() view returns (uint256)",
  "function targetBalance() view returns (uint256)",
  "function maxHotBalance() view returns (uint256)",
  "function maxRefillPerDay() view returns (uint256)",
  "function minRefillInterval() view returns (uint256)",
  "function lastRefillAt() view returns (uint256)",
  "function paused() view returns (bool)",
  "function hotBalance() view returns (uint256)",
  "function refillable() view returns (uint256)",
  "function refill() returns (uint256)",
  "event Refilled(address indexed keeper, uint256 amount, uint256 hotBalanceAfter)",
  "event ReserveFunded(address indexed sender, uint256 amount)",
  "event ReturnedToTreasury(uint256 amount)",
]);

export const feeRouterAbi = parseAbi([
  "function treasury() view returns (address)",
  "function sponsorReserve() view returns (address)",
  "function treasuryBps() view returns (uint16)",
  "function sponsorBps() view returns (uint16)",
  "function paused() view returns (bool)",
  "function distribute()",
  "event FeesReceived(address indexed sender, uint256 amount)",
  "event TreasuryFunded(uint256 amount)",
  "event SponsorFunded(uint256 amount)",
  "event AllocationChanged(uint16 treasuryBps, uint16 sponsorBps)",
]);

export const ERC165_ERC721 = "0x80ac58cd" as const;
export const ERC165_ERC1155 = "0xd9b67a26" as const;
