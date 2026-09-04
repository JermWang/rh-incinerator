import { handlePaymasterRpc, type JsonRpcRequest } from "@incinerator/sponsor";
import { bearer, clientIp, getServerContext, json, rateLimit } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/sponsor  (ERC-7677 paymaster service)
 *
 * Wallets call pm_getPaymasterStubData / pm_getPaymasterData here. The
 * session token travels in the ERC-7677 `context` (preferred), an
 * Authorization header, or the `session` query parameter for wallets that
 * cannot forward context. Every request is treated as hostile input.
 */
export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`pm:${clientIp(req)}`, 60)) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32005, message: "rate limited" } }, { status: 429 });
  }
  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = (await req.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 });
  }
  const ctx = getServerContext();
  const url = new URL(req.url);
  const headerToken = bearer(req);
  const queryToken = url.searchParams.get("session");

  const handle = async (r: JsonRpcRequest) => {
    const contextToken = extractContextToken(r);
    const session = ctx.session(contextToken ?? headerToken ?? queryToken);
    const deps = await ctx.paymasterDeps(session);
    const res = await handlePaymasterRpc(deps, r);
    ctx.log("paymaster", {
      method: r.method,
      sender: session?.address ?? null,
      ok: !res.error,
      code: (res.error?.data as { code?: string } | undefined)?.code ?? null,
      reason: res.error?.message ?? null,
    });
    return res;
  };

  if (Array.isArray(body)) {
    if (body.length > 5) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch too large" } }, { status: 400 });
    return json(await Promise.all(body.map(handle)));
  }
  return json(await handle(body));
}

function extractContextToken(r: JsonRpcRequest): string | null {
  const params = r.params;
  if (!Array.isArray(params)) return null;
  const context = params[3];
  if (context && typeof context === "object" && typeof (context as { sessionToken?: unknown }).sessionToken === "string") {
    return (context as { sessionToken: string }).sessionToken;
  }
  return null;
}

export async function GET(): Promise<Response> {
  const ctx = getServerContext();
  const status = await ctx.status();
  return json({ ok: true, erc7677: true, methods: ["pm_getPaymasterStubData", "pm_getPaymasterData"], chainId: ctx.chainId, state: status.state });
}
