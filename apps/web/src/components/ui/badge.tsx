import { Lock, ShieldCheck, TriangleAlert, EyeOff, CircleDollarSign, CircleHelp, Circle } from "lucide-react";
import type { Classification, ApprovalRisk } from "@incinerator/chain";
import { cn } from "@/lib/utils";

const CLASS_STYLES: Record<Classification, { label: string; className: string; Icon: typeof Lock }> = {
  PROTECTED: { label: "Protected", className: "bg-accent-glass text-accent border-[rgba(204,255,0,0.28)]", Icon: Lock },
  VALUABLE: { label: "Valuable", className: "bg-glass-2 text-fg border-hairline-2", Icon: CircleDollarSign },
  VERIFIED: { label: "Verified", className: "bg-glass-1 text-fg-2 border-hairline", Icon: ShieldCheck },
  KNOWN: { label: "Known", className: "bg-glass-1 text-fg-2 border-hairline", Icon: Circle },
  UNVERIFIED: { label: "Unverified", className: "bg-transparent text-fg-3 border-hairline", Icon: CircleHelp },
  HIDDEN: { label: "Hidden", className: "bg-transparent text-fg-3 border-hairline", Icon: EyeOff },
  SUSPICIOUS: { label: "Suspicious", className: "bg-warn-glass text-warn border-[rgba(255,200,87,0.28)]", Icon: TriangleAlert },
};

export function ClassificationBadge({ value, compact }: { value: Classification; compact?: boolean }) {
  const s = CLASS_STYLES[value];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.1em]", s.className)}>
      <s.Icon className="size-3" aria-hidden />
      {!compact && s.label}
    </span>
  );
}

const RISK_STYLES: Record<ApprovalRisk, string> = {
  HIGH: "bg-danger-glass text-danger border-[rgba(255,98,93,0.28)]",
  MEDIUM: "bg-warn-glass text-warn border-[rgba(255,200,87,0.28)]",
  LOW: "bg-glass-1 text-fg-2 border-hairline",
  UNKNOWN: "bg-transparent text-fg-3 border-hairline",
};

export function RiskBadge({ value }: { value: ApprovalRisk }) {
  return (
    <span className={cn("inline-flex items-center rounded-[6px] border px-1.5 py-[3px] text-[10.5px] font-medium uppercase tracking-[0.1em]", RISK_STYLES[value])}>
      {value === "UNKNOWN" ? "Unknown risk" : `${value.toLowerCase()} risk`}
    </span>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "accent" | "danger" | "warn"; className?: string }) {
  const tones = {
    neutral: "bg-glass-1 text-fg-2 border-hairline",
    accent: "bg-accent-glass text-accent border-[rgba(204,255,0,0.28)]",
    danger: "bg-danger-glass text-danger border-[rgba(255,98,93,0.28)]",
    warn: "bg-warn-glass text-warn border-[rgba(255,200,87,0.28)]",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 text-[10.5px] font-medium uppercase tracking-[0.12em]", tones[tone], className)}>
      {children}
    </span>
  );
}

export function StatusDot({ tone = "accent", pulse }: { tone?: "accent" | "danger" | "warn" | "neutral"; pulse?: boolean }) {
  const c = { accent: "bg-accent", danger: "bg-danger", warn: "bg-warn", neutral: "bg-fg-3" }[tone];
  return <span aria-hidden className={cn("inline-block size-1.5 rounded-full", c, pulse && tone === "accent" && "pulse-dot")} />;
}
