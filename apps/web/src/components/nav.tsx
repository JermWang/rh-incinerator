"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { NetworkBadge } from "./network-badge";
import { ConnectButton } from "./wallet/connect-button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/sponsor", label: "Sponsor Pool" },
  { href: "/activity", label: "Activity" },
  { href: "/transparency", label: "Transparency" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-bg-0/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-4 px-4 md:h-16 md:px-6">
        <Logo />
        <div className="hidden md:block">
          <NetworkBadge />
        </div>
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-[8px] px-3 py-2 text-[12px] font-medium uppercase tracking-[0.12em] transition-colors",
                path === l.href ? "text-fg" : "text-fg-3 hover:text-fg-2",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto md:ml-2">
          <ConnectButton size="sm" />
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Secondary">
        <div className="mr-1 shrink-0">
          <NetworkBadge compact />
        </div>
        {[{ href: "/app", label: "Cleanup" }, ...links].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "shrink-0 rounded-[7px] px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em]",
              path === l.href ? "bg-glass-2 text-fg" : "text-fg-3",
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
