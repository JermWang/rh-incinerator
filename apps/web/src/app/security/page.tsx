import type { Metadata } from "next";
import { Panel } from "@/components/ui/panel";
import { activeExplorer } from "@/lib/network";

export const metadata: Metadata = { title: "Security" };

const items = [
  ["Non-custodial", "Incinerator never takes custody of assets. Every operation is signed by you and executes from your own account."],
  ["One-way funding", "Sponsor infrastructure has no withdrawal path into the creator treasury. The treasury pushes a bounded allocation into a reserve; the reserve refills the paymaster deposit in capped steps; nothing pulls in the other direction."],
  ["Simulation", "Every sponsored operation is simulated before sponsorship, with pre- and post-state checks. Reverts, balance mismatches, external callbacks, ETH movement or false return values disqualify the asset."],
  ["Policy restrictions", "Only predefined cleanup calls qualify for sponsored gas: burns, transfers to the dead address, and approvals set to zero. No arbitrary calldata, recipients, values, delegatecalls or deployments."],
  ["Rate limits", "Wallet, contract and global spending limits protect the sponsor budget: per-call and per-batch gas ceilings, daily per-wallet limits, cooldowns after failed simulations, automatic denylisting of misbehaving contracts, hourly and daily global caps, and a kill switch."],
  ["Protected assets", "Known financial assets and Stock Tokens are excluded from destructive defaults. Stock Tokens are recognised by their issuer implementation, not by name."],
  ["Open verification", "Relevant deployed contracts and addresses link to the block explorer. The transparency page reports only values that can be verified on-chain or from the sponsor ledger."],
];

const invariants = [
  "The sponsor cannot access creator treasury funds.",
  "A sponsored operation cannot transfer native ETH from the sponsor to an arbitrary recipient.",
  "A sponsored ERC-20 disposal cannot choose an arbitrary recipient.",
  "Approval cleanup can only reduce or revoke authority.",
  "Global sponsor expenditure cannot exceed configured limits.",
  "Unsupported calldata cannot receive sponsorship.",
  "A failure in frontend security alone cannot expose treasury signing keys.",
  "Irreversible asset actions require explicit user authorisation.",
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-[840px] px-4 py-14 md:px-6 md:py-20">
      <div className="label-xs">Security</div>
      <h1 className="mt-3 text-[32px] font-medium tracking-[-0.02em] md:text-[40px]">Fail closed. Bound the blast radius.</h1>
      <p className="mt-3 max-w-[600px] text-[14px] leading-relaxed text-fg-2">
        Sponsorship requests are treated as hostile input. The worst case for a compromised sponsor signer is the paymaster&apos;s current deposit plus what the reserve may refill within its daily cap. This does not make the application impossible to exploit; it makes the exposure small and measurable.
      </p>
      <div className="mt-10 grid gap-3 md:grid-cols-2">
        {items.map(([title, body]) => (
          <Panel key={title} level={1} radius="lg" className="p-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-fg">{title}</div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{body}</p>
          </Panel>
        ))}
      </div>
      <h2 className="mt-14 text-[20px] font-medium tracking-[-0.01em]">Enforced invariants</h2>
      <ol className="mt-4 divide-y divide-hairline rounded-[16px] border border-hairline bg-glass-1">
        {invariants.map((inv, i) => (
          <li key={inv} className="flex gap-4 px-5 py-3.5 text-[13.5px] text-fg-2">
            <span className="tnum shrink-0 text-fg-3">I{i + 1}</span>
            <span>{inv}</span>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[12.5px] text-fg-3">
        Contracts and tests live in the repository. Deployed addresses appear on the transparency page with links to{" "}
        <a href={activeExplorer} className="underline underline-offset-2" target="_blank" rel="noreferrer">
          the explorer
        </a>
        .
      </p>
    </div>
  );
}
