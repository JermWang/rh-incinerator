import { getAddress, isAddress, isAddressEqual, isHash } from "viem";
import { z } from "zod";
import { OPERATION_KINDS } from "@incinerator/chain";
import { bearer, clientIp, getServerContext, json, rateLimit } from "@/lib/server";

export const runtime = "nodejs";

const recordSchema = z.object({
  id: z.string().min(8).max(80),
  wallet: z.string().refine((s) => isAddress(s)),
  txHash: z.string().refine((s) => isHash(s)).nullable(),
  userOpHash: z.string().refine((s) => isHash(s)).nullable(),
  kinds: z.array(z.enum(OPERATION_KINDS)).max(50),
  sponsored: z.boolean(),
  status: z.enum(["SUBMITTED", "CONFIRMED", "FAILED"]),
});

/**
 * POST /api/cleanups — record a submitted cleanup (session required so only
 * the wallet owner can write its own history).
 * GET  /api/cleanups?wallet=0x… — list a wallet's cleanups.
 */
export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`cleanups:${clientIp(req)}`, 30)) return json({ error: "rate limited" }, { status: 429 });
  const ctx = getServerContext();
  const session = ctx.session(bearer(req));
  const parsed = recordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid request" }, { status: 400 });
  const wallet = getAddress(parsed.data.wallet);
  if (!session || !isAddressEqual(session.address, wallet)) return json({ error: "unauthenticated" }, { status: 401 });
  const d = parsed.data;
  await ctx.store.insertCleanup({
    id: d.id,
    chainId: ctx.chainId,
    wallet,
    txHash: (d.txHash as `0x${string}` | null) ?? null,
    userOpHash: (d.userOpHash as `0x${string}` | null) ?? null,
    kinds: d.kinds,
    sponsored: d.sponsored,
    status: d.status,
    createdAt: Date.now(),
  });
  if (d.status !== "SUBMITTED") {
    await ctx.store.updateCleanup(d.id, { status: d.status, txHash: (d.txHash as `0x${string}` | null) ?? null });
  }
  return json({ ok: true });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !isAddress(wallet)) return json({ error: "invalid wallet" }, { status: 400 });
  const ctx = getServerContext();
  const items = await ctx.store.listCleanupsForWallet(getAddress(wallet), 50);
  return json({ items });
}
