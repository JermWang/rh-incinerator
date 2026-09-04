"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RadixTabs.List className={cn("flex items-end gap-1 border-b border-hairline", className)} aria-label="Asset categories">
      {children}
    </RadixTabs.List>
  );
}

export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: number | undefined }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        "group relative -mb-px flex h-11 items-center gap-2 px-3.5 text-[12px] font-medium uppercase tracking-[0.12em] text-fg-3 transition-colors",
        "hover:text-fg-2 data-[state=active]:text-fg",
        "after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-accent after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100",
      )}
    >
      {children}
      {count !== undefined && (
        <span className="tnum rounded-[5px] bg-glass-2 px-1.5 py-0.5 text-[10.5px] text-fg-2 group-data-[state=active]:text-fg">{count}</span>
      )}
    </RadixTabs.Trigger>
  );
}
