import { getServerContext, json } from "@/lib/server";

export const runtime = "nodejs";

/** GET /api/sponsor/status — public, read-only sponsor state. */
export async function GET(): Promise<Response> {
  const ctx = getServerContext();
  const status = await ctx.status();
  return json(status, { headers: { "cache-control": "public, max-age=5" } });
}
