"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { createSiweMessage } from "viem/siwe";
import { useConnection, useSignMessage } from "wagmi";
import { api } from "@/lib/api";
import { ACTIVE_CHAIN_ID } from "@/lib/network";

interface StoredSession {
  token: string;
  address: Address;
  chainId: number;
  exp: number;
}

const KEY = "incinerator.session";

function load(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return s.exp > Date.now() + 5_000 ? s : null;
  } catch {
    return null;
  }
}

/**
 * Wallet session (SIWE). Required only for sponsored gas; the signature never
 * moves assets or grants approvals. The token lives in sessionStorage and is
 * scoped to the connected address + chain.
 */
export function useSession() {
  const { address, chainId } = useConnection();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(load());
  }, []);

  const valid = useMemo(() => {
    if (!session || !address) return null;
    if (session.address.toLowerCase() !== address.toLowerCase()) return null;
    if (session.chainId !== ACTIVE_CHAIN_ID) return null;
    if (session.exp <= Date.now() + 5_000) return null;
    return session;
  }, [session, address]);

  const signIn = useCallback(async (): Promise<string> => {
    if (!address) throw new Error("wallet not connected");
    if (chainId !== ACTIVE_CHAIN_ID) throw new Error("switch to Robinhood Chain first");
    setSigningIn(true);
    setError(null);
    try {
      const { nonce, domain } = await api.nonce();
      const message = createSiweMessage({
        address,
        chainId: ACTIVE_CHAIN_ID,
        domain,
        uri: window.location.origin,
        nonce,
        version: "1",
        statement: "Sign in to Incinerator. This signature does not move assets or approve anything.",
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + 10 * 60 * 1000),
      });
      const signature = await signMessageAsync({ message });
      const res = await api.verify(message, signature);
      const next: StoredSession = { token: res.token, address: res.address, chainId: res.chainId, exp: res.exp };
      sessionStorage.setItem(KEY, JSON.stringify(next));
      setSession(next);
      return next.token;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sign-in failed";
      setError(msg.includes("User rejected") ? "Signature rejected" : msg);
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, [address, chainId, signMessageAsync]);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(KEY);
    setSession(null);
  }, []);

  return { session: valid, token: valid?.token ?? null, signIn, signOut, signingIn, error };
}
