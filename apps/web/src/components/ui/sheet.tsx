"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
  /** Prevent closing while a wallet action is in flight. */
  locked?: boolean;
  width?: "md" | "lg";
}

/** L3 action surface: right-side sheet on desktop, bottom sheet on mobile. */
export function Sheet({ open, onOpenChange, title, description, children, footer, locked, width = "md" }: SheetProps) {
  const reduce = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (!locked || o ? onOpenChange(o) : undefined)}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.18 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild onEscapeKeyDown={(e) => locked && e.preventDefault()} onPointerDownOutside={(e) => locked && e.preventDefault()}>
              <motion.div
                className={cn(
                  "fixed z-50 flex flex-col glass-2 specular outline-none",
                  "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[24px] border-b-0",
                  "md:inset-y-3 md:right-3 md:left-auto md:bottom-3 md:max-h-none md:rounded-[24px] md:border-b",
                  width === "md" ? "md:w-[480px]" : "md:w-[560px]",
                )}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                transition={{ duration: reduce ? 0 : 0.22, ease: [0.25, 1, 0.5, 1] }}
              >
                <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
                  <div>
                    <Dialog.Title className="text-[18px] font-medium tracking-[-0.01em] text-fg">{title}</Dialog.Title>
                    {description && <Dialog.Description className="mt-1 text-[13px] leading-relaxed text-fg-2">{description}</Dialog.Description>}
                  </div>
                  <Dialog.Close asChild>
                    <button
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] text-fg-2 hover:bg-glass-2 hover:text-fg disabled:opacity-40"
                      aria-label="Close"
                      disabled={locked}
                    >
                      <X className="size-4" />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pb-4">{children}</div>
                {footer && <div className="border-t border-hairline px-6 py-4">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
