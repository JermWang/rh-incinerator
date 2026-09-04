import { isAddress, getAddress } from "viem";
import { scanWallet } from "@incinerator/chain";
import { clientIp, getServerContext, json, rateLimit } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/scan { address }
 * Read-only discovery of ERC-20 / NFT balances and live approvals.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await rateLimit(`scan:${clientIp(req)}`, 20))) return json({ error: "rate limited" }, { status: 429 });
  let body: { address?: string };
  try {
    body = (await req.json()) as { address?: string };
  } catch {
    return json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.address || !isAddress(body.address)) return json({ error: "invalid address" }, { status: 400 });

  const ctx = getServerContext();
  const policy = await ctx.policy();
  const started = Date.now();
  const result = await scanWallet(
    {
      chainId: ctx.chainId,
      client: ctx.client,
      indexer: ctx.indexer,
      maxGasPerCall: policy.MAX_GAS_PER_CALL,
      simulateChunk: ctx.env.simulateChunk,
      log: ctx.log,
    },
    getAddress(body.address),
  );
  ctx.log("scan", {
    address: result.address,
    indexer: ctx.indexer.name,
    tokens: result.tokens.length,
    nfts: result.nfts.length,
    approvals: result.approvals.length,
    ms: Date.now() - started,
    errors: result.errors,
  });
  return json(result);
}
