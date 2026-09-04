import { getAddress, isAddress, isAddressEqual } from "viem";
import { z } from "zod";
import { cleanupOperationSchema, simulateOperations } from "@incinerator/chain";
import { checkSponsorLimits, evaluateOperations, DEFAULT_PAYMASTER_GAS } from "@incinerator/sponsor";
import { bearer, clientIp, getServerContext, json, rateLimit } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  address: z.string().refine((s) => isAddress(s), "invalid address"),
  operations: z.array(cleanupOperationSchema).min(1).max(50),
});

/** Rough per-call overhead a wallet-side batch adds on top of the inner call. */
const PER_CALL_OVERHEAD = 12_000n;
const BASE_TX_GAS = 21_000n;

/**
 * POST /api/simulate { address, operations[] }
 *
 * Reconstructs every call server-side from typed descriptors, simulates them,
 * and reports (a) per-operation safety, (b) a user-paid gas estimate, and
 * (c) whether the creator-fee sponsor would cover the batch. Never accepts raw calldata.
 */
export async function POST(req: Request): Promise<Response> {
  if (!(await rateLimit(`sim:${clientIp(req)}`, 40))) return json({ error: "rate limited" }, { status: 429 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid request", issues: parsed.error.issues.slice(0, 3) }, { status: 400 });

  const ctx = getServerContext();
  const address = getAddress(parsed.data.address);
  const operations = parsed.data.operations;
  if (operations.some((o) => !isAddressEqual(o.owner, address))) {
    return json({ error: "operation owner mismatch" }, { status: 400 });
  }

  const policy = await ctx.policy();
  const [simulations, gasPrice, status] = await Promise.all([
    simulateOperations(ctx.client, operations, { maxGasPerCall: policy.MAX_GAS_PER_CALL, chunkSize: ctx.env.simulateChunk }).catch((e: unknown) => {
      ctx.log("simulate error", { error: e instanceof Error ? e.message : String(e) });
      return null;
    }),
    ctx.client.getGasPrice().catch(() => 0n),
    ctx.status(),
  ]);

  if (!simulations) return json({ error: "simulation unavailable" }, { status: 503 });

  const gasUnits = simulations.reduce((acc, s) => acc + BigInt(s.gasUsed) + PER_CALL_OVERHEAD, BASE_TX_GAS);
  const allSafe = simulations.every((s) => s.status === "success" && s.anomalies.length === 0);

  // Sponsorship eligibility: requires an authenticated wallet session.
  const session = ctx.session(bearer(req));
  let sponsorship: { eligible: boolean; code?: string; reason?: string; index?: number } = { eligible: false, code: "UNAUTHENTICATED", reason: "Sign in to check sponsorship" };
  if (!status.active) {
    sponsorship = { eligible: false, code: status.state, reason: status.reason };
  } else if (session && isAddressEqual(session.address, address) && session.chainId === ctx.chainId) {
    const deps = await ctx.evalDeps();
    const evaluated = await evaluateOperations(deps, address, operations);
    if (!evaluated.ok) {
      sponsorship = { eligible: false, code: evaluated.code, reason: evaluated.reason, ...(evaluated.index !== undefined ? { index: evaluated.index } : {}) };
    } else {
      const pm = DEFAULT_PAYMASTER_GAS;
      const worstCase = (evaluated.gasTotal + 250_000n + pm.paymasterVerificationGasLimit) * (gasPrice * 2n || 1n);
      const limits = await checkSponsorLimits(deps, { sender: address, gasTotal: evaluated.gasTotal, maxCostWei: worstCase, maxFeePerGas: gasPrice * 2n || 1n });
      sponsorship = limits.ok ? { eligible: true } : { eligible: false, code: limits.code, reason: limits.reason };
    }
  }

  return json({
    simulations,
    allSafe,
    gas: { units: gasUnits.toString(), priceWei: gasPrice.toString(), costWei: (gasUnits * gasPrice).toString() },
    sponsor: { state: status.state, active: status.active, backend: status.backend },
    sponsorship,
  });
}
