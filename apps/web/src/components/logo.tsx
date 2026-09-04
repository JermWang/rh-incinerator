import Link from "next/link";
import { cn } from "@/lib/utils";

/** Incinerator wordmark. Its own identity; never combined with network marks. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="Incinerator home">
      <span className="relative flex size-[18px] items-center justify-center" aria-hidden>
        <span className="absolute inset-0 rounded-[4px] border border-hairline-2 bg-glass-2" />
        <span className="relative size-[6px] rounded-[1.5px] bg-accent transition-transform duration-200 group-hover:scale-110" />
      </span>
      <span className="text-[13px] font-semibold uppercase tracking-[0.22em] text-fg">Incinerator</span>
    </Link>
  );
}
