# Security model

A request for free gas is hostile input. Every layer fails closed.

## Invariants and where they are enforced

| # | Invariant | Enforcement |
| --- | --- | --- |
| I1 | The sponsor cannot access creator treasury funds. | Treasury is an external cold wallet. `SponsorReserve` and `FeeRouter` only ever *send* to it; no contract in this repo holds a treasury key or allowance. Invariant test `invariant_onlyTwoExits`. |
| I2 | A sponsored operation cannot transfer native ETH from the sponsor to an arbitrary recipient. | `policy.ts` rejects any inner call with `value != 0`; simulation flags ETH movement (`traceTransfers`). Test: `rejects ETH value`. |
| I3 | A sponsored ERC-20 disposal cannot choose an arbitrary recipient. | `transfer` / `transferFrom` / `safeTransferFrom` recipients must equal `0x…dEaD`; encoder hard-codes it. Tests: `ARBITRARY_RECIPIENT`. |
| I4 | Approval cleanup can only reduce/revoke authority. | `approve(spender, 0)`, `approve(0x0, tokenId)`, `setApprovalForAll(op, false)` only. Tests: `APPROVAL_NOT_REVOKE`. |
| I5 | Global sponsor expenditure cannot exceed configured limits. | Reserved worst-case cost counted against hourly/daily caps before signing; stale reservations expire; per-op cost ceiling. Tests: `BUDGET_EXHAUSTED`, `COST_CEILING`. On-chain: paymaster deposit ≤ `maxHotBalance` (invariant test). |
| I6 | Unsupported calldata cannot receive sponsorship. | Unknown account wrappers and unknown selectors are denied; delegatecall / try modes denied. Tests: `UNSUPPORTED_ACCOUNT`, `UNSUPPORTED_CALL`. |
| I7 | A failure in frontend security alone cannot expose treasury signing keys. | No treasury key exists in the app. The only server key is the paymaster signer (bounded by the EntryPoint deposit). |
| I8 | Irreversible asset actions require explicit user authorisation. | Nothing pre-selected; protected assets need per-asset unlock; unchecked-by-default confirmation; the user signs every batch. |

## Threats considered

- **Gas griefing tokens**: per-call gas ceiling (250k), batch ceiling, contract failure tracking with temporary denylist, suspicious average-gas denylist, wallet cooldown after repeated failed simulations.
- **Fee inflation**: `maxFeePerGas` capped absolutely (1 gwei) and relative to the live gas price (8×); all wallet-supplied gas fields bounded.
- **Forged wallet**: ERC-7677 requests must carry a SIWE session whose address equals `UserOperation.sender` and whose chain equals the deployment chain.
- **Replay**: SIWE nonces are single-use with expiry; paymaster signatures carry `validUntil` (5 min) and bind every gas field, callData and chain id (tamper test in Foundry).
- **Lying tokens**: pre/post balance reads inside the same simulated block; `transfer()` return value checked; `Transfer` event to dead required.
- **Hostile callbacks**: any log from a contract other than the token disqualifies sponsorship.
- **Self-targeting**: calls to the paymaster, reserve, router, treasury, EntryPoints, Multicall3 or the sender itself are refused.
- **Budget drain via quotes**: `/api/simulate` runs the same pipeline but never signs or reserves; limits apply only on `pm_getPaymasterData`.
- **Admin surface**: bearer `ADMIN_TOKEN` with constant-time compare; rate limited; cannot touch treasury; policy overrides clamped to hard bounds.

## Bounded loss statement

If the sponsor signer, app server or relayer is fully compromised, an attacker can at most spend the paymaster's current EntryPoint deposit plus whatever the `SponsorReserve` will refill within its daily cap and interval. Treasury funds, and reserve funds beyond the daily cap, are unreachable. This bounds exposure; it does not make the application impossible to exploit.

## Known limitations

- `debug_traceCall` is unavailable on the public RPC; simulation relies on `eth_simulateV1` logs and state reads, not full call traces. Alchemy's Debug API can be added server-side when credentials exist.
- The mainnet Blockscout instance is behind a bot challenge for non-browser clients; mainnet scanning may require Alchemy Data APIs. The `BlockscoutClient` interface is the seam for that.
- Which wallets expose `paymasterService` on Robinhood Chain is wallet-vendor dependent. Detection is automatic and the fallback is always a real, user-paid transaction.
