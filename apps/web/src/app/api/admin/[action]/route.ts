import { isAddress } from "viem";
import { z } from "zod";
import {
  checkAdminToken,
  denylistContract,
  inspect,
  pauseSponsorship,
  resumeSponsorship,
  setPolicyOverrides,
  undenylistContract,
} from "@incinerator/sponsor";
import { bearer, clientIp, getServerContext, json, rateLimit } from "@/lib/server";

export const runtime = "nodejs";

/**
 * Internal admin surface. Bearer ADMIN_TOKEN required. No treasury operations
 * exist here by design.
 */
function authed(req: Request): boolean {
  const ctx = getServerContext();
  return checkAdminToken(bearer(req), ctx.env.adminToken);
}

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  if (!rateLimit(`admin:${clientIp(req)}`, 60)) return json({ error: "rate limited" }, { status: 429 });
  if (!authed(req)) return json({ error: "unauthorized" }, { status: 401 });
  const { action } = await params;
  const ctx = getServerContext();
  switch (action) {
    case "status":
      return json({ status: await ctx.status(true), backend: ctx.env.backend, chainId: ctx.chainId });
    case "inspect":
      return json(await inspect(ctx.store));
    default:
      return json({ error: "unknown action" }, { status: 404 });
  }
}

const limitsSchema = z.record(z.string(), z.string());
const denySchema = z.object({ address: z.string().refine((s) => isAddress(s)), reason: z.string().max(200).nullable().optional(), ttlHours: z.number().positive().max(24 * 365).nullable().optional() });
const undenySchema = z.object({ address: z.string().refine((s) => isAddress(s)) });

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  if (!rateLimit(`admin:${clientIp(req)}`, 60)) return json({ error: "rate limited" }, { status: 429 });
  if (!authed(req)) return json({ error: "unauthorized" }, { status: 401 });
  const { action } = await params;
  const ctx = getServerContext();
  const body = await req.json().catch(() => ({}));
  try {
    switch (action) {
      case "pause":
        await pauseSponsorship(ctx.store);
        ctx.log("admin pause");
        return json({ ok: true, status: await ctx.status(true) });
      case "resume":
        await resumeSponsorship(ctx.store);
        ctx.log("admin resume");
        return json({ ok: true, status: await ctx.status(true) });
      case "limits": {
        const patch = limitsSchema.parse(body);
        const overrides = await setPolicyOverrides(ctx.store, patch);
        ctx.log("admin limits", { patch });
        return json({ ok: true, overrides, policy: await ctx.policy() });
      }
      case "denylist": {
        const d = denySchema.parse(body);
        await denylistContract(ctx.store, d.address, d.reason ?? null, d.ttlHours ? d.ttlHours * 3_600_000 : null);
        ctx.log("admin denylist", { address: d.address, reason: d.reason ?? null });
        return json({ ok: true, denylist: await ctx.store.listDenylisted() });
      }
      case "undeny": {
        const d = undenySchema.parse(body);
        await undenylistContract(ctx.store, d.address);
        return json({ ok: true, denylist: await ctx.store.listDenylisted() });
      }
      default:
        return json({ error: "unknown action" }, { status: 404 });
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "bad request" }, { status: 400 });
  }
}
