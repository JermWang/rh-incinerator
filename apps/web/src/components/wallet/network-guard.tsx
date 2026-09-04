"use client";

import { useConnection, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ACTIVE_CHAIN_ID, activeChainName } from "@/lib/network";

/**
 * Ensures the wallet is on Robinhood Chain. `switchChain` adds the network
 * (wallet_addEthereumChain) when the wallet does not know it yet.
 */
export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { chainId, isConnected } = useConnection();
  const { mutate: switchChain, isPending, error } = useSwitchChain();
  if (!isConnected || chainId === ACTIVE_CHAIN_ID) return <>{children}</>;
  return (
    <Panel level={2} className="mx-auto mt-10 max-w-[480px] p-6">
      <div className="label-xs">Network</div>
      <h2 className="mt-2 text-[20px] font-medium tracking-[-0.01em]">Switch to {activeChainName}</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">
        Incinerator only operates on {activeChainName} (chain id {ACTIVE_CHAIN_ID}). Your wallet will be asked to switch, or to add the network if it is not configured yet.
      </p>
      <Button className="mt-5 w-full" variant="primary" loading={isPending} onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}>
        Switch network
      </Button>
      {error && <p className="mt-3 text-[12.5px] text-danger">{error.message.split("\n")[0]}</p>}
    </Panel>
  );
}
