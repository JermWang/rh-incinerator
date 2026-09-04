# @incinerator/contracts

Sponsor infrastructure for Incinerator on Robinhood Chain.

| Contract | Role |
| --- | --- |
| `FeeRouter` | Optional (Option A). Receives creator fees, splits by basis points into the cold treasury and the `SponsorReserve`. No arbitrary calls. |
| `SponsorReserve` | Holds the sponsor allocation. `refill()` moves ETH one way into the paymaster's EntryPoint deposit, bounded by low-water mark, target, max hot balance, daily cap and interval. Only other exit: `returnToTreasury()` to the immutable treasury. |
| `IncineratorPaymaster` | eth-infinitism `VerifyingPaymaster` (EntryPoint v0.7), unchanged. The policy server signs validated UserOperations. |

## Isolation model

```
Pons creator fees -> Treasury (cold) --push--> SponsorReserve --refill (capped)--> EntryPoint deposit of paymaster
```

- The paymaster, relayer and app never hold a treasury key or allowance.
- Compromise of the signer key exposes at most the current EntryPoint deposit (bounded by `maxHotBalance`) plus whatever the reserve can refill within the daily cap.
- No `delegatecall`, no `multicall`, no arbitrary `call()`, no token custody.

## Setup

`lib/` is git-ignored. Install forge-std once after cloning:

```bash
forge install foundry-rs/forge-std --no-git
```

## Commands

```bash
pnpm --filter @incinerator/contracts test          # unit + fuzz + invariant tests
forge test --match-test test_hashFixture -vv        # prints the paymaster hash fixture used by the TS signer test
```

## Deploy (testnet first)

```bash
export DEPLOYER_PRIVATE_KEY=0x...   # gas payer only
export TREASURY=0x...              # cold treasury (multisig / hardware wallet)
export OWNER=0x...                 # ops multisig; must call acceptOwnership() on SponsorReserve (and FeeRouter)
export SPONSOR_SIGNER=0x...        # address of SPONSOR_SIGNER_PRIVATE_KEY used by the app
export KEEPER=0x...                # refill keeper
export INITIAL_DEPOSIT_WEI=5000000000000000   # optional, 0.005 ETH
forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
```

Output is written to `deployments/<chainId>.json`; copy the addresses into `packages/chain/src/deployments.ts`.

Do not deploy to mainnet until testnet behaviour is verified end to end.
