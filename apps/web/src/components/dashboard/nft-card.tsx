"use client";

import { ImageOff, Lock, Unlock } from "lucide-react";
import { memo, useState } from "react";
import type { NftAsset } from "@incinerator/chain";
import { ClassificationBadge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { MechanismPill } from "./mechanism-pill";

interface Props {
  nft: NftAsset;
  selected: boolean;
  unlocked: boolean;
  onToggle: () => void;
  onUnlock: () => void;
}

export const NftCard = memo(function NftCard({ nft, selected, unlocked, onToggle, onUnlock }: Props) {
  const [broken, setBroken] = useState(false);
  const supported = nft.mechanism === "BURNABLE" || nft.mechanism === "SEND_TO_DEAD";
  const locked = nft.protectedAsset && !unlocked;
  const url = nft.imageUrl?.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${nft.imageUrl.slice(7)}` : nft.imageUrl;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[14px] border transition-[border-color,background-color,box-shadow] duration-150",
        selected ? "accent-edge border-hairline-2 bg-glass-2" : "border-hairline bg-glass-1 hover:border-hairline-2",
        !supported && "opacity-70",
      )}
    >
      <button
        onClick={() => supported && !locked && onToggle()}
        disabled={!supported || locked}
        className="relative aspect-square w-full bg-bg-2 text-left"
        aria-label={`${selected ? "Deselect" : "Select"} ${nft.collectionName} #${nft.tokenId}`}
      >
        {url && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-fg-3">
            <ImageOff className="size-5" />
          </span>
        )}
        <span className="absolute left-2 top-2">
          <Checkbox checked={selected} onCheckedChange={onToggle} disabled={!supported} locked={locked} label={`Select ${nft.collectionName} #${nft.tokenId}`} />
        </span>
        <span className="absolute right-2 top-2">
          <ClassificationBadge value={nft.classification} compact />
        </span>
      </button>
      <div className="flex flex-col gap-1.5 p-3">
        <div className="truncate text-[12.5px] font-medium text-fg">{nft.collectionName}</div>
        <div className="tnum flex items-center justify-between text-[11.5px] text-fg-3">
          <span className="truncate">#{nft.tokenId.length > 12 ? `${nft.tokenId.slice(0, 6)}…${nft.tokenId.slice(-4)}` : nft.tokenId}</span>
          {nft.standard === "ERC1155" && <span>×{nft.amount}</span>}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <MechanismPill mechanism={nft.mechanism} reason={nft.mechanismReason} />
          {locked && supported && (
            <button onClick={onUnlock} className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.1em] text-fg-3 hover:text-danger" title="Unlock protected asset">
              {unlocked ? <Unlock className="size-3" /> : <Lock className="size-3" />} Unlock
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
