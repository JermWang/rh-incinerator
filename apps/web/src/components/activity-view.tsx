"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import { shortAddress } from "@incinerator/chain";
import { Pill } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { ConnectButton } from "@/components/wallet/connect-button";
import { readLocal, type LocalCleanup } from "@/hooks/use-cleanup";
import { api } from "@/lib/api";
import { txUrl } from "@/lib/network";
import { timeAgo } from "@/lib/utils";

interface Row {
  id: string;
  txHash: string | null;
  kinds: string[];
  sponsored: boolean;
  status: string;
  at: number;
}

export function ActivityView() {
  const { address, isConnected } = useConnection();
  const [local, setLocal] = useState<LocalCleanup[]>([]);
  useEffect(() => setLocal(readLocal()), []);
  const remote = useQuery({ queryKey: ["cleanups", address], queryFn: () => api.cleanups(address!), enabled: Boolean(address) });

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const c of local) {
      if (address && c.wallet.toLowerCase() !== address.toLowerCase()) continue;
      map.set(c.id, { id: c.id, txHash: c.txHashes[0] ?? null, kinds: c.kinds, sponsored: c.sponsored, status: c.status, at: c.at });
    }
    for (const c of remote.data?.items ?? []) {
      if (!map.has(c.id)) map.set(c.id, { id: c.id, txHash: c.txHash, kinds: c.kinds, sponsored: c.sponsored, status: c.status, at: c.createdAt });
    }
    return [...map.values()].sort((a, b) => b.at - a.at);
  }, [local, remote.data, address]);

  if (!isConnected) {
    return (
      <Panel level={1} radius="lg" className="flex flex-col items-start gap-4 p-6">
        <p className="text-[13.5px] text-fg-2">Connect a wallet to view its cleanup history.</p>
        <ConnectButton />
      </Panel>
    );
  }
  if (rows.length === 0) return <div className="rounded-[14px] border border-dashed border-hairline px-4 py-10 text-center text-[13px] text-fg-3">No cleanups yet for this wallet.</div>;

  return (
    <ul className="divide-y divide-hairline rounded-[16px] border border-hairline bg-glass-1">
      {rows.map((r) => {
        const removed = r.kinds.filter((k) => !k.endsWith("REVOKE")).length;
        const revoked = r.kinds.length - removed;
        return (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[13px]">
            <div>
              <div className="text-fg">
                {removed > 0 && `${removed} removed`}
                {removed > 0 && revoked > 0 && " · "}
                {revoked > 0 && `${revoked} revoked`}
              </div>
              <div className="mt-0.5 text-[11.5px] text-fg-3">{timeAgo(r.at)}</div>
            </div>
            <div className="flex items-center gap-3">
              <Pill tone={r.sponsored ? "accent" : "neutral"}>{r.sponsored ? "Sponsored" : "Standard"}</Pill>
              <Pill tone={r.status === "CONFIRMED" ? "neutral" : r.status === "FAILED" ? "danger" : "warn"}>{r.status.toLowerCase()}</Pill>
              {r.txHash && (
                <a href={txUrl(r.txHash)} target="_blank" rel="noreferrer" className="tnum inline-flex items-center gap-1 font-mono text-fg-2 hover:text-fg">
                  {shortAddress(r.txHash, 8, 6)} <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
