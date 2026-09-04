"use client";

import { Info } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { useSponsorStatus } from "@/hooks/use-sponsor-status";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<string, { label: string; tone: "accent" | "warn" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Active", tone: "accent" },
  PAUSED: { label: "Paused", tone: "warn" },
  LOW_BALANCE: { label: "Low balance", tone: "warn" },
  BUDGET_EXHAUSTED: { label: "Budget exhausted", tone: "warn" },
  NOT_CONFIGURED: { label: "Not configured", tone: "neutral" },
  NOT_DEPLOYED: { label: "Not deployed", tone: "neutral" },
};

/** The product's differentiator, presented with precise language. */
export function SponsorStatusCard({ className, compact }: { className?: string; compact?: boolean }) {
  const { data, isLoading } = useSponsorStatus();
  const s = data ? STATE_LABEL[data.state] ?? STATE_LABEL.NOT_CONFIGURED! : null;
  return (
    <Panel level={1} radius="lg" className={cn("px-4 py-3.5 md:px-5 md:py-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="label-xs">Creator-funded gas</div>
        <Tooltip content="Creator fee funds are isolated from the Incinerator application. Only a limited gas budget is exposed to sponsorship.">
          <button className="text-fg-3 hover:text-fg-2" aria-label="About creator-funded gas">
            <Info className="size-3.5" />
          </button>
        </Tooltip>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {isLoading || !s ? (
          <div className="skeleton h-4 w-16" />
        ) : (
          <>
            <StatusDot tone={s.tone} pulse={s.tone === "accent"} />
            <span className={cn("text-[12px] font-medium uppercase tracking-[0.14em]", s.tone === "accent" ? "text-accent" : s.tone === "warn" ? "text-warn" : "text-fg-2")}>
              {s.label}
            </span>
          </>
        )}
      </div>
      {!compact && (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-fg-3">
          {data && !data.active
            ? data.reason
            : "Trading fees from participating Pons creator allocations fund eligible wallet cleanup transactions."}
        </p>
      )}
    </Panel>
  );
}
