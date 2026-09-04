import { createHmac, timingSafeEqual } from "node:crypto";
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import { createSiweMessage, generateSiweNonce, parseSiweMessage } from "viem/siwe";
import type { SupportedChainId } from "@incinerator/chain";
import type { SponsorStore } from "./store";

/**
 * Wallet sessions via Sign-In With Ethereum (EIP-4361).
 *
 * The session token binds a wallet address to a chain for a short time. The
 * paymaster endpoint requires it so that UserOperation.sender must equal the
 * authenticated wallet: a request for free gas is only honoured for the wallet
 * that proved control of the key.
 */

const NONCE_TTL_MS = 10 * 60 * 1000;

export interface SessionPayload {
  address: Address;
  chainId: SupportedChainId;
  /** Expiry, ms since epoch. */
  exp: number;
  /** Issued at. */
  iat: number;
}

export async function issueNonce(store: SponsorStore, now = Date.now()): Promise<string> {
  const nonce = generateSiweNonce();
  await store.putNonce(nonce, now + NONCE_TTL_MS);
  return nonce;
}

export function buildSiweMessage(params: {
  address: Address;
  chainId: SupportedChainId;
  domain: string;
  uri: string;
  nonce: string;
  statement?: string;
}): string {
  return createSiweMessage({
    address: params.address,
    chainId: params.chainId,
    domain: params.domain,
    uri: params.uri,
    nonce: params.nonce,
    version: "1",
    statement: params.statement ?? "Sign in to Incinerator. This signature does not move assets or approve anything.",
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + NONCE_TTL_MS),
  });
}

export interface VerifySiweParams {
  client: PublicClient;
  store: SponsorStore;
  message: string;
  signature: Hex;
  expectedDomain: string;
  expectedChainId: SupportedChainId;
  secret: string;
  ttlMs: number;
  now?: number;
}

export type VerifySiweResult = { ok: true; token: string; session: SessionPayload } | { ok: false; reason: string };

export async function verifySiweAndIssueSession(p: VerifySiweParams): Promise<VerifySiweResult> {
  const now = p.now ?? Date.now();
  const parsed = parseSiweMessage(p.message);
  if (!parsed.address || !parsed.nonce || !parsed.chainId || !parsed.domain) {
    return { ok: false, reason: "malformed SIWE message" };
  }
  if (parsed.domain !== p.expectedDomain) return { ok: false, reason: "SIWE domain mismatch" };
  if (parsed.chainId !== p.expectedChainId) return { ok: false, reason: "SIWE chain mismatch" };
  if (parsed.expirationTime && parsed.expirationTime.getTime() < now) return { ok: false, reason: "SIWE message expired" };

  // Replay protection: a nonce is consumed exactly once.
  const fresh = await p.store.consumeNonce(parsed.nonce, now);
  if (!fresh) return { ok: false, reason: "unknown or reused nonce" };

  let valid = false;
  try {
    // Handles EOA, ERC-1271 and ERC-6492 signatures.
    valid = await p.client.verifySiweMessage({ message: p.message, signature: p.signature });
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "invalid signature" };

  const session: SessionPayload = {
    address: getAddress(parsed.address),
    chainId: p.expectedChainId,
    iat: now,
    exp: now + p.ttlMs,
  };
  return { ok: true, token: signSessionToken(session, p.secret), session };
}

// ---------------------------------------------------------------------------
// Token format: v1.<base64url(json)>.<base64url(hmac-sha256)>
// ---------------------------------------------------------------------------

export function signSessionToken(payload: SessionPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const mac = b64url(createHmac("sha256", secret).update(`v1.${body}`).digest());
  return `v1.${body}.${mac}`;
}

export function verifySessionToken(token: string | null | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, body, mac] = parts as [string, string, string];
  const expected = b64url(createHmac("sha256", secret).update(`v1.${body}`).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (typeof payload.address !== "string") return null;
    return { ...payload, address: getAddress(payload.address) };
  } catch {
    return null;
  }
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}
