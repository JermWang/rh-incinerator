"use client";

import { ExternalLink, Unlock } from "lucide-react";
import { memo, useState } from "react";
import type { TokenAsset } from "@incinerator/chain";
import { formatUsd, shortAddress } from "@incinerator/chain";
import { ClassificationBadge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { tokenUrl } from "@/lib/network";
import { cn } from "@/lib/utils";
import { MechanismPill } from "./mechanism-pill";

interface Props {
  token: TokenAsset;
  selected: boolean;
  unlocked: boolean;
  sponsorPossible: boolean;
  onToggle: () => void;
  onUnlock: () => void;
}

export const TokenRow = memo(function TokenRow({ token, selected, unlocked, sponsorPossible, onToggle, onUnlock }: Props) {
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const supported = token.mechanism === "BURNABLE" || token.mechanism === "SEND_TO_DEAD";
  const locked = token.protectedAsset && !unlocked;
  const disabled = !supported;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-[14px] border px-3 py-3 transition-[background-color,border-color,box-shadow] duration-150 md:gap-4 md:px-4",
        selected ? "accent-edge border-hairline-2 bg-glass-2" : "border-hairline bg-glass-1 hover:border-hairline-2",
        disabled && "opacity-70",
      )}
      data-selected={selected}
      data-testid={`asset-row-${token.symbol}`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        disabled={disabled}
        locked={locked}
        label={`Select ${token.symbol}`}
      />
      <TokenIcon symbol={token.symbol} url={token.iconUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-fg">{token.symbol}</span>
          <ClassificationBadge value={token.classification} compact />
          <span className="hidden truncate text-[12.5px] text-fg-3 md:inline">{token.name}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11.5px] text-fg-3">
          <Tooltip content={token.reasons.join(" · ")}>
            <span className="capitalize">{token.classification.toLowerCase()}</span>
          </Tooltip>
          <span aria-hidden>·</span>
          <a href={tokenUrl(token.address)} target="_blank" rel="noreferrer" className="tnum inline-flex items-center gap-1 font-mono hover:text-fg-2">
            {shortAddress(token.address, 4, 4)}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
          <MechanismPill mechanism={token.mechanism} reason={token.mechanismReason} />
          {supported && <span className={cn("text-[11px]", sponsorPossible ? "text-accent" : "text-fg-3")}>{sponsorPossible ? "Eligible for free" : "Standard gas"}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="tnum text-[14px] font-medium text-fg">{token.balanceFormatted}</div>
        <div className="tnum mt-0.5 text-[11.5px] text-fg-3">{token.valueUsd !== null ? formatUsd(token.valueUsd) : "No price"}</div>
      </div>
      <div data-testid="asset-actions-desktop" className="hidden w-[172px] flex-col items-end gap-1.5 md:flex">
        <MechanismPill mechanism={token.mechanism} reason={token.mechanismReason} />
        {supported && <span className={cn("text-[11px]", sponsorPossible ? "text-accent" : "text-fg-3")}>{sponsorPossible ? "Eligible for free" : "Standard gas"}</span>}
      </div>
      {locked && supported && (
        <div className="absolute inset-x-3 -bottom-px z-10 hidden translate-y-full pt-1 group-hover:block group-focus-within:block md:inset-x-4">
          {!confirmUnlock ? (
            <button onClick={() => setConfirmUnlock(true)} className="inline-flex items-center gap-1.5 rounded-b-[10px] border border-t-0 border-hairline bg-bg-2 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.1em] text-fg-3 hover:text-fg-2">
              <Unlock className="size-3" /> Protected · unlock to select
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-b-[10px] border border-t-0 border-[rgba(255,98,93,0.28)] bg-bg-2 px-2.5 py-1.5 text-[11.5px] text-fg-2">
              <span>Unlocking lets you destroy a protected asset. Continue?</span>
              <button
                onClick={() => {
                  onUnlock();
                  setConfirmUnlock(false);
                }}
                className="text-danger underline-offset-2 hover:underline"
              >
                Unlock
              </button>
              <button onClick={() => setConfirmUnlock(false)} className="text-fg-3 hover:text-fg-2">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export function TokenIcon({ symbol, url, size = 36 }: { symbol: string; url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-full bg-glass-2" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-hairline bg-glass-2 text-[11px] font-medium uppercase text-fg-2"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {symbol.replace(/[^a-z0-9]/gi, "").slice(0, 3) || "?"}
    </span>
  );
}
