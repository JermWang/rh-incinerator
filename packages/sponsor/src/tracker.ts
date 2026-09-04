import { createPublicClient, http, isHash, type Hex, type PublicClient } from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import { chainById, explorerTxUrl, type SupportedChainId } from "@incinerator/chain";
import { alchemyRpcUrl } from "./alchemy";
import type { SponsorStore } from "./store";

/**
 * Transaction / UserOperation status tracking with cost reconciliation.
 * Reserved budget is replaced by actual cost once a receipt is available.
 */

export interface TrackedStatus {
  hash: Hex;
  kind: "transaction" | "userOperation" | "unknown";
  status: "pending" | "confirmed" | "failed";
  txHash: Hex | null;
  blockNumber: number | null;
  gasUsed: string | null;
  actualCostWei: string | null;
  explorerUrl: string | null;
}

export interface TrackerDeps {
  chainId: SupportedChainId;
  client: PublicClient;
  store: SponsorStore;
  alchemyApiKey: string | undefined;
  now: () => number;
}

export async function trackHash(deps: TrackerDeps, hash: string): Promise<TrackedStatus> {
  if (!isHash(hash)) throw new Error("invalid hash");
  const h = hash as Hex;

  // 1. Plain transaction?
  try {
    const receipt = await deps.client.getTransactionReceipt({ hash: h });
    const cost = receipt.gasUsed * receipt.effectiveGasPrice;
    return {
      hash: h,
      kind: "transaction",
      status: receipt.status === "success" ? "confirmed" : "failed",
      txHash: h,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: receipt.gasUsed.toString(),
      actualCostWei: cost.toString(),
      explorerUrl: explorerTxUrl(deps.chainId, h),
    };
  } catch {
    /* not a mined transaction (or not a tx at all) */
  }

  // 2. UserOperation via bundler (needs Alchemy)
  if (deps.alchemyApiKey) {
    try {
      const bundler = createBundlerClient({
        client: createPublicClient({ chain: chainById(deps.chainId), transport: http(alchemyRpcUrl(deps.alchemyApiKey, deps.chainId)) }),
        transport: http(alchemyRpcUrl(deps.alchemyApiKey, deps.chainId)),
      });
      const receipt = await bundler.getUserOperationReceipt({ hash: h });
      const sponsored = await deps.store.findSponsoredByUserOpHash(h);
      if (sponsored && sponsored.status !== "CONFIRMED" && sponsored.status !== "FAILED") {
        await deps.store.updateSponsoredOperation(sponsored.id, {
          txHash: receipt.receipt.transactionHash,
          actualCostWei: receipt.actualGasCost,
          status: receipt.success ? "CONFIRMED" : "FAILED",
          confirmedAt: deps.now(),
        });
      }
      return {
        hash: h,
        kind: "userOperation",
        status: receipt.success ? "confirmed" : "failed",
        txHash: receipt.receipt.transactionHash,
        blockNumber: Number(receipt.receipt.blockNumber),
        gasUsed: receipt.actualGasUsed.toString(),
        actualCostWei: receipt.actualGasCost.toString(),
        explorerUrl: explorerTxUrl(deps.chainId, receipt.receipt.transactionHash),
      };
    } catch {
      /* pending or unknown */
    }
  }

  // 3. Pending transaction?
  try {
    const tx = await deps.client.getTransaction({ hash: h });
    if (tx) {
      return { hash: h, kind: "transaction", status: "pending", txHash: h, blockNumber: null, gasUsed: null, actualCostWei: null, explorerUrl: explorerTxUrl(deps.chainId, h) };
    }
  } catch {
    /* unknown */
  }
  return { hash: h, kind: "unknown", status: "pending", txHash: null, blockNumber: null, gasUsed: null, actualCostWei: null, explorerUrl: null };
}
