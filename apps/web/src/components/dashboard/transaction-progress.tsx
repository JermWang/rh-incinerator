"use client";

import { Check, ExternalLink } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { shortAddress } from "@incinerator/chain";
import { Spinner } from "@/components/ui/button";
import { STAGE_ORDER, type CleanupState, type Stage } from "@/hooks/use-cleanup";
import { txUrl } from "@/lib/network";
import { cn } from "@/lib/utils";

const LABELS: Record<Stage, string> = {
  idle: "Idle",
  preparing: "Preparing",
  simulating: "Simulating",
  "checking-sponsor": "Checking sponsor eligibility",
  "signing-in": "Verifying wallet",
  "awaiting-signature": "Awaiting signature",
  submitted: "Submitted",
  confirmed: "Confirmed",
  failed: "Failed",
};

export function TransactionProgress({ state }: { state: CleanupState }) {
  const reduce = useReducedMotion();
  const current = state.stage === "signing-in" ? "checking-sponsor" : state.stage;
  const idx = STAGE_ORDER.indexOf(current as Stage);
  const failed = state.stage === "failed";
  const sequential = state.mode === "sequential" && state.progress.total > 1;

  return (
    <div className="rounded-[14px] border border-hairline bg-glass-1 p-4">
      <ol className="flex flex-col gap-2.5" aria-label="Transaction progress">
        {STAGE_ORDER.map((stage, i) => {
          const done = !failed && i < idx;
          const active = !failed && i === idx;
          return (
            <li key={stage} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full border text-[10px]",
                  done ? "border-accent bg-accent text-black" : active ? "border-accent text-accent" : failed && i === idx ? "border-danger text-danger" : "border-hairline-2 text-fg-3",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : active ? <Spinner className="size-3 text-accent" /> : <span className="size-1.5 rounded-full bg-current opacity-60" />}
              </span>
              <span className={cn("text-[13px]", done || active ? "text-fg" : "text-fg-3")}>
                {stage === "signing-in" ? LABELS["signing-in"] : LABELS[stage]}
                {stage === "awaiting-signature" && sequential && active && (
                  <span className="tnum ml-2 text-fg-3">
                    {state.progress.done + 1} / {state.progress.total}
                  </span>
                )}
              </span>
              {active && !reduce && (
                <motion.span layoutId="stage-glow" className="ml-auto h-px w-10 bg-accent/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} />
              )}
            </li>
          );
        })}
      </ol>
      {state.txHashes.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-hairline pt-3">
          {state.txHashes.map((h) => (
            <a key={h} href={txUrl(h)} target="_blank" rel="noreferrer" className="tnum inline-flex items-center gap-1.5 font-mono text-[12px] text-fg-2 hover:text-fg">
              {shortAddress(h, 10, 8)}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ))}
        </div>
      )}
      {failed && state.error && <p className="mt-3 text-[12.5px] leading-relaxed text-danger">{state.error}</p>}
    </div>
  );
}
