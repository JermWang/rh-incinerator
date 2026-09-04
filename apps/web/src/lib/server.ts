import "server-only";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { createChainClient, createIndexer, getDeployment, type Deployment, type IndexerProvider } from "@incinerator/chain";
import {
  getSponsorStatus,
  getStore,
  loadEnv,
  loadPolicy,
  verifySessionToken,
  type EvalDeps,
  type PaymasterDeps,
  type SessionPayload,
  type SponsorEnv,
  type SponsorPolicy,
  type SponsorStatus,
  type SponsorStore,
} from "@incinerator/sponsor";
import type { PublicClient } from "viem";

/**
 * Server-side composition root. Everything security-sensitive is built here,
 * once per process, from validated environment.
 */

export interface ServerContext {
  env: SponsorEnv;
  chainId: SponsorEnv["chainId"];
  client: PublicClient;
  store: SponsorStore;
  deployment: Deployment;
  signer: PrivateKeyAccount | null;
  indexer: IndexerProvider;
  policy: () => Promise<SponsorPolicy>;
  evalDeps: () => Promise<EvalDeps>;
  paymasterDeps: (session: SessionPayload | null) => Promise<PaymasterDeps>;
  status: (fresh?: boolean) => Promise<SponsorStatus>;
  session: (token: string | null | undefined) => SessionPayload | null;
  log: (msg: string, meta?: Record<string, unknown>) => void;
}

let ctx: ServerContext | null = null;

export function getServerContext(): ServerContext {
  if (ctx) return ctx;
  const env = loadEnv();
  const client = createChainClient(env.chainId, { alchemyApiKey: env.alchemyApiKey });
  const store = getStore(env.databaseUrl);
  const deployment = getDeployment(env.chainId);
  const signer = env.backend === "self" && env.signerPrivateKey ? privateKeyToAccount(env.signerPrivateKey) : null;
  const log = (msg: string, meta?: Record<string, unknown>) => {
    // Structured, single-line logs; never include secrets.
    console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...meta }));
  };
  const policy = () => loadPolicy(store);
  const evalDeps = async (): Promise<EvalDeps> => ({
    chainId: env.chainId,
    client,
    store,
    policy: await policy(),
    deployment,
    now: () => Date.now(),
    log,
    simulateChunk: env.simulateChunk,
  });
  const paymasterDeps = async (session: SessionPayload | null): Promise<PaymasterDeps> => ({
    ...(await evalDeps()),
    env,
    deployment,
    signer,
    session,
  });
  const status = async (fresh = false) =>
    getSponsorStatus(
      {
        chainId: env.chainId,
        backend: env.backend,
        client: client as never,
        store,
        policy: await policy(),
        deployment,
        now: () => Date.now(),
      },
      { fresh },
    );
  ctx = {
    env,
    chainId: env.chainId,
    client,
    store,
    deployment,
    signer,
    indexer: createIndexer(env.chainId, client, { alchemyApiKey: env.alchemyApiKey, blockscoutApiKey: env.blockscoutApiKey }),
    policy,
    evalDeps,
    paymasterDeps,
    status,
    session: (token) => verifySessionToken(token, env.serverSigningSecret),
    log,
  };
  return ctx;
}

/**
 * Rate limiting through the sponsor store: in-memory for a single instance,
 * shared through Postgres when DATABASE_URL is set.
 */
export async function rateLimit(key: string, perMinute: number): Promise<boolean> {
  try {
    return await getServerContext().store.consumeRateLimit(key, perMinute, 60_000, Date.now());
  } catch {
    // A broken limiter must not take the API down; fall back to allowing.
    return true;
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init.headers ?? {}) },
  });
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}
