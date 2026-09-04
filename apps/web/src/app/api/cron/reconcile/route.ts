import { checkAdminToken, reconcileSponsoredOperations } from "@incinerator/sponsor";
import { bearer, getServerContext, json } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/reconcile — settle sponsored operations against receipts and
 * expire stale reservations. Bearer CRON_SECRET (or ADMIN_TOKEN). Schedule it
 * every few minutes (Vercel cron, GitHub Actions, or `pnpm reconcile`).
 */
export async function GET(req: Request): Promise<Response> {
  const ctx = getServerContext();
  const token = bearer(req);
  const ok = checkAdminToken(token, ctx.env.cronSecret) || checkAdminToken(token, ctx.env.adminToken);
  if (!ok) return json({ error: "unauthorized" }, { status: 401 });
  const report = await reconcileSponsoredOperations({
    chainId: ctx.chainId,
    client: ctx.client,
    store: ctx.store,
    alchemyApiKey: ctx.env.alchemyApiKey,
    now: () => Date.now(),
    log: ctx.log,
  });
  return json(report);
}
