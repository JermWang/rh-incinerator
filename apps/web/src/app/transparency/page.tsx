import type { Metadata } from "next";
import { Mascot } from "@/components/brand";
import { TransparencyView } from "@/components/transparency/transparency-view";

export const metadata: Metadata = {
  title: "Transparency",
  description: "Live sponsor pool figures and the security model behind creator-funded gas on Robinhood Chain.",
};

const GUARANTEES: [string, string][] = [
  ["Non-custodial", "Incinerator never holds your assets or keys. Every action executes from your own account, signed by you."],
  ["One-way funding", "The treasury pushes a bounded allocation to the sponsor. Nothing pulls the other way, so a compromised sponsor cannot reach creator funds."],
  ["Simulated first", "Every operation runs against the chain before it is offered. Tokens that lie about balances, move ETH, or call out to other contracts are refused."],
  ["Only cleanup calls", "Burns, transfers to the dead address, and approvals set to zero. No arbitrary calldata, recipients, values or delegatecalls."],
  ["Hard limits", "Per-call and per-batch gas ceilings, daily per-wallet caps, automatic denylisting of misbehaving tokens, global spend caps, and a kill switch."],
  ["Protected by default", "Stock Tokens, stablecoins, wrapped assets and protocol positions are never pre-selected and need an explicit unlock."],
];

export default function TransparencyPage() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-12 md:px-6 md:py-16">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="label-xs">Transparency</div>
          <h1 className="mt-3 text-[30px] font-medium tracking-[-0.025em] md:text-[38px]">Where the gas comes from.</h1>
          <p className="mt-3 max-w-[540px] text-[14px] leading-relaxed text-fg-2">
            Read-only figures from the chain and the sponsor ledger. Nothing here is estimated. Values that cannot be sourced are shown as unavailable.
          </p>
        </div>
        <Mascot art="head" size={110} className="hidden shrink-0 opacity-90 md:block" />
      </div>

      <div className="mt-9">
        <TransparencyView />
      </div>

      <section className="mt-12">
        <h2 className="text-[20px] font-medium tracking-[-0.01em]">What protects you</h2>
        <p className="mt-2 max-w-[600px] text-[13.5px] leading-relaxed text-fg-2">
          A request for free gas is treated as hostile input. The worst case for a fully compromised sponsor is the paymaster&apos;s current deposit plus one day of capped refills. That bounds the exposure; it does not make the system impossible to exploit.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {GUARANTEES.map(([title, body]) => (
            <div key={title} className="rounded-[14px] border border-hairline bg-glass-1 p-5">
              <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-fg">{title}</div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
