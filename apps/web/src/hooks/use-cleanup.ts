"use client";

import { useCallback, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useConfig, useConnection } from "wagmi";
import { sendCalls, sendTransaction, waitForCallsStatus, waitForTransactionReceipt } from "wagmi/actions";
import { encodeOperation, type CleanupOperation } from "@incinerator/chain";
import { api, type SimulateResponse } from "@/lib/api";
import { ACTIVE_CHAIN_ID } from "@/lib/network";

export type ExecutionMode = "sponsored" | "atomic" | "sequential";

export type Stage =
  | "idle"
  | "preparing"
  | "simulating"
  | "checking-sponsor"
  | "signing-in"
  | "awaiting-signature"
  | "submitted"
  | "confirmed"
  | "failed";

export const STAGE_ORDER: Stage[] = ["preparing", "simulating", "checking-sponsor", "awaiting-signature", "submitted", "confirmed"];

export interface CleanupState {
  stage: Stage;
  mode: ExecutionMode | null;
  error: string | null;
  txHashes: Hex[];
  callsId: string | null;
  progress: { done: number; total: number };
  quote: SimulateResponse | null;
  result: { removed: number; revoked: number; sponsored: boolean } | null;
}

const initial: CleanupState = {
  stage: "idle",
  mode: null,
  error: null,
  txHashes: [],
  callsId: null,
  progress: { done: 0, total: 0 },
  quote: null,
  result: null,
};

export interface ExecuteParams {
  operations: CleanupOperation[];
  mode: ExecutionMode;
  /** Returns a session token; used for sponsored mode (SIWE) and history records. */
  ensureSession: () => Promise<string>;
  existingToken: string | null;
}

/**
 * Cleanup execution state machine. Real wallet calls only: no simulated
 * completion, no placeholder hashes.
 */
export function useCleanup() {
  const config = useConfig();
  const { address } = useConnection();
  const [state, setState] = useState<CleanupState>(initial);
  const aborted = useRef(false);

  const patch = (p: Partial<CleanupState>) => setState((s) => ({ ...s, ...p }));

  const reset = useCallback(() => {
    aborted.current = true;
    setState(initial);
  }, []);

  const execute = useCallback(
    async ({ operations, mode, ensureSession, existingToken }: ExecuteParams) => {
      if (!address) throw new Error("wallet not connected");
      aborted.current = false;
      const owner = address as Address;
      const calls = operations.map(encodeOperation);
      const kinds = operations.map((o) => o.kind);
      const recordId = `${Date.now().toString(36)}-${owner.slice(2, 8)}-${Math.random().toString(36).slice(2, 8)}`;

      setState({ ...initial, stage: "preparing", mode, progress: { done: 0, total: mode === "sequential" ? calls.length : 1 } });

      try {
        // --- simulate -------------------------------------------------------
        patch({ stage: "simulating" });
        let token = existingToken;
        const quote = await api.simulate(owner, operations, token);
        patch({ quote });
        const unsafe = quote.simulations.findIndex((s) => s.status !== "success" || s.anomalies.length > 0);
        if (unsafe >= 0) {
          const s = quote.simulations[unsafe]!;
          throw new Error(`Operation ${unsafe + 1} failed simulation: ${s.revertReason ?? s.anomalies[0] ?? "non-standard behaviour"}`);
        }

        // --- sponsor eligibility -------------------------------------------
        let effectiveMode = mode;
        if (mode === "sponsored") {
          patch({ stage: "checking-sponsor" });
          if (!token) {
            patch({ stage: "signing-in" });
            token = await ensureSession();
            patch({ stage: "checking-sponsor" });
          }
          const requote = await api.simulate(owner, operations, token);
          patch({ quote: requote });
          if (!requote.sponsorship.eligible) {
            throw new Error(`Sponsorship denied: ${requote.sponsorship.reason ?? requote.sponsorship.code ?? "not eligible"}`);
          }
        }

        // --- sign & submit ---------------------------------------------------
        patch({ stage: "awaiting-signature", mode: effectiveMode });
        const hashes: Hex[] = [];

        if (effectiveMode === "sponsored" || effectiveMode === "atomic") {
          const capabilities =
            effectiveMode === "sponsored"
              ? {
                  paymasterService: {
                    url: `${window.location.origin}/api/sponsor`,
                    context: { sessionToken: token },
                  },
                }
              : undefined;
          const { id } = await sendCalls(config, {
            account: owner,
            chainId: ACTIVE_CHAIN_ID,
            calls: calls.map((c) => ({ to: c.to, data: c.data, value: 0n })),
            ...(capabilities ? { capabilities } : {}),
          });
          patch({ stage: "submitted", callsId: id });
          if (token) {
            void api.recordCleanup({ id: recordId, wallet: owner, txHash: null, userOpHash: null, kinds, sponsored: effectiveMode === "sponsored", status: "SUBMITTED" }, token).catch(() => {});
          }
          const status = await waitForCallsStatus(config, { id, timeout: 180_000 });
          for (const r of status.receipts ?? []) hashes.push(r.transactionHash);
          patch({ txHashes: hashes });
          if (status.status !== "success") throw new Error(`Batch ${status.status === "failure" ? "reverted" : "did not complete"}`);
        } else {
          for (let i = 0; i < calls.length; i++) {
            if (aborted.current) throw new Error("cancelled");
            const c = calls[i]!;
            patch({ stage: "awaiting-signature", progress: { done: i, total: calls.length } });
            try {
              const hash = await sendTransaction(config, { account: owner, chainId: ACTIVE_CHAIN_ID, to: c.to, data: c.data, value: 0n });
              hashes.push(hash);
              patch({ stage: "submitted", txHashes: [...hashes] });
              const receipt = await waitForTransactionReceipt(config, { hash, timeout: 180_000 });
              if (receipt.status !== "success") throw new Error(`Transaction ${i + 1} reverted on-chain`);
            } catch (e) {
              const raw = e instanceof Error ? e.message : String(e);
              if (/user rejected|denied|rejected the request/i.test(raw)) throw e;
              throw new Error(raw.startsWith(`Transaction ${i + 1}`) ? raw : `Transaction ${i + 1} reverted: ${raw.split("\n")[0]}`);
            }
            patch({ progress: { done: i + 1, total: calls.length } });
          }
          effectiveMode = "sequential";
        }

        // --- done -------------------------------------------------------------
        const removed = kinds.filter((k) => !k.endsWith("REVOKE")).length;
        const revoked = kinds.length - removed;
        if (token) {
          void api
            .recordCleanup({ id: recordId, wallet: owner, txHash: hashes[0] ?? null, userOpHash: null, kinds, sponsored: effectiveMode === "sponsored", status: "CONFIRMED" }, token)
            .catch(() => {});
        }
        rememberLocally({ id: recordId, wallet: owner, txHashes: hashes, kinds, sponsored: effectiveMode === "sponsored", at: Date.now(), status: "CONFIRMED" });
        patch({ stage: "confirmed", txHashes: hashes, result: { removed, revoked, sponsored: effectiveMode === "sponsored" }, progress: { done: calls.length, total: calls.length } });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        const friendly = /user rejected|denied|rejected the request/i.test(raw) ? "Signature rejected in wallet." : raw.split("\n")[0]!.slice(0, 240);
        patch({ stage: "failed", error: friendly });
        throw e;
      }
    },
    [address, config],
  );

  return { state, execute, reset };
}

export interface LocalCleanup {
  id: string;
  wallet: Address;
  txHashes: Hex[];
  kinds: string[];
  sponsored: boolean;
  at: number;
  status: "CONFIRMED" | "FAILED";
}

const LOCAL_KEY = "incinerator.cleanups";

export function rememberLocally(c: LocalCleanup): void {
  try {
    const list = readLocal();
    list.unshift(c);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage unavailable */
  }
}

export function readLocal(): LocalCleanup[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as LocalCleanup[];
  } catch {
    return [];
  }
}
