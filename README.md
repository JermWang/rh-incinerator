# Incinerator

**Clean your wallet. Keep your ETH.**

Burn unwanted assets and revoke stale approvals on Robinhood Chain without paying gas when sponsorship is available.

Incinerator is an independent application built for Robinhood Chain and is not affiliated with or endorsed by Robinhood.

## What it does

1. Connect a wallet and switch to Robinhood Chain (testnet by default).
2. Scan ERC-20 balances, NFTs and live approvals. Stock Tokens, stablecoins, wrapped assets and protocol positions are protected by default; nothing is pre-selected.
3. Every burn, dead-address transfer and revocation is simulated on-chain (`eth_simulateV1`) with pre/post state checks. Non-standard tokens are refused.
4. Review each operation, the estimated gas, what you pay and the gas source. Confirm explicitly.
5. If the wallet supports an ERC-7677 paymaster (EIP-7702 / ERC-4337 via EIP-5792 `paymasterService`) and the policy engine approves, the creator-fee sponsor pays gas. Otherwise the wallet pays standard fees. You always sign.

## Repository

```
apps/web                Next.js 16 app: UI, route handlers (/api/*), wallet layer (wagmi 3 / viem 2)
brand-source            Full-resolution mascot and logo masters (not served)
scripts/build-brand.mjs  Produces the optimized brand assets the app ships
packages/chain          Chain constants, ABIs, Blockscout indexer client, scanner, classification, simulation engine
packages/sponsor        Sponsor policy engine: calldata decoding, allowlist, limits, SIWE sessions, ERC-7677 paymaster, stores, admin
packages/contracts      Foundry: FeeRouter, SponsorReserve, IncineratorPaymaster (+ unit, fuzz, invariant tests)
docs/                   Architecture, security model, deployment runbook
```

## Surface

Three pages, on purpose.

| Route | What it is |
| --- | --- |
| `/` | Wordmark, mascot, one call to action, three steps. |
| `/app` | The cleanup tool: tokens, NFTs, approvals, review, sign. |
| `/transparency` | Live sponsor figures plus the security model. |

`/activity` (per-wallet history) and `/admin` (operator surface) exist but are
not in the header. The old `/how-it-works`, `/security` and `/sponsor` pages
redirect here.

## Quick start

```bash
pnpm install
cp .env.example .env            # optional: leave empty for read-only testnet mode
pnpm dev                        # http://localhost:3000
pnpm brand:build                # regenerate brand assets after editing brand-source/
```

Without credentials the app runs fully against the public Robinhood Chain testnet RPC and explorer: scanning, simulation and user-paid cleanups work; sponsorship reports `NOT_CONFIGURED`.

## Tests

```bash
pnpm test                       # vitest: chain + sponsor packages (policy engine, decoders, sessions, signer fixture)
pnpm test:contracts             # forge: unit, fuzz and invariant tests
pnpm test:e2e                   # playwright: mock wallet + mocked RPC/API, desktop and mobile
pnpm typecheck
```

## Sponsorship backends

| `SPONSOR_BACKEND` | Behaviour |
| --- | --- |
| unset | Sponsorship unavailable. Users pay gas. |
| `self` | Signs UserOperations for the deployed `IncineratorPaymaster` (VerifyingPaymaster v0.7) with `SPONSOR_SIGNER_PRIVATE_KEY`. Fully on-chain budget isolation via `SponsorReserve`. |
| `alchemy` | Forwards policy-approved requests to Alchemy Gas Manager (`ALCHEMY_GAS_POLICY_ID`). |

Both backends run the same hostile-input policy pipeline first (chain, session, decode, allowlist, ownership truth, simulation, gas ceilings, wallet/contract/global limits).

## Operations

```bash
ADMIN_TOKEN=... pnpm admin status|pause|resume|limits KEY=VALUE|denylist <addr> [reason] [ttlHours]|undeny <addr>|spend|failures|refills
KEEPER_PRIVATE_KEY=... pnpm refill    # push reserve ETH into the paymaster deposit within contract caps
CRON_SECRET=... pnpm reconcile        # settle sponsored budgets against UserOperation receipts
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/WALLETS.md](docs/WALLETS.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
