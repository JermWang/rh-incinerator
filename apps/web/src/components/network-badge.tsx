import { IS_TESTNET } from "@/lib/network";
import { cn } from "@/lib/utils";

/**
 * Network identification. Text only: no redrawn or recoloured third-party
 * marks. If an official Robinhood Chain asset is supplied later it must be
 * displayed unmodified, as a separate element, with its own clearspace.
 */
export function NetworkBadge({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-[7px] border border-hairline bg-glass-1 px-2.5 py-1.5", className)}>
      <span className="size-1.5 rounded-full bg-accent" aria-hidden />
      <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-fg-2">
        {compact ? "Robinhood Chain" : "Built for Robinhood Chain"}
      </span>
      {IS_TESTNET && <span className="rounded-[4px] bg-glass-3 px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.12em] text-fg-3">Testnet</span>}
    </span>
  );
}
