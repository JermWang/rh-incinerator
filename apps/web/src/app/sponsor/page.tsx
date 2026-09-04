import type { Metadata } from "next";
import Link from "next/link";
import { SponsorStatusCard } from "@/components/sponsor-status";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "Sponsor pool" };

export default function SponsorPage() {
  return (
    <div className="mx-auto max-w-[840px] px-4 py-14 md:px-6 md:py-20">
      <div className="label-xs">Sponsor pool</div>
      <h1 className="mt-3 text-[32px] font-medium tracking-[-0.02em] md:text-[40px]">Creator fees pay to keep Robinhood Chain wallets clean.</h1>
      <p className="mt-3 max-w-[600px] text-[14px] leading-relaxed text-fg-2">
        Solana refunds rent when accounts close. EVM chains do not. Incinerator replaces that with an EVM-native model: a bounded share of Pons creator fees funds a limited gas budget that pays for eligible cleanups.
      </p>
      <div className="mt-8 grid gap-3 md:grid-cols-[1fr_320px]">
        <Panel level={1} radius="xl" className="p-5 md:p-6">
          <div className="label-xs">Capital flow</div>
          <pre className="tnum mt-4 overflow-x-auto font-mono text-[12.5px] leading-[1.7] text-fg-2">
{`Pons creator fees
        │  claim (creator wallet) or route (FeeRouter)
        ▼
Creator fee treasury            cold · multisig / hardware
        │  push, one-way
        ▼
Sponsor reserve                 hot-adjacent · capped refills
        │  refill up to target, never above max
        ▼
Gas sponsor (paymaster deposit) hot · bounded exposure
        │  signed only after policy + simulation
        ▼
User cleanup operation          you sign · sponsor pays gas`}
          </pre>
          <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
            There is no withdrawFromTreasury, no pullFromTreasury, no treasury allowance, no delegatecall and no arbitrary execution anywhere in the sponsor path. A compromise of the app, paymaster, relayer or sponsor key is bounded by the funds already allocated to the sponsor budget.
          </p>
        </Panel>
        <div className="flex flex-col gap-3">
          <SponsorStatusCard />
          <Panel level={1} radius="lg" className="p-4 text-[12.5px] leading-relaxed text-fg-2">
            Live balances, budgets, refill history and contract addresses are on the{" "}
            <Link href="/transparency" className="text-fg underline underline-offset-2">
              transparency page
            </Link>
            .
          </Panel>
        </div>
      </div>
    </div>
  );
}
