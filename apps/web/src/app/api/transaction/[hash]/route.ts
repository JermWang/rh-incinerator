import { isHash } from "viem";
import { trackHash } from "@incinerator/sponsor";
import { clientIp, getServerContext, json, rateLimit } from "@/lib/server";

export const runtime = "nodejs";

/** GET /api/transaction/:hash — transaction or UserOperation status with cost reconciliation. */
export async function GET(req: Request, { params }: { params: Promise<{ hash: string }> }): Promise<Response> {
  if (!(await rateLimit(`tx:${clientIp(req)}`, 120))) return json({ error: "rate limited" }, { status: 429 });
  const { hash } = await params;
  if (!isHash(hash)) return json({ error: "invalid hash" }, { status: 400 });
  const ctx = getServerContext();
  const status = await trackHash(
    { chainId: ctx.chainId, client: ctx.client, store: ctx.store, alchemyApiKey: ctx.env.alchemyApiKey, now: () => Date.now() },
    hash,
  );
  return json(status);
}
