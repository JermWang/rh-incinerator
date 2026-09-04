import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mascot and logo assets. Optimized derivatives live in /public/brand. */
export const ART = {
  fire: "/brand/mascot-fire.webp",
  torch: "/brand/mascot-torch.webp",
  head: "/brand/mascot-head.webp",
  emblem: "/brand/emblem.webp",
  wordmark: "/brand/wordmark.webp",
  freeBurns: "/brand/free-burns.webp",
} as const;

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="Incinerator home">
      <Image src={ART.emblem} alt="Incinerator" width={30} height={30} priority className="size-[30px] transition-transform duration-200 group-hover:scale-105" />
      <span className="hidden text-[13px] font-semibold uppercase tracking-[0.2em] text-fg sm:inline">Incinerator</span>
    </Link>
  );
}

interface MascotProps {
  art?: keyof typeof ART;
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
}

export function Mascot({ art = "torch", size = 180, className, priority, alt = "" }: MascotProps) {
  return (
    <Image
      src={ART[art]}
      alt={alt}
      width={size}
      height={size}
      priority={priority ?? false}
      className={cn("select-none", className)}
      style={{ width: size, height: "auto" }}
    />
  );
}
