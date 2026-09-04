import { describe, expect, it } from "vitest";
import { ROBINHOOD_CHAIN_TESTNET_ID } from "@incinerator/chain";
import { buildSiweMessage, issueNonce, signSessionToken, verifySessionToken, verifySiweAndIssueSession } from "../src/session";
import { MemoryStore } from "../src/store";
import { WALLET, signerAccount } from "./helpers";
import type { PublicClient } from "viem";

const secret = "s3cret";

describe("session tokens", () => {
  it("round-trips and rejects tampering or expiry", () => {
    const now = 1_800_000_000_000;
    const token = signSessionToken({ address: WALLET, chainId: ROBINHOOD_CHAIN_TESTNET_ID, iat: now, exp: now + 1000 }, secret);
    expect(verifySessionToken(token, secret, now)?.address).toBe(WALLET);
    expect(verifySessionToken(token, secret, now + 2000)).toBeNull();
    expect(verifySessionToken(token, "other", now)).toBeNull();
    const [v, body, mac] = token.split(".");
    const tampered = Buffer.from(JSON.stringify({ address: "0x2000000000000000000000000000000000000002", chainId: 46630, iat: now, exp: now + 1000 })).toString("base64url");
    expect(verifySessionToken(`${v}.${tampered}.${mac}`, secret, now)).toBeNull();
    expect(verifySessionToken(`${v}.${body}`, secret, now)).toBeNull();
    expect(verifySessionToken(null, secret, now)).toBeNull();
  });
});

describe("SIWE", () => {
  const fakeClient = (valid: boolean) => ({ verifySiweMessage: async () => valid }) as unknown as PublicClient;

  it("issues a session for a valid signature and consumes the nonce (no replay)", async () => {
    const store = new MemoryStore();
    const nonce = await issueNonce(store);
    const message = buildSiweMessage({ address: signerAccount.address, chainId: ROBINHOOD_CHAIN_TESTNET_ID, domain: "localhost:3000", uri: "http://localhost:3000", nonce });
    const signature = await signerAccount.signMessage({ message });
    const params = { client: fakeClient(true), store, message, signature, expectedDomain: "localhost:3000", expectedChainId: ROBINHOOD_CHAIN_TESTNET_ID, secret, ttlMs: 60_000 };
    const r = await verifySiweAndIssueSession(params);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.session.address).toBe(signerAccount.address);
    const replay = await verifySiweAndIssueSession(params);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toMatch(/nonce/);
  });

  it("rejects wrong domain, wrong chain, bad signature and unknown nonce", async () => {
    const store = new MemoryStore();
    const nonce = await issueNonce(store);
    const message = buildSiweMessage({ address: signerAccount.address, chainId: ROBINHOOD_CHAIN_TESTNET_ID, domain: "localhost:3000", uri: "http://localhost:3000", nonce });
    const signature = await signerAccount.signMessage({ message });
    const base = { client: fakeClient(true), store, message, signature, expectedDomain: "localhost:3000", expectedChainId: ROBINHOOD_CHAIN_TESTNET_ID, secret, ttlMs: 60_000 };
    expect((await verifySiweAndIssueSession({ ...base, expectedDomain: "evil.example" })).ok).toBe(false);
    expect((await verifySiweAndIssueSession({ ...base, expectedChainId: 4663 })).ok).toBe(false);
    expect((await verifySiweAndIssueSession({ ...base, client: fakeClient(false) })).ok).toBe(false);
    // nonce was consumed by the failed signature attempt above; a fresh store has no nonce
    expect((await verifySiweAndIssueSession({ ...base, store: new MemoryStore() })).ok).toBe(false);
  });
});
