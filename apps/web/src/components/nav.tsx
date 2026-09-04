"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./brand";
import { NetworkBadge } from "./network-badge";
import { ConnectButton } from "./wallet/connect-button";
import { cn } from "@/lib/utils";

/**
 * One row. Identity, network, one link, one action. Everything else lives in
 * the footer so the header never competes with the task on screen.
 */
export function Nav() {
  const path = usePathname();
  const onApp = path === "/app";
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-bg-0/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 md:h-16 md:gap-4 md:px-6">
        <Logo />
        <div className="hidden lg:block">
          <NetworkBadge />
        </div>
        <div className="ml-auto flex items-center gap-1.5 md:gap-3">
          {!onApp && (
            <Link href="/app" className="hidden rounded-[8px] px-3 py-2 text-[12px] font-medium uppercase tracking-[0.12em] text-fg-3 transition-colors hover:text-fg md:block">
              Cleanup
            </Link>
          )}
          <Link
            href="/transparency"
            className={cn(
              "rounded-[8px] px-2.5 py-2 text-[12px] font-medium uppercase tracking-[0.12em] transition-colors md:px-3",
              path === "/transparency" ? "text-fg" : "text-fg-3 hover:text-fg",
            )}
          >
            Transparency
          </Link>
          <ConnectButton size="sm" />
        </div>
      </div>
    </header>
  );
}
