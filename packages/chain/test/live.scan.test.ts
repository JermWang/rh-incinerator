import { describe, expect, it } from "vitest";
import { createChainClient } from "../src/client";
import { ROBINHOOD_CHAIN_TESTNET_ID } from "../src/constants";
import { createIndexer } from "../src/indexers";
import { scanWallet } from "../src/scanner";

/** Live scan against the public testnet. Skipped unless LIVE=1. */
const live = process.env.LIVE === "1";
const OWNER = "0xE9b386DE7d2ED5d49A511fC8C1c43C69e7E346BA" as const;

describe.skipIf(!live)("live scanner", () => {
  it("scans a real wallet through the Blockscout indexer with on-chain truth", async () => {
    const client = createChainClient(ROBINHOOD_CHAIN_TESTNET_ID);
    const indexer = createIndexer(ROBINHOOD_CHAIN_TESTNET_ID, client, {});
    const started = Date.now();
    const r = await scanWallet({ chainId: ROBINHOOD_CHAIN_TESTNET_ID, client, indexer, maxGasPerCall: 250_000n, log: (m, meta) => console.log(m, meta) }, OWNER);
    const mechanisms: Record<string, number> = {};
    for (const n of r.nfts) mechanisms[n.mechanism] = (mechanisms[n.mechanism] ?? 0) + 1;
    console.log({ ms: Date.now() - started, tokens: r.tokens.length, nfts: r.nfts.length, approvals: r.approvals.length, errors: r.errors, mechanisms, sampleToken: r.tokens[0] });
    expect(r.errors).toEqual([]);
    expect(r.partial).toEqual({ tokens: true, nfts: true, approvals: true });
    expect(r.nfts.length).toBeGreaterThan(0);
    expect(r.nfts.every((n) => n.mechanism !== "UNKNOWN")).toBe(true);
    const weth = r.tokens.find((t) => t.symbol === "WETH");
    if (weth) expect(weth.classification).toBe("PROTECTED");
  }, 120_000);
});
