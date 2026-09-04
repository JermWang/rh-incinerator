import { issueNonce } from "@incinerator/sponsor";
import { clientIp, getServerContext, json, rateLimit } from "@/lib/server";

export const runtime = "nodejs";

/** GET /api/session/nonce — one-time SIWE nonce. */
export async function GET(req: Request): Promise<Response> {
  if (!rateLimit(`nonce:${clientIp(req)}`, 30)) return json({ error: "rate limited" }, { status: 429 });
  const ctx = getServerContext();
  const nonce = await issueNonce(ctx.store);
  return json({ nonce, chainId: ctx.chainId, domain: new URL(req.url).host });
}
