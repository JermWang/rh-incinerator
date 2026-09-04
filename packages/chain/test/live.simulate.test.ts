import { describe, expect, it } from "vitest";
import { createChainClient } from "../src/client";
import { ROBINHOOD_CHAIN_TESTNET_ID } from "../src/constants";
import { simulateOperations } from "../src/simulate";
import type { CleanupOperation } from "../src/operations";

/**
 * Live integration test against the public Robinhood Chain testnet RPC.
 * Skipped unless LIVE=1. Uses a wallet that holds "ONCHAINGM ROBINHOOD BADGE" NFTs.
 */
const live = process.env.LIVE === "1";
const OWNER = "0xE9b386DE7d2ED5d49A511fC8C1c43C69e7E346BA" as const;
const BADGE = "0x016ef0F56D7344d0E55f6BC2A20618E02DAE8BE0" as const;

describe.skipIf(!live)("live eth_simulateV1", () => {
  const client = createChainClient(ROBINHOOD_CHAIN_TESTNET_ID);

  it("simulates a single ERC-721 dead transfer", async () => {
    const ops: CleanupOperation[] = [{ kind: "ERC721_DEAD", token: BADGE, owner: OWNER, tokenId: "6188538" }];
    const r = await simulateOperations(client, ops, { maxGasPerCall: 250_000n });
    console.log(JSON.stringify(r, null, 1));
    expect(r).toHaveLength(1);
  });

  it("simulates a 40-op batch (probe chunk size)", async () => {
    const ids = ["6188538", "6181089", "6162244", "6147767", "6132258", "6120105"];
    const ops: CleanupOperation[] = Array.from({ length: 40 }, (_, i) => ({ kind: "ERC721_DEAD", token: BADGE, owner: OWNER, tokenId: ids[i % ids.length]! }));
    try {
      const r = await simulateOperations(client, ops, { maxGasPerCall: 250_000n });
      console.log("batch ok", r.length, r[0]);
    } catch (e) {
      console.log("batch error:", e instanceof Error ? e.message.slice(0, 600) : e);
      throw e;
    }
  });
});
