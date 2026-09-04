import { isHex } from "viem";
import { z } from "zod";
import { verifySiweAndIssueSession } from "@incinerator/sponsor";
import { clientIp, getServerContext, json, rateLimit } from "@/lib/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(20).max(4000),
  signature: z.string().refine((s) => isHex(s), "invalid signature"),
});

/** POST /api/session/verify { message, signature } → { token, address, exp } */
export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`verify:${clientIp(req)}`, 20)) return json({ error: "rate limited" }, { status: 429 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid request" }, { status: 400 });
  const ctx = getServerContext();
  const policy = await ctx.policy();
  const result = await verifySiweAndIssueSession({
    client: ctx.client,
    store: ctx.store,
    message: parsed.data.message,
    signature: parsed.data.signature as `0x${string}`,
    expectedDomain: new URL(req.url).host,
    expectedChainId: ctx.chainId,
    secret: ctx.env.serverSigningSecret,
    ttlMs: policy.SESSION_TTL_MS,
  });
  if (!result.ok) return json({ error: result.reason }, { status: 401 });
  return json({ token: result.token, address: result.session.address, exp: result.session.exp, chainId: result.session.chainId });
}
