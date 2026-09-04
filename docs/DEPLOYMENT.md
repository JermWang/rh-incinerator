# Deployment runbook

**Testnet first. Do not deploy mainnet until testnet behaviour is verified end to end.**

## 0. Keys and roles

| Role | Where it lives | Access |
| --- | --- | --- |
| Creator fee treasury | Hardware wallet / multisig. Never in this repo. | Receives fees; pushes ETH to `SponsorReserve`. |
| Operations owner | Multisig | Owns `SponsorReserve`, `FeeRouter`, `IncineratorPaymaster` (pause, params, return to treasury, deposit withdrawal). |
| Sponsor signer | `SPONSOR_SIGNER_PRIVATE_KEY` on the app server | Signs validated UserOperations only. |
| Refill keeper | `KEEPER_PRIVATE_KEY` on a cron host | Can only trigger `refill()`. |
| Deployer | one-off | Pays deployment gas. |

## 1. Deploy contracts (testnet)

```bash
cd packages/contracts
forge test
export DEPLOYER_PRIVATE_KEY=0x… TREASURY=0x… OWNER=0x… SPONSOR_SIGNER=0x… KEEPER=0x…
export INITIAL_DEPOSIT_WEI=5000000000000000        # 0.005 ETH initial paymaster deposit (optional)
export DEPLOY_FEE_ROUTER=true                       # Option A only
export PONS_FEE_ESCROW=0x…                          # Option A only: Pons V2 fee escrow; router must be the creator fee recipient
forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
```

Then:
1. From `OWNER`, call `acceptOwnership()` on `SponsorReserve` (and `FeeRouter` if deployed).
2. Copy `deployments/46630.json` addresses into `packages/chain/src/deployments.ts` (`paymaster`, `sponsorReserve`, `feeRouter`, `treasury`, `deployedAtBlock`).
3. Push an initial allocation from the treasury to the `SponsorReserve` address (plain ETH transfer).
4. Run `KEEPER_PRIVATE_KEY=… pnpm refill` once and confirm the paymaster deposit on the transparency page.

## 2. Configure the app

```
NEXT_PUBLIC_INCINERATOR_NETWORK=testnet
SPONSOR_BACKEND=self
SPONSOR_SIGNER_PRIVATE_KEY=0x…
SERVER_SIGNING_SECRET=<32+ random bytes>
ADMIN_TOKEN=<random>
ALCHEMY_API_KEY=…            # recommended: Alchemy indexer, higher simulation limits, bundler receipts
ALCHEMY_GAS_POLICY_ID=…      # only for SPONSOR_BACKEND=alchemy
BLOCKSCOUT_API_KEY=…         # optional: explorer rate limits
CRON_SECRET=…                # bearer for GET /api/cron/reconcile
DATABASE_URL=…               # optional: Postgres for multi-instance deployments
```

`pnpm build && pnpm start`.

## 3. Verify end to end on testnet

1. Connect a wallet holding testnet junk tokens; confirm scan, classification (Stock Tokens PROTECTED), mechanism labels.
2. Select an unverified token → Review → confirm the simulation output and gas quote.
3. Standard path: sign; confirm explorer link and `CLEANUP COMPLETE`.
4. Sponsored path (wallet with `paymasterService`): sign in (SIWE), confirm `You pay 0 ETH`, sign; verify the paymaster deposit decreased and `/api/transparency` reports the op.
5. Negative tests: a token that reverts on transfer shows `UNSUPPORTED`; `pnpm admin pause` makes the badge read PAUSED and `/api/sponsor` deny with `SPONSOR_PAUSED`.

## 4. Keeper and reconciliation

Run `pnpm refill` on a schedule (e.g. every 10 minutes). It is idempotent and exits when nothing is refillable.

Run `pnpm reconcile` (or hit `GET /api/cron/reconcile` with the `CRON_SECRET` bearer) every 2–5 minutes so sponsored budgets settle to actual cost.

For Option A, call `FeeRouter.claimFees()` then `distribute()` periodically (both permissionless).

## 5. Mainnet

Repeat 1–4 with `NEXT_PUBLIC_INCINERATOR_NETWORK=mainnet`, confirm the mainnet Stock Token implementation address in `packages/chain/src/registry.ts`, and confirm mainnet Blockscout access from the server (see docs/SECURITY.md limitations).
