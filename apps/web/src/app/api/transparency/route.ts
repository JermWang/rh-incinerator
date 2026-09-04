import { keccak256, toHex, type Hex } from "viem";
import { explorerAddressUrl, explorerTxUrl, getBlockscout } from "@incinerator/chain";
import { getServerContext, json } from "@/lib/server";

export const runtime = "nodejs";

const REFILLED_TOPIC: Hex = keccak256(toHex("Refilled(address,uint256,uint256)"));

/**
 * GET /api/transparency — read-only sponsor metrics. Only values that can be
 * verified on-chain or from the sponsor's own ledger are reported; anything
 * that cannot be sourced is returned as null, never fabricated.
 */
export async function GET(): Promise<Response> {
  const ctx = getServerContext();
  const [status, metrics] = await Promise.all([ctx.status(), ctx.store.metrics(Date.now())]);
  const d = ctx.deployment;

  let refills: { txHash: string; amountWei: string; hotBalanceAfter: string; blockNumber: number; timestamp: number; url: string }[] = [];
  if (d.sponsorReserve) {
    try {
      const logs = await getBlockscout(ctx.chainId, ctx.env.blockscoutApiKey).logsPaged({ topic0: REFILLED_TOPIC, fromBlock: d.deployedAtBlock ?? 0 });
      refills = logs
        .filter((l) => l.address.toLowerCase() === d.sponsorReserve!.toLowerCase())
        .map((l) => ({
          txHash: l.transactionHash,
          amountWei: BigInt(`0x${l.data.slice(2, 66)}`).toString(),
          hotBalanceAfter: BigInt(`0x${l.data.slice(66, 130)}`).toString(),
          blockNumber: Number(l.blockNumber),
          timestamp: Number(l.timeStamp) * 1000,
          url: explorerTxUrl(ctx.chainId, l.transactionHash),
        }))
        .sort((a, b) => b.blockNumber - a.blockNumber)
        .slice(0, 20);
    } catch (e) {
      ctx.log("transparency refills failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  const link = (a: string | null | undefined) => (a ? { address: a, url: explorerAddressUrl(ctx.chainId, a) } : null);

  return json(
    {
      chainId: ctx.chainId,
      deployed: Boolean(d.paymaster && d.sponsorReserve),
      status,
      metrics: {
        gas24hWei: metrics.gas24hWei.toString(),
        ops24h: metrics.ops24h,
        lifetimeGasWei: metrics.lifetimeGasWei.toString(),
        lifetimeOps: metrics.lifetimeOps,
      },
      reserveBalanceWei: status.reserveBalanceWei,
      hotBalanceWei: status.hotBalanceWei,
      lastRefill: refills[0] ?? null,
      refills,
      contracts: {
        entryPoint: link(d.entryPoint),
        paymaster: link(d.paymaster),
        sponsorReserve: link(d.sponsorReserve),
        feeRouter: link(d.feeRouter),
        treasury: link(d.treasury),
      },
      generatedAt: Date.now(),
    },
    { headers: { "cache-control": "public, max-age=15" } },
  );
}
