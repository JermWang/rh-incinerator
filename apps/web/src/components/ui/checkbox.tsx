"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
  label: string;
  className?: string;
}

export function Checkbox({ checked, onCheckedChange, disabled, locked, label, className }: Props) {
  return (
    <RadixCheckbox.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      disabled={disabled || locked}
      aria-label={label}
      className={cn(
        "size-[18px] shrink-0 rounded-[5px] border transition-[background-color,border-color] duration-150 flex items-center justify-center",
        checked ? "bg-accent border-accent" : "bg-glass-1 border-hairline-2 hover:border-[rgba(255,255,255,0.3)]",
        (disabled || locked) && "opacity-50",
        className,
      )}
    >
      {locked && !checked ? <Lock className="size-3 text-fg-3" aria-hidden /> : null}
      <RadixCheckbox.Indicator>
        <Check className="size-3.5 text-black" strokeWidth={3} aria-hidden />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
