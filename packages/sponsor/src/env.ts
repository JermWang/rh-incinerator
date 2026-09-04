import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { ROBINHOOD_CHAIN_MAINNET_ID, ROBINHOOD_CHAIN_TESTNET_ID, type SupportedChainId } from "@incinerator/chain";

export type SponsorBackend = "self" | "alchemy" | "none";

export interface SponsorEnv {
  chainId: SupportedChainId;
  network: "testnet" | "mainnet";
  alchemyApiKey: string | undefined;
  alchemyGasPolicyId: string | undefined;
  blockscoutApiKey: string | undefined;
  backend: SponsorBackend;
  signerPrivateKey: Hex | undefined;
  serverSigningSecret: string;
  adminToken: string | undefined;
  cronSecret: string | undefined;
  databaseUrl: string | undefined;
  isProduction: boolean;
  /** Ops per eth_simulateV1 request; higher behind a dedicated provider. */
  simulateChunk: number;
}

let cached: SponsorEnv | null = null;
let ephemeralSecret: string | null = null;

/**
 * Parse and validate server environment. Fails closed: a misconfigured sponsor
 * backend degrades to "none" (user-paid transactions still work).
 *
 * Backend selection: explicit SPONSOR_BACKEND wins; otherwise "self" when a
 * signer key exists, "alchemy" when an Alchemy key + Gas Manager policy exist,
 * else "none".
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): SponsorEnv {
  if (cached && source === process.env) return cached;
  const isProduction = source.NODE_ENV === "production";
  const network = source.NEXT_PUBLIC_INCINERATOR_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const chainId = network === "mainnet" ? ROBINHOOD_CHAIN_MAINNET_ID : ROBINHOOD_CHAIN_TESTNET_ID;

  const alchemyApiKey = clean(source.ALCHEMY_API_KEY);
  const alchemyGasPolicyId = clean(source.ALCHEMY_GAS_POLICY_ID);
  const signerPrivateKey = clean(source.SPONSOR_SIGNER_PRIVATE_KEY) as Hex | undefined;
  const validSigner = Boolean(signerPrivateKey && /^0x[0-9a-fA-F]{64}$/.test(signerPrivateKey));
  const requested = clean(source.SPONSOR_BACKEND);

  let backend: SponsorBackend = "none";
  if (requested === "self") backend = validSigner ? "self" : "none";
  else if (requested === "alchemy") backend = alchemyApiKey && alchemyGasPolicyId ? "alchemy" : "none";
  else if (requested === undefined) {
    if (validSigner) backend = "self";
    else if (alchemyApiKey && alchemyGasPolicyId) backend = "alchemy";
  }

  let serverSigningSecret = clean(source.SERVER_SIGNING_SECRET);
  if (!serverSigningSecret) {
    if (isProduction) throw new Error("SERVER_SIGNING_SECRET is required in production");
    ephemeralSecret ??= randomBytes(32).toString("hex");
    serverSigningSecret = ephemeralSecret;
  }

  const env: SponsorEnv = {
    chainId,
    network,
    alchemyApiKey,
    alchemyGasPolicyId,
    blockscoutApiKey: clean(source.BLOCKSCOUT_API_KEY),
    backend,
    signerPrivateKey: backend === "self" ? signerPrivateKey : undefined,
    serverSigningSecret,
    adminToken: clean(source.ADMIN_TOKEN),
    cronSecret: clean(source.CRON_SECRET),
    databaseUrl: clean(source.DATABASE_URL),
    isProduction,
    simulateChunk: alchemyApiKey ? 25 : 10,
  };
  if (source === process.env) cached = env;
  return env;
}

export function resetEnvCache(): void {
  cached = null;
}

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}
