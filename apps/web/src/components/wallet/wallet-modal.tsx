"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useConnect, useConnectors } from "wagmi";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/**
 * Wallet chooser. Lists injected (EIP-6963) providers and WalletConnect when
 * configured. Never asks for seed phrases or private keys.
 */
export function WalletModal({ open, onOpenChange }: Props) {
  const connectors = useConnectors();
  const { mutate: connect, isPending, variables, error, reset } = useConnect({
    mutation: { onSuccess: () => onOpenChange(false) },
  });
  const visible = connectors.filter((c, i, arr) => c.id !== "injected" || arr.filter((x) => x.type === "injected").length === 1);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] glass-2 specular p-6 outline-none">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-[16px] font-medium text-fg">Connect wallet</Dialog.Title>
              <Dialog.Description className="mt-1 text-[12.5px] text-fg-2">Non-custodial. Incinerator never holds your assets.</Dialog.Description>
            </div>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-[8px] text-fg-2 hover:bg-glass-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            {visible.length === 0 && (
              <div className="rounded-[12px] border border-hairline bg-glass-1 p-4 text-[13px] text-fg-2">
                No wallet detected. Install a browser wallet that supports custom EVM networks, then reload.
              </div>
            )}
            {visible.map((c) => (
              <button
                key={c.uid}
                onClick={() => connect({ connector: c })}
                disabled={isPending}
                className="flex h-12 items-center gap-3 rounded-[12px] border border-hairline bg-glass-1 px-4 text-left text-[13.5px] text-fg transition-colors hover:border-hairline-2 hover:bg-glass-2 disabled:opacity-60"
              >
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="size-6 rounded-[6px]" />
                ) : (
                  <span className="size-6 rounded-[6px] bg-glass-3" aria-hidden />
                )}
                <span className="flex-1">{c.name}</span>
                {isPending && variables?.connector === c && <span className="text-[11px] uppercase tracking-[0.12em] text-fg-3">Connecting</span>}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-[12.5px] text-danger">{error.message.split("\n")[0]}</p>}
          <div className="mt-5 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
