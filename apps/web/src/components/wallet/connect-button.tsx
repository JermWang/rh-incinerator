"use client";

import { ChevronDown, LogOut, ExternalLink, Copy, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConnection, useDisconnect } from "wagmi";
import { shortAddress } from "@incinerator/chain";
import { Button } from "@/components/ui/button";
import { ACTIVE_CHAIN_ID, addressUrl } from "@/lib/network";
import { WalletModal } from "./wallet-modal";

export function ConnectButton({ size = "md", goToApp }: { size?: "sm" | "md" | "lg"; goToApp?: boolean }) {
  const { address, isConnected, chainId, status } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (goToApp && isConnected) router.push("/app");
  }, [goToApp, isConnected, router]);

  if (!isConnected || !address) {
    return (
      <>
        <Button variant="primary" size={size} onClick={() => setOpen(true)} loading={status === "reconnecting"}>
          Connect wallet
        </Button>
        <WalletModal open={open} onOpenChange={setOpen} />
      </>
    );
  }

  const wrongNetwork = chainId !== ACTIVE_CHAIN_ID;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setMenu((m) => !m)}
        className="flex h-10 items-center gap-2 rounded-[10px] border border-hairline bg-glass-1 px-3 text-[12.5px] text-fg transition-colors hover:border-hairline-2 hover:bg-glass-2"
        aria-haspopup="menu"
        aria-expanded={menu}
      >
        <span className={`size-1.5 rounded-full ${wrongNetwork ? "bg-warn" : "bg-accent pulse-dot"}`} aria-hidden />
        <span className="tnum font-mono">{shortAddress(address)}</span>
        <ChevronDown className="size-3.5 text-fg-3" aria-hidden />
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-40 w-[220px] rounded-[12px] glass-2 specular p-1.5">
          <MenuItem
            onClick={() => {
              void navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy address"}
          </MenuItem>
          <a href={addressUrl(address)} target="_blank" rel="noreferrer" role="menuitem" className={itemClass}>
            <ExternalLink className="size-3.5" /> View on explorer
          </a>
          <MenuItem
            onClick={() => {
              disconnect();
              setMenu(false);
            }}
          >
            <LogOut className="size-3.5" /> Disconnect
          </MenuItem>
        </div>
      )}
    </div>
  );
}

const itemClass = "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[12.5px] text-fg-2 hover:bg-glass-2 hover:text-fg";

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick} className={itemClass}>
      {children}
    </button>
  );
}
