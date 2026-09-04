"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { describeOperation, formatEth, isDestructive, type CleanupOperation } from "@incinerator/chain";
import { Mascot } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Sheet } from "@/components/ui/sheet";
import type { CleanupState, ExecutionMode } from "@/hooks/use-cleanup";
import { api, type SimulateResponse } from "@/lib/api";
import { activeChainName, txUrl } from "@/lib/network";
import { cn, plural } from "@/lib/utils";
import { TransactionProgress } from "./transaction-progress";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  address: `0x${string}` | undefined;
  operations: CleanupOperation[];
  /** Best mode the wallet + sponsor allow before eligibility is confirmed. */
  preferredMode: ExecutionMode;
  token: string | null;
  signIn: () => Promise<string>;
  signingIn: boolean;
  cleanup: CleanupState;
  onExecute: (mode: ExecutionMode) => Promise<void>;
  onDone: () => void;
  onQuote: (q: SimulateResponse | null) => void;
}

export function ReviewSheet({ open, onOpenChange, address, operations, preferredMode, token, signIn, signingIn, cleanup, onExecute, onDone, onQuote }: Props) {
  const [quote, setQuote] = useState<SimulateResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ack, setAck] = useState(false);
  const [mode, setMode] = useState<ExecutionMode>(preferredMode);

  const running = ["preparing", "simulating", "checking-sponsor", "signing-in", "awaiting-signature", "submitted"].includes(cleanup.stage);
  const done = cleanup.stage === "confirmed";

  useEffect(() => {
    if (!open) {
      setAck(false);
      setQuote(null);
      setQuoteError(null);
      onQuote(null);
      return;
    }
    setMode(preferredMode);
  }, [open, preferredMode, onQuote]);

  useEffect(() => {
    if (!open || !address || operations.length === 0 || running || done) return;
    let cancelled = false;
    setLoading(true);
    setQuoteError(null);
    api
      .simulate(address, operations, token)
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        onQuote(q);
        if (mode === "sponsored" && token && !q.sponsorship.eligible) {
          // Sponsor declined; fall back to the wallet's best user-paid path.
          setMode(preferredMode === "sponsored" ? "atomic" : preferredMode);
        }
      })
      .catch((e: Error) => !cancelled && setQuoteError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, address, operations, token]);

  const destructive = operations.filter((o) => isDestructive(o.kind)).length;
  const revokes = operations.length - destructive;
  const unsafeIndex = quote ? quote.simulations.findIndex((s) => s.status !== "success" || s.anomalies.length > 0) : -1;
  const sponsored = mode === "sponsored" && Boolean(token) && quote?.sponsorship.eligible === true;
  const needsSignIn = mode === "sponsored" && !token && quote?.sponsor.active;
  const cta = destructive > 0 ? `Incinerate ${plural(destructive, "asset")}${revokes ? ` · revoke ${revokes}` : ""}` : `Revoke ${plural(revokes, "approval")}`;

  const summary = useMemo(() => {
    if (!quote) return null;
    const est = formatEth(BigInt(quote.gas.costWei));
    return {
      estimated: `${est} ETH`,
      youPay: sponsored ? "0 ETH" : `${est} ETH`,
      source: sponsored ? "Creator Fee Sponsor" : "Your wallet",
    };
  }, [quote, sponsored]);

  const footer = done ? (
    <div className="flex gap-2">
      {cleanup.txHashes[0] && (
        <a href={txUrl(cleanup.txHashes[0])} target="_blank" rel="noreferrer" className="flex-1">
          <Button variant="secondary" className="w-full">
            View transaction <ExternalLink className="size-3.5" />
          </Button>
        </a>
      )}
      <Button variant="primary" className="flex-1" onClick={onDone}>
        Back to wallet
      </Button>
    </div>
  ) : cleanup.stage === "failed" ? (
    <div className="flex gap-2">
      <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
        Close
      </Button>
      <Button variant="secondary" className="flex-1" onClick={() => void onExecute(mode)}>
        Try again
      </Button>
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-snug text-fg-2">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={running} className="mt-0.5 size-4 accent-[#CCFF00]" />
        I understand these asset actions cannot be reversed.
      </label>
      {needsSignIn ? (
        <Button variant="secondary" size="lg" loading={signingIn} onClick={() => void signIn().catch(() => undefined)}>
          Sign in to confirm sponsored gas
        </Button>
      ) : null}
      <Button
        variant={destructive > 0 ? "danger" : "primary"}
        size="lg"
        disabled={!ack || loading || !quote || unsafeIndex >= 0 || Boolean(needsSignIn)}
        loading={running}
        onClick={() => void onExecute(mode).catch(() => undefined)}
      >
        {cta}
      </Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={done ? "Cleanup complete" : "Review incineration"}
      description={done ? undefined : "These actions are irreversible. Confirm that every selected asset is unwanted."}
      locked={running}
      footer={footer}
      width="lg"
    >
      {done && cleanup.result ? (
        <CompleteView state={cleanup} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <Pill tone={sponsored ? "accent" : "neutral"}>{sponsored ? "Free burn · gas sponsored" : "Standard burn"}</Pill>
            {quote && !sponsored && quote.sponsorship.code && quote.sponsor.active && (
              <span className="text-[11.5px] text-fg-3" title={quote.sponsorship.reason}>
                {quote.sponsorship.code === "UNAUTHENTICATED" ? "Sign in to check sponsorship" : `Sponsor: ${quote.sponsorship.reason ?? quote.sponsorship.code}`}
              </span>
            )}
          </div>

          <ol className="flex flex-col divide-y divide-hairline rounded-[14px] border border-hairline bg-glass-1">
            {operations.map((op, i) => {
              const sim = quote?.simulations[i];
              const bad = sim && (sim.status !== "success" || sim.anomalies.length > 0);
              return (
                <li key={`${op.kind}:${op.token}:${op.tokenId ?? ""}:${op.spender ?? ""}`} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-fg">{op.label?.title ?? op.token}</div>
                    <div className="tnum truncate text-[12px] text-fg-3">{op.label?.subtitle}</div>
                    {bad && (
                      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-danger">
                        <AlertTriangle className="size-3.5" />
                        {sim.revertReason ?? sim.anomalies[0] ?? "Non-standard token"}
                      </div>
                    )}
                  </div>
                  <div className={cn("shrink-0 text-right text-[12px]", isDestructive(op.kind) ? "text-danger" : "text-fg-2")}>
                    {describeOperation(op.kind)}
                    {sim && !bad && <div className="tnum text-[11px] text-fg-3">{Number(sim.gasUsed).toLocaleString()} gas</div>}
                  </div>
                </li>
              );
            })}
          </ol>

          {unsafeIndex >= 0 && (
            <div className="rounded-[12px] border border-[rgba(255,98,93,0.28)] bg-danger-glass p-3.5 text-[12.5px] leading-relaxed text-fg-2">
              <div className="font-medium text-danger">Non-standard token</div>
              Operation {unsafeIndex + 1} could not be safely simulated. Deselect it to continue.
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-[14px] border border-hairline bg-glass-1 p-4 text-[13px]">
            <Row k="Network" v={activeChainName} />
            <Row k="Estimated gas" v={loading || !summary ? <span className="skeleton inline-block h-4 w-20" /> : summary.estimated} />
            <Row k="You pay" v={loading || !summary ? <span className="skeleton inline-block h-4 w-14" /> : summary.youPay} accent={sponsored} />
            <Row k="Gas source" v={loading || !summary ? <span className="skeleton inline-block h-4 w-24" /> : summary.source} />
          </dl>

          {quoteError && <p className="text-[12.5px] text-danger">{quoteError}</p>}

          {(running || cleanup.stage === "failed") && <TransactionProgress state={cleanup} />}
        </div>
      )}
    </Sheet>
  );
}

function Row({ k, v, accent }: { k: string; v: React.ReactNode; accent?: boolean }) {
  return (
    <div className="contents">
      <dt className="label-xs self-center">{k}</dt>
      <dd className={cn("tnum text-right font-medium", accent ? "text-accent" : "text-fg")}>{v}</dd>
    </div>
  );
}

function CompleteView({ state }: { state: CleanupState }) {
  const r = state.result!;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center rounded-[16px] border border-[rgba(204,255,0,0.25)] bg-accent-glass p-5 text-center">
        <Mascot art="fire" size={150} alt="" />
        <div className="label-xs mt-1 text-accent">Cleanup complete</div>
        <dl className="mt-4 grid w-full grid-cols-3 gap-4">
          <Metric label="Assets removed" value={r.removed} />
          <Metric label="Approvals revoked" value={r.revoked} />
          <Metric label="Gas paid" value={r.sponsored ? "0 ETH" : "By you"} />
        </dl>
      </div>
      <TransactionProgress state={state} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-left">
      <dt className="label-xs">{label}</dt>
      <dd className="tnum mt-1 text-[22px] font-medium tracking-[-0.02em] text-fg">{value}</dd>
    </div>
  );
}
