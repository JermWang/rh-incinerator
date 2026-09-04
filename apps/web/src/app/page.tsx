import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PreviewPanel } from "@/components/landing/preview-panel";
import { NetworkBadge } from "@/components/network-badge";
import { Panel } from "@/components/ui/panel";
import { ConnectButton } from "@/components/wallet/connect-button";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 md:px-6">
      <section className="grid items-center gap-12 pb-20 pt-14 md:grid-cols-[1.05fr_1fr] md:pb-28 md:pt-24">
        <div>
          <NetworkBadge />
          <h1 className="mt-6 text-[40px] font-medium leading-[1.02] tracking-[-0.035em] text-fg md:text-[64px]">
            Clean your wallet.
            <br />
            Keep your ETH.
          </h1>
          <p className="mt-6 max-w-[460px] text-[15px] leading-relaxed text-fg-2 md:text-[16px]">
            Remove unwanted assets and stale approvals on Robinhood Chain. Eligible cleanup transactions are sponsored by creator fees.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ConnectButton size="lg" goToApp />
            <Link href="/how-it-works" className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.14em] text-fg-2 hover:text-fg">
              How it works <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
        <div className="flex justify-center md:justify-end">
          <PreviewPanel />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Feature title="Non-custodial" body="Assets never leave your control. You sign each cleanup; Incinerator never holds keys, seed phrases or funds." />
        <Feature title="Simulated first" body="Every burn, transfer and revocation runs through simulation on Robinhood Chain before it is offered. Non-standard tokens are refused." />
        <Feature title="Creator-funded gas" body="A limited sponsor budget, funded one-way from Pons creator fees, pays for eligible cleanups when your wallet supports sponsorship." />
      </section>

      <section className="mt-20 md:mt-28">
        <div className="label-xs">The loop</div>
        <ol className="mt-4 grid gap-px overflow-hidden rounded-[16px] border border-hairline bg-hairline md:grid-cols-6">
          {["Connect wallet", "Scan Robinhood Chain", "Select unwanted assets", "Review every operation", "Sign once", "Cleanup complete"].map((s, i) => (
            <li key={s} className="bg-bg-1 px-4 py-4">
              <div className="tnum text-[11px] text-fg-3">0{i + 1}</div>
              <div className="mt-1.5 text-[13.5px] font-medium text-fg">{s}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <Panel level={1} radius="lg" className="p-5">
      <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-fg">{title}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{body}</p>
    </Panel>
  );
}
