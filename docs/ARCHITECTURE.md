# Architecture

## Network facts (verified 2026-09-03)

| | Mainnet | Testnet |
| --- | --- | --- |
| Chain id | 4663 | 46630 |
| RPC | https://rpc.mainnet.chain.robinhood.com | https://rpc.testnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com | https://explorer.testnet.chain.robinhood.com |
| Node | Nitro v3.11 (Arbitrum Orbit), ArbOS 116 | same |
| `eth_simulateV1` | yes | yes |
| `debug_traceCall` (public RPC) | no | no |
| EIP-7702 type-4 tx | recognised by node | recognised by node |
| EntryPoint v0.6 / v0.7 / v0.8 | deployed | deployed |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | same |
| Alchemy slug | `robinhood-mainnet` | `robinhood-testnet` |

Robinhood Chain Stock Tokens on testnet are `BeaconProxy` contracts whose implementation is named `Stock` (`0xBd14156E05c6AF28ad39aA53a2AB8eB9CDf657DA`). The classifier protects any token with that implementation fingerprint.

Pons V2 creator fees are claim-based (`PonsV2FeeEscrow`), i.e. the creator pulls fees to its fee wallet. Deployment Option B (treasury sweep into the `SponsorReserve`) is therefore the default; the `FeeRouter` supports Option A where a contract recipient is possible.

## Data flow

```
browser ── wagmi/viem ──► public Robinhood Chain RPC        (wallet actions, block/gas reads)
browser ── fetch ───────► /api/scan       ──► Blockscout index + RPC multicall (truth) + eth_simulateV1 (mechanism probes)
browser ── fetch ───────► /api/simulate   ──► reconstruct calls from typed ops, simulate, quote gas, check sponsorship
wallet  ── ERC-7677 ────► /api/sponsor    ──► policy engine ──► sign (self) | Alchemy Gas Manager (alchemy)
browser ── fetch ───────► /api/session/*  ──► SIWE nonce + verify ──► HMAC session token
```

### Indexers (`packages/chain/src/indexers`)
`createIndexer()` picks discovery: **Alchemy** (Token API, NFT API v3, bisecting `eth_getLogs`) when `ALCHEMY_API_KEY` is set, otherwise **Blockscout** (`/api/v2/addresses/{a}/tokens`, `/nft`, legacy indexed `logs` with block-range pagination). Explorer metadata (verification, reputation, names) is layered in best-effort and proxy implementations are always resolved on-chain (ERC-1967 beacon slot), so Stock Token protection never depends on an explorer. The mainnet explorer requires a browser user-agent, which the client sends; `BLOCKSCOUT_API_KEY` raises its rate limits.

### Scanner (`packages/chain/src/scanner.ts`)
- Discovery through the indexer above.
- Truth: balances, `ownerOf`, `allowance`, `getApproved`, `isApprovedForAll` re-read via Multicall3.
- Mechanism probing: each token is simulated with `burn(amount)` then `transfer(DEAD, amount)`; NFTs with `burn(id)` / `transferFrom`; ERC-1155 with `burn` / `safeTransferFrom`. First clean pass wins; anything else is `UNSUPPORTED`.
- Classification (`classify.ts`): PROTECTED → SUSPICIOUS → HIDDEN → VALUABLE → VERIFIED/KNOWN/UNVERIFIED. Never labels anything a "scam".

### Simulation engine (`packages/chain/src/simulate.ts`)
One `eth_simulateV1` block with `[pre-read, op, post-read]` per operation, `validation: false`, `traceTransfers: true`. Anomalies: revert, gas above ceiling, events from other contracts, ETH movement, balance delta ≠ amount, `transfer()` returning false, missing `Transfer` to dead, approvals not cleared.

Public gateway limits (measured 2026-09-03): requests with more than ~30 inner calls, and bursts of large simulations, are refused with a JSON-RPC `429 Too Many Requests`. Simulations are therefore chunked to 10 operations per request, probes run sequentially with exponential backoff on 429, HTTP JSON-RPC batching is disabled, and NFT mechanisms are probed once per collection. Duplicate operations on the same asset are rejected by the policy engine so chunking cannot be used to double-spend a balance across chunks.

### Sponsor policy (`packages/sponsor`)
`paymaster.ts` implements the 17-step checklist:
chain → EntryPoint v0.7 → session/sender match → sponsor state (pause, balance, budget) → decode account callData (`execute`, `executeBatch` ×3, ERC-7579/7821 `execute(bytes32,bytes)`, Safe `executeUserOp`; delegatecall/try modes rejected) → allowlist (`policy.ts`) → ownership truth + `burn(uint256)` disambiguation → simulation → gas ceilings → wallet/contract/global limits → sign or forward.

Stores: `MemoryStore` (default) or `PostgresStore` (`DATABASE_URL`, schema in `sql/001_init.sql`). API rate limits, SIWE nonces, settings and budgets all go through the store, so a Postgres-backed deployment is safe to scale horizontally.

Backend selection: explicit `SPONSOR_BACKEND`, else `self` when a signer key exists, else `alchemy` when an Alchemy key + Gas Manager policy exist. With an Alchemy key the simulation chunk rises from 10 to 25 operations per request.

### Reconciliation (`packages/sponsor/src/reconcile.ts`)
Reservations are replaced with actual cost from `eth_getUserOperationReceipt` (needs the Alchemy bundler), failures are marked, and reservations older than 30 minutes expire. Exposed at `GET /api/cron/reconcile` (bearer `CRON_SECRET`) and `pnpm reconcile`; schedule it every few minutes.

### Execution paths (browser, `apps/web/src/hooks/use-cleanup.ts`)
| Wallet capability | Path | Gas |
| --- | --- | --- |
| `paymasterService` supported + sponsor active + policy approves | `wallet_sendCalls` with `paymasterService { url, context.sessionToken }` | sponsor |
| `atomic` supported | `wallet_sendCalls` without paymaster | user |
| legacy EOA | one `eth_sendTransaction` per operation | user |

Custody never changes. The app never signs on the user's behalf and never requests 7702 authorisations itself.

### Contracts (`packages/contracts`)
- `FeeRouter`: receive → split by bps (sponsor share ≤ 50%) → immutable treasury + reserve. Pausable distribution; `receive()` never reverts. Optional immutable Pons fee escrow: `claimFees()` pulls the router's own credited balance (`IPonsV2FeeEscrow.claim()`), which is the only way Option A works because Pons V2 fees are claim-based.
- `SponsorReserve`: `refill()` deposits into the paymaster's EntryPoint balance up to target, never above max hot balance, bounded per day and by interval. Only other exit: `returnToTreasury()`.
- `IncineratorPaymaster`: unmodified eth-infinitism `VerifyingPaymaster` (v0.7). Hash preimage pinned by a cross-language fixture test.
