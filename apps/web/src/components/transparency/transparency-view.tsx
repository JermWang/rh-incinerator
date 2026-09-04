"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { formatEth, shortAddress } from "@incinerator/chain";
import { StatusDot } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { api } from "@/lib/api";
import { activeChainName } from "@/lib/network";
import { timeAgo } from "@/lib/utils";

export function TransparencyView() {
  const q = useQuery({ queryKey: ["transparency"], queryFn: api.transparency, refetchInterval: 30_000 });
  const d = q.data;
  const eth = (wei: string | null | undefined) => (wei === null || wei === undefined ? "—" : `${formatEth(BigInt(wei))} ETH`);

  return (
    <div className="flex flex-col gap-8">
      {d && !d.deployed && (
        <Panel level={1} radius="lg" className="border-[rgba(255,200,87,0.28)] p-4 text-[13px] text-fg-2">
          Sponsor contracts are not deployed on {activeChainName} yet. On-chain figures below are unavailable until deployment; nothing is estimated in their place.
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sponsor reserve" value={eth(d?.reserveBalanceWei)} loading={q.isLoading} hint="SponsorReserve balance" />
        <Stat label="Operational sponsor balance" value={eth(d?.hotBalanceWei)} loading={q.isLoading} hint="Paymaster EntryPoint deposit" />
        <Stat label="24h gas sponsored" value={eth(d?.metrics.gas24hWei)} loading={q.isLoading} />
        <Stat label="24h cleanups" value={d?.metrics.ops24h ?? "—"} loading={q.isLoading} />
        <Stat label="Lifetime gas sponsored" value={eth(d?.metrics.lifetimeGasWei)} loading={q.isLoading} />
        <Stat
          label="Sponsorship status"
          value={
            d ? (
              <span className="flex items-center gap-2 text-[16px]">
                <StatusDot tone={d.status.active ? "accent" : "warn"} pulse={d.status.active} />
                {d.status.state.replace(/_/g, " ")}
              </span>
            ) : (
              "—"
            )
          }
          loading={q.isLoading}
          hint={d?.status.reason}
        />
        <Stat label="Last sponsor refill" value={d?.lastRefill ? eth(d.lastRefill.amountWei) : "—"} loading={q.isLoading} hint={d?.lastRefill ? timeAgo(d.lastRefill.timestamp) : "No refills recorded"} />
        <Stat label="Hourly budget used" value={d ? `${formatEth(BigInt(d.status.spend.hourWei))} / ${formatEth(BigInt(d.status.spend.hourLimitWei))}` : "—"} loading={q.isLoading} hint="ETH, reserved + settled" />
      </div>

      <Panel level={1} radius="xl" className="p-5 md:p-6">
        <div className="label-xs">Architecture</div>
        <ol className="mt-4 grid gap-2 md:grid-cols-5">
          {[
            ["Creator fees", "Pons launches"],
            ["Treasury", "Cold, multisig / hardware"],
            ["Limited sponsor allocation", "SponsorReserve, capped refills"],
            ["Gas sponsor", "Paymaster deposit"],
            ["Eligible cleanup transactions", "Policy-approved only"],
          ].map(([t, s], i) => (
            <li key={t} className="relative rounded-[12px] border border-hairline bg-glass-1 p-3.5">
              <div className="tnum text-[10.5px] text-fg-3">0{i + 1}</div>
              <div className="mt-1 text-[13px] font-medium text-fg">{t}</div>
              <div className="mt-0.5 text-[11.5px] text-fg-3">{s}</div>
              {i < 4 && <span aria-hidden className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-fg-3 md:block">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
          {d?.deployed
            ? "The Incinerator sponsor cannot withdraw funds from the creator treasury. ETH leaves the SponsorReserve only toward the paymaster deposit or back to the immutable treasury."
            : "Once deployed, the SponsorReserve contract enforces that ETH leaves only toward the paymaster deposit or back to the immutable treasury."}
        </p>
      </Panel>

      <Panel level={1} radius="xl" className="p-5 md:p-6">
        <div className="label-xs">Contracts</div>
        <dl className="mt-3 divide-y divide-hairline">
          {d &&
            (Object.entries(d.contracts) as [string, { address: string; url: string } | null][]).map(([name, c]) => (
              <div key={name} className="flex items-center justify-between py-2.5 text-[13px]">
                <dt className="capitalize text-fg-2">{name.replace(/([A-Z])/g, " $1")}</dt>
                <dd className="tnum font-mono">
                  {c ? (
                    <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-fg hover:text-accent">
                      {shortAddress(c.address, 8, 6)} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <span className="text-fg-3">Not deployed</span>
                  )}
                </dd>
              </div>
            ))}
        </dl>
      </Panel>

      {d && d.refills.length > 0 && (
        <Panel level={1} radius="xl" className="p-5 md:p-6">
          <div className="label-xs">Refill history</div>
          <ul className="mt-3 divide-y divide-hairline">
            {d.refills.map((r) => (
              <li key={r.txHash} className="flex items-center justify-between py-2.5 text-[13px]">
                <a href={r.url} target="_blank" rel="noreferrer" className="tnum inline-flex items-center gap-1.5 font-mono text-fg-2 hover:text-fg">
                  {shortAddress(r.txHash, 10, 6)} <ExternalLink className="size-3" />
                </a>
                <span className="tnum text-fg">{formatEth(BigInt(r.amountWei))} ETH</span>
                <span className="text-fg-3">{timeAgo(r.timestamp)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {q.error && <p className="text-[12.5px] text-danger">{q.error.message}</p>}
    </div>
  );
}
