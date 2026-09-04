import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  level?: 1 | 2;
  specular?: boolean;
  radius?: "lg" | "xl" | "2xl";
}

/** Glass surface. L2 = glass card, L3 = elevated action surface. */
export function Panel({ level = 1, specular = true, radius = "xl", className, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        level === 1 ? "glass" : "glass-2",
        specular && "specular",
        radius === "lg" ? "rounded-[16px]" : radius === "xl" ? "rounded-[20px]" : "rounded-[24px]",
        className,
      )}
      {...props}
    />
  );
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface-1 rounded-[16px]", className)} {...props} />;
}
