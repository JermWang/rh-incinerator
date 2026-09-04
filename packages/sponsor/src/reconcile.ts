import { createPublicClient, http, type PublicClient } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import { chainById, type SupportedChainId } from "@incinerator/chain";
import { alchemyRpcUrl } from "./alchemy";
import type { SponsorStore } from "./store";

/**
 * Budget reconciliation. Sponsored operations are reserved at their worst-case
 * cost when signed; this job replaces reservations with actual cost from the
 * UserOperation receipt, marks failures, and expires stale reservations so the
 * transparency figures and budgets stay exact.
 */

export interface ReconcileDeps {
  chainId: SupportedChainId;
  client: PublicClient;
  store: SponsorStore;
  alchemyApiKey: string | undefined;
  now: () => number;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface ReconcileReport {
  checked: number;
  confirmed: number;
  failed: number;
  expired: number;
  pending: number;
  bundler: boolean;
}

const STALE_MS = 30 * 60 * 1000;

export async function reconcileSponsoredOperations(deps: ReconcileDeps, limit = 100): Promise<ReconcileReport> {
  const now = deps.now();
  const report: ReconcileReport = { checked: 0, confirmed: 0, failed: 0, expired: 0, pending: 0, bundler: Boolean(deps.alchemyApiKey) };

  if (deps.alchemyApiKey) {
    const url = alchemyRpcUrl(deps.alchemyApiKey, deps.chainId);
    const bundler = createBundlerClient({ client: createPublicClient({ chain: chainById(deps.chainId), transport: http(url) }), transport: http(url) });
    const ops = await deps.store.listUnsettledSponsoredOperations(limit);
    for (const op of ops) {
      report.checked++;
      try {
        const receipt = await bundler.getUserOperationReceipt({ hash: op.userOpHash! });
        await deps.store.updateSponsoredOperation(op.id, {
          txHash: receipt.receipt.transactionHash,
          actualCostWei: receipt.actualGasCost,
          status: receipt.success ? "CONFIRMED" : "FAILED",
          confirmedAt: now,
        });
        receipt.success ? report.confirmed++ : report.failed++;
      } catch {
        report.pending++;
      }
    }
  }
  report.expired = await deps.store.expireStaleReservations(now - STALE_MS);
  deps.log?.("reconcile", { ...report });
  return report;
}
