"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-quart)] select-none disabled:opacity-45 disabled:pointer-events-none active:translate-y-px";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-black hover:bg-[#d6ff2e] shadow-[0_0_0_1px_rgba(204,255,0,0.35),0_8px_24px_-12px_rgba(204,255,0,0.45)] tracking-[0.08em] uppercase text-[12px]",
  secondary:
    "bg-glass-2 text-fg border border-hairline-2 hover:bg-glass-3 hover:border-[rgba(255,255,255,0.22)] tracking-[0.08em] uppercase text-[12px]",
  outline: "bg-transparent text-fg border border-hairline-2 hover:bg-glass-1 tracking-[0.08em] uppercase text-[12px]",
  ghost: "bg-transparent text-fg-2 hover:text-fg hover:bg-glass-1 text-[13px]",
  danger:
    "bg-danger-glass text-danger border border-[rgba(255,98,93,0.28)] hover:bg-[rgba(255,98,93,0.14)] tracking-[0.08em] uppercase text-[12px]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 rounded-[9px]",
  md: "h-11 px-5 rounded-[11px]",
  lg: "h-12 px-6 rounded-[12px] text-[13px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, children, disabled, ...props },
  ref,
) {
  return (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner className={variant === "primary" ? "text-black" : "text-fg-2"} />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
