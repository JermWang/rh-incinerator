# Wallet support for sponsored gas

Sponsored ("free") cleanups require the user's wallet to expose the EIP-5792
`paymasterService` capability for Robinhood Chain (chain id 46630 / 4663), so
that `wallet_sendCalls` routes the batch through Incinerator's ERC-7677
paymaster. Detection is automatic (`wallet_getCapabilities`) and the fallback
is always a real, user-paid transaction. Custody never changes.

## Status by wallet (researched 2026-09-03, must be re-verified on the live chain)

| Wallet | Atomic batch / EIP-7702 | `paymasterService` | Notes |
| --- | --- | --- | --- |
| MetaMask | Only on its published chain list (Ethereum, Sepolia, Gnosis, BNB, OP, Base, Polygon, Arbitrum One/Nova/Sepolia, Unichain, Berachain). Robinhood Chain is **not** listed. | Not documented | MetaMask users get the standard path until MetaMask adds the chain. If the EOA was upgraded to a third-party smart account, MetaMask disables batching entirely. |
| Coinbase Smart Wallet / Base Account | Yes (ERC-4337 smart wallet) | Yes, where the chain is supported by the wallet | Chain support for Robinhood Chain unverified. |
| Safe (Safe{Wallet} + 4337 module) | Yes via Safe4337Module (deployed on Robinhood Chain: `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226`) | Depends on the connecting app / SDK | The policy engine already decodes `executeUserOp` for Safe. |
| Ambire, Rabby, others | Varies | Varies | Detect at runtime. |
| Embedded wallets (Alchemy Account Kit, ZeroDev, Privy, Dynamic) | Yes | Yes (they own the account) | Listed by Robinhood Chain docs as supported AA providers. Adopting one changes the custody model (new smart account per user) and is a product decision. |

## What this means for the product

- Today the "FREE BURN" path is reachable only from wallets that already
  support paymaster-backed batching on Robinhood Chain. The UI never promises
  free gas before the capability is detected and the policy engine has
  approved the batch.
- To guarantee the headline experience for MetaMask users, the next step is an
  optional embedded smart account (Alchemy Account Kit is the natural fit given
  the Gas Manager backend), offered as an explicit choice rather than a silent
  upgrade.

## Verifying a wallet against the live chain

1. Connect on `/app` with the wallet on Robinhood Chain testnet.
2. The capability pill in the dashboard header reads "Free burn · gas sponsored" (paymaster + sponsor active), "Standard burn · batched" (atomic only) or "Standard burn" (legacy).
3. Record the result in the table above.
