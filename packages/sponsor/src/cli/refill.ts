/**
 * Refill keeper. Pushes ETH from the SponsorReserve into the paymaster's
 * EntryPoint deposit when it falls below the low-water mark.
 *
 * The keeper key has no access to funds: SponsorReserve.refill() can only move
 * reserve ETH into the paymaster deposit, bounded by the contract's caps.
 *
 *   KEEPER_PRIVATE_KEY=0x... NEXT_PUBLIC_INCINERATOR_NETWORK=testnet pnpm refill
 */
import { createWalletClient, formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ROBINHOOD_CHAIN_MAINNET_ID,
  ROBINHOOD_CHAIN_TESTNET_ID,
  chainById,
  createChainClient,
  getDeployment,
  sponsorReserveAbi,
} from "@incinerator/chain";

const key = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
if (!key) {
  console.error("KEEPER_PRIVATE_KEY is required");
  process.exit(1);
}
const chainId = process.env.NEXT_PUBLIC_INCINERATOR_NETWORK === "mainnet" ? ROBINHOOD_CHAIN_MAINNET_ID : ROBINHOOD_CHAIN_TESTNET_ID;
const deployment = getDeployment(chainId);
if (!deployment.sponsorReserve) {
  console.error(`SponsorReserve not deployed on chain ${chainId}`);
  process.exit(1);
}

const account = privateKeyToAccount(key);
const publicClient = createChainClient(chainId, { alchemyApiKey: process.env.ALCHEMY_API_KEY });
const wallet = createWalletClient({ account, chain: chainById(chainId), transport: http(publicClient.transport.url as string) });

const [refillable, hot, paused] = await Promise.all([
  publicClient.readContract({ address: deployment.sponsorReserve, abi: sponsorReserveAbi, functionName: "refillable" }),
  publicClient.readContract({ address: deployment.sponsorReserve, abi: sponsorReserveAbi, functionName: "hotBalance" }),
  publicClient.readContract({ address: deployment.sponsorReserve, abi: sponsorReserveAbi, functionName: "paused" }),
]);
console.log(`hot balance ${formatEther(hot)} ETH, refillable ${formatEther(refillable)} ETH, paused=${paused}`);
if (paused || refillable === 0n) {
  console.log("nothing to do");
  process.exit(0);
}
const hash = await wallet.writeContract({ address: deployment.sponsorReserve, abi: sponsorReserveAbi, functionName: "refill" });
console.log(`refill submitted: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`status ${receipt.status} in block ${receipt.blockNumber}`);
