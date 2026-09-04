import Link from "next/link";
import { Logo } from "./logo";
import { activeExplorer } from "@/lib/network";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-hairline">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-10 md:flex-row md:items-start md:justify-between md:px-6">
        <div className="max-w-[420px]">
          <Logo />
          <p className="mt-3 text-[12.5px] leading-relaxed text-fg-3">
            Incinerator is an independent application built for Robinhood Chain and is not affiliated with or endorsed by Robinhood.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-[12px] uppercase tracking-[0.12em] text-fg-3" aria-label="Footer">
          <Link href="/how-it-works" className="hover:text-fg-2">
            How it works
          </Link>
          <Link href="/security" className="hover:text-fg-2">
            Security
          </Link>
          <Link href="/transparency" className="hover:text-fg-2">
            Transparency
          </Link>
          <Link href="/sponsor" className="hover:text-fg-2">
            Sponsor pool
          </Link>
          <a href={activeExplorer} target="_blank" rel="noreferrer" className="hover:text-fg-2">
            Explorer
          </a>
          <Link href="/activity" className="hover:text-fg-2">
            Activity
          </Link>
        </nav>
      </div>
    </footer>
  );
}
