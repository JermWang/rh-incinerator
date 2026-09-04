import { numberToHex, type Address } from "viem";
import { ALCHEMY_NETWORK_SLUG, type SupportedChainId } from "@incinerator/chain";
import type { UserOperationV07 } from "./userop";

/**
 * Alchemy Gas Manager backend. Reached only after the local policy engine has
 * validated and simulated the request. Alchemy applies its own policy on top.
 */

export function alchemyRpcUrl(apiKey: string, chainId: SupportedChainId): string {
  return `https://${ALCHEMY_NETWORK_SLUG[chainId]}.g.alchemy.com/v2/${apiKey}`;
}

export async function alchemyPaymasterCall(params: {
  apiKey: string;
  policyId: string;
  chainId: SupportedChainId;
  method: "pm_getPaymasterStubData" | "pm_getPaymasterData";
  userOp: Record<string, unknown>;
  entryPoint: Address;
  timeoutMs?: number;
}): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), params.timeoutMs ?? 20_000);
  try {
    const res = await fetch(alchemyRpcUrl(params.apiKey, params.chainId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: params.method,
        params: [params.userOp, params.entryPoint, numberToHex(params.chainId), { policyId: params.policyId }],
      }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { message: string; code: number } };
    if (body.error) throw new Error(`alchemy ${params.method}: ${body.error.message}`);
    return body.result;
  } finally {
    clearTimeout(t);
  }
}

/** Serialize a parsed UserOperation back into the hex wire format. */
export function userOpToWire(op: UserOperationV07): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(op)) {
    if (v === undefined) continue;
    out[k] = typeof v === "bigint" ? numberToHex(v) : v;
  }
  return out;
}
