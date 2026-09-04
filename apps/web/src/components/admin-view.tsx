"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { api } from "@/lib/api";

const KEY = "incinerator.admin";

export function AdminView() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limitKey, setLimitKey] = useState("MAX_GAS_PER_CALL");
  const [limitValue, setLimitValue] = useState("");
  const [denyAddr, setDenyAddr] = useState("");
  const [denyReason, setDenyReason] = useState("");

  useEffect(() => setToken(sessionStorage.getItem(KEY) ?? ""), []);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const [status, inspect] = await Promise.all([api.admin.get("status", token), api.admin.get("inspect", token)]);
      setData({ status, inspect });
      sessionStorage.setItem(KEY, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }, [token]);

  const act = async (action: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await api.admin.post(action, body, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  };

  const status = (data?.status as { status?: { state: string; reason: string; spend: Record<string, string> } } | undefined)?.status;
  const inspect = data?.inspect as { paused: boolean; overrides: Record<string, string>; sponsored: unknown[]; failedSimulations: unknown[]; refills: unknown[]; denylist: { address: string; reason: string | null }[] } | undefined;

  return (
    <div className="flex flex-col gap-4">
      <Panel level={1} radius="lg" className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-1 flex-col gap-1 text-[11px] uppercase tracking-[0.12em] text-fg-3">
          Admin token
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className="h-10 rounded-[9px] border border-hairline bg-glass-1 px-3 text-[13px] normal-case tracking-normal text-fg" />
        </label>
        <Button variant="secondary" onClick={() => void load()} loading={busy} disabled={!token}>
          Load
        </Button>
      </Panel>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
      {status && inspect && (
        <>
          <Panel level={1} radius="lg" className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="label-xs">Sponsorship</div>
              <div className="mt-1 text-[16px] font-medium">{status.state}</div>
              <div className="text-[12px] text-fg-3">{status.reason}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={() => void act("pause", {})} disabled={inspect.paused}>
                Pause
              </Button>
              <Button variant="primary" size="sm" onClick={() => void act("resume", {})} disabled={!inspect.paused}>
                Resume
              </Button>
            </div>
          </Panel>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel level={1} radius="lg" className="p-4">
              <div className="label-xs">Policy override</div>
              <div className="mt-3 flex gap-2">
                <input value={limitKey} onChange={(e) => setLimitKey(e.target.value)} className="h-10 min-w-0 flex-1 rounded-[9px] border border-hairline bg-glass-1 px-3 font-mono text-[12px]" />
                <input value={limitValue} onChange={(e) => setLimitValue(e.target.value)} placeholder="value or default" className="h-10 w-[140px] rounded-[9px] border border-hairline bg-glass-1 px-3 font-mono text-[12px]" />
                <Button size="sm" onClick={() => void act("limits", { [limitKey]: limitValue })}>
                  Set
                </Button>
              </div>
              <pre className="mt-3 max-h-40 overflow-auto text-[11px] text-fg-3">{JSON.stringify(inspect.overrides, null, 2)}</pre>
            </Panel>
            <Panel level={1} radius="lg" className="p-4">
              <div className="label-xs">Denylist contract</div>
              <div className="mt-3 flex gap-2">
                <input value={denyAddr} onChange={(e) => setDenyAddr(e.target.value)} placeholder="0x…" className="h-10 min-w-0 flex-1 rounded-[9px] border border-hairline bg-glass-1 px-3 font-mono text-[12px]" />
                <input value={denyReason} onChange={(e) => setDenyReason(e.target.value)} placeholder="reason" className="h-10 w-[140px] rounded-[9px] border border-hairline bg-glass-1 px-3 text-[12px]" />
                <Button size="sm" variant="danger" onClick={() => void act("denylist", { address: denyAddr, reason: denyReason || null, ttlHours: null })}>
                  Deny
                </Button>
              </div>
              <ul className="mt-3 max-h-40 overflow-auto text-[11.5px] text-fg-2">
                {inspect.denylist.map((d) => (
                  <li key={d.address} className="flex items-center justify-between gap-2 py-1 font-mono">
                    <span>{d.address}</span>
                    <button className="text-fg-3 hover:text-fg" onClick={() => void act("undeny", { address: d.address })}>
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <Section title="Sponsored operations" data={inspect.sponsored} />
          <Section title="Failed simulations" data={inspect.failedSimulations} />
          <Section title="Refills" data={inspect.refills} />
        </>
      )}
    </div>
  );
}

function Section({ title, data }: { title: string; data: unknown }) {
  return (
    <Panel level={1} radius="lg" className="p-4">
      <div className="label-xs">{title}</div>
      <pre className="scrollbar-thin mt-3 max-h-64 overflow-auto text-[11px] leading-relaxed text-fg-3">{JSON.stringify(data, null, 2)}</pre>
    </Panel>
  );
}
