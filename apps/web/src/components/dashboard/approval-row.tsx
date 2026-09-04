"use client";

import { ExternalLink } from "lucide-react";
import { memo } from "react";
import type { ApprovalItem } from "@incinerator/chain";
import { shortAddress } from "@incinerator/chain";
import { RiskBadge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { addressUrl } from "@/lib/network";
import { cn, timeAgo } from "@/lib/utils";

const KIND_LABEL: Record<ApprovalItem["kind"], string> = {
  ERC20_ALLOWANCE: "Allowance",
  ERC721_TOKEN: "Token approval",
  OPERATOR: "Operator",
};

export const ApprovalRow = memo(function ApprovalRow({ item, selected, onToggle }: { item: ApprovalItem; selected: boolean; onToggle: () => void }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[14px] border px-3 py-3 transition-[background-color,border-color,box-shadow] duration-150 md:gap-4 md:px-4",
        selected ? "accent-edge border-hairline-2 bg-glass-2" : "border-hairline bg-glass-1 hover:border-hairline-2",
      )}
    >
      <Checkbox checked={selected} onCheckedChange={onToggle} label={`Select approval of ${item.asset.symbol} to ${item.spender}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium text-fg">{item.asset.symbol}</span>
          <span className="text-[11px] uppercase tracking-[0.1em] text-fg-3">{KIND_LABEL[item.kind]}</span>
          {item.tokenId && <span className="tnum text-[11.5px] text-fg-3">#{item.tokenId}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-3">
          <span>Spender</span>
          <a href={addressUrl(item.spender)} target="_blank" rel="noreferrer" className="tnum inline-flex items-center gap-1 font-mono text-fg-2 hover:text-fg">
            {item.spenderName ?? shortAddress(item.spender)}
            <ExternalLink className="size-3" aria-hidden />
          </a>
          <span aria-hidden>·</span>
          <span>{item.spenderIsContract ? (item.spenderVerified ? "Verified contract" : "Unverified contract") : "Externally owned account"}</span>
          {item.lastActivityAt && (
            <>
              <span aria-hidden>·</span>
              <span>Approved {timeAgo(item.lastActivityAt)}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className={cn("tnum text-[13.5px] font-medium", item.unlimited ? "text-warn" : "text-fg")}>
          {item.amountFormatted ?? (item.kind === "OPERATOR" ? "All tokens" : "1 token")}
        </span>
        <Tooltip content={item.riskReasons.join(" · ")}>
          <span>
            <RiskBadge value={item.risk} />
          </span>
        </Tooltip>
      </div>
    </div>
  );
});
