"use client";

import { formatGwei } from "viem";
import { useBlockNumber, useConnection, useGasPrice } from "wagmi";
import { StatusDot } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { useSponsorStatus } from "@/hooks/use-sponsor-status";
import { ACTIVE_CHAIN_ID, activeChainName } from "@/lib/network";

/**
 * Live preview. Every number here is real: network state and sponsor status
 * are read from the chain and the sponsor; wallet figures appear only after a
 * scan. No fabricated activity.
 */
export function PreviewPanel() {
  const { isConnected } = useConnection();
  const block = useBlockNumber({ chainId: ACTIVE_CHAIN_ID, watch: true, query: { refetchInterval: 8_000 } });
  const gas = useGasPrice({ chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 15_000 } });
  const sponsor = useSponsorStatus();

  return (
    <Panel level={2} radius="2xl" className="w-full max-w-[460px] p-5 md:p-6">
      <div className="flex items-center justify-between">
        <span className="label-xs">Wallet health</span>
        <span className="text-[10.5px] uppercase tracking-[0.14em] text-fg-3">{isConnected ? "Connected" : "Not connected"}</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <Figure label="unwanted assets" />
        <Figure label="stale approvals" />
        <Figure label="eligible gas cost" />
      </div>
      <p className="mt-3 text-[11.5px] text-fg-3">Figures populate after a scan of your connected wallet.</p>

      <div className="mt-6 rounded-[14px] border border-hairline bg-glass-1 p-4">
        <div className="flex items-center justify-between">
          <span className="label-xs">Creator-funded gas</span>
          <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em]">
            {sponsor.data ? (
              <>
                <StatusDot tone={sponsor.data.active ? "accent" : "warn"} pulse={sponsor.data.active} />
                <span className={sponsor.data.active ? "text-accent" : "text-warn"}>{sponsor.data.active ? "Active" : sponsor.data.state.replace("_", " ").toLowerCase()}</span>
              </>
            ) : (
              <span className="skeleton h-3 w-12" />
            )}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
          <Kv k="Network" v={activeChainName} />
          <Kv k="Block" v={block.data ? block.data.toLocaleString("en-US") : "…"} />
          <Kv k="Gas price" v={gas.data !== undefined ? `${formatGwei(gas.data)} gwei` : "…"} />
        </dl>
      </div>
    </Panel>
  );
}

function Figure({ label }: { label: string }) {
  return (
    <div>
      <div className="tnum text-[28px] font-medium leading-none tracking-[-0.03em] text-fg-3">—</div>
      <div className="mt-2 text-[11px] leading-tight text-fg-3">{label}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] uppercase tracking-[0.12em] text-fg-3">{k}</dt>
      <dd className="tnum mt-0.5 truncate text-fg-2">{v}</dd>
    </div>
  );
}
