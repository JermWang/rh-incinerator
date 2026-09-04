import type { Metadata } from "next";
import { TransparencyView } from "@/components/transparency/transparency-view";

export const metadata: Metadata = { title: "Transparency" };

export default function TransparencyPage() {
  return (
    <div className="mx-auto max-w-[1040px] px-4 py-14 md:px-6 md:py-20">
      <div className="label-xs">Transparency</div>
      <h1 className="mt-3 text-[32px] font-medium tracking-[-0.02em] md:text-[40px]">Where the gas comes from.</h1>
      <p className="mt-3 max-w-[560px] text-[14px] leading-relaxed text-fg-2">Read-only figures from the chain and the sponsor ledger. Nothing here is estimated or fabricated; unavailable values are shown as unavailable.</p>
      <div className="mt-10">
        <TransparencyView />
      </div>
    </div>
  );
}
