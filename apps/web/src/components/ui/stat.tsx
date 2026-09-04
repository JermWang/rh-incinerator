import type { ReactNode } from "react";
import { Panel } from "./panel";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "accent";
  loading?: boolean;
  className?: string;
}

export function Stat({ label, value, hint, tone = "neutral", loading, className }: StatProps) {
  return (
    <Panel level={1} radius="lg" className={cn("px-4 py-3.5 md:px-5 md:py-4", className)}>
      <div className="label-xs">{label}</div>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-20" />
      ) : (
        <div className={cn("tnum mt-1.5 text-[24px] font-medium leading-none tracking-[-0.02em] md:text-[26px]", tone === "accent" ? "text-accent" : "text-fg")}>
          {value}
        </div>
      )}
      {hint && <div className="mt-1.5 text-[11.5px] text-fg-3">{hint}</div>}
    </Panel>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}
