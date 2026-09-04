"use client";

import { RefreshCw, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useConnection } from "wagmi";
import type { CleanupOperation } from "@incinerator/chain";
import { Mascot } from "@/components/brand";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Stat } from "@/components/ui/stat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectButton } from "@/components/wallet/connect-button";
import { NetworkGuard } from "@/components/wallet/network-guard";
import { useAccountCapabilities } from "@/hooks/use-capabilities";
import { useCleanup, type ExecutionMode } from "@/hooks/use-cleanup";
import { useScan } from "@/hooks/use-scan";
import { approvalKey, nftKey, tokenKey, useSelection } from "@/hooks/use-selection";
import { useSession } from "@/hooks/use-session";
import { useSponsorStatus } from "@/hooks/use-sponsor-status";
import type { SimulateResponse } from "@/lib/api";
import { ACTIVE_CHAIN_ID } from "@/lib/network";
import { cn, plural } from "@/lib/utils";
import { ApprovalRow } from "./approval-row";
import { NftCard } from "./nft-card";
import { ReviewSheet } from "./review-sheet";
import { TokenRow } from "./token-row";
import { VirtualList } from "./virtual-list";

export function Dashboard() {
  const { address, isConnected, chainId } = useConnection();
  const caps = useAccountCapabilities();
  const sponsor = useSponsorStatus();
  const session = useSession();
  const onChain = isConnected && chainId === ACTIVE_CHAIN_ID;
  const scan = useScan(address, onChain);
  const sel = useSelection(scan.data, address);
  const cleanup = useCleanup();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [quote, setQuote] = useState<SimulateResponse | null>(null);
  const [filter, setFilter] = useState("");
  const reduce = useReducedMotion();

  const sponsorActive = sponsor.data?.active ?? false;
  const sponsorPossible = caps.paymaster && sponsorActive;
  const preferredMode: ExecutionMode = sponsorPossible ? "sponsored" : caps.atomic ? "atomic" : "sequential";

  const tokens = useMemo(() => {
    const list = scan.data?.tokens ?? [];
    const q = filter.trim().toLowerCase();
    return q ? list.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)) : list;
  }, [scan.data, filter]);

  const onExecute = useCallback(
    async (mode: ExecutionMode) => {
      await cleanup.execute({ operations: sel.operations, mode, ensureSession: session.signIn, existingToken: session.token });
    },
    [cleanup, sel.operations, session.signIn, session.token],
  );

  const onDone = useCallback(() => {
    setReviewOpen(false);
    cleanup.reset();
    sel.clear();
    void scan.refetch();
  }, [cleanup, sel, scan]);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-[1180px] px-4 py-14 md:px-6">
        <Panel level={2} className="mx-auto flex max-w-[520px] flex-col items-center p-8 text-center">
          <Mascot art="torch" size={168} priority alt="" />
          <h1 className="mt-4 text-[24px] font-medium tracking-[-0.02em]">Connect to scan your wallet</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">
            Incinerator reads your balances and approvals, simulates every operation, and only ever asks you to sign cleanup calls.
          </p>
          <div className="mt-6">
            <ConnectButton size="lg" />
          </div>
        </Panel>
      </div>
    );
  }

  const assetsFound = (scan.data?.tokens.length ?? 0) + (scan.data?.nfts.length ?? 0);
  const p = scan.data?.partial;
  const partialScan = Boolean(p && !(p.tokens && p.nfts && p.approvals));
  const yourGas = quote ? (quote.sponsorship.eligible ? "0 ETH" : "Standard") : sponsorPossible ? "—" : "Standard";
  const yourGasHint = quote
    ? quote.sponsorship.eligible
      ? "Sponsored"
      : "Paid by you"
    : sponsorPossible
      ? "Confirmed at review"
      : caps.loading
        ? "Checking wallet"
        : "Paid by you";

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-32 pt-8 md:px-6 md:pb-16 md:pt-10">
      <NetworkGuard>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[26px] font-medium tracking-[-0.02em] md:text-[30px]">Wallet cleanup</h1>
            <p className="mt-1.5 text-[13.5px] text-fg-2">Review assets before permanently removing them.</p>
          </div>
          <div className="flex items-center gap-2">
            <CapabilityPill loading={caps.loading} path={caps.path} sponsorActive={sponsorActive} />
            <Button variant="ghost" size="sm" onClick={() => void scan.refetch()} loading={scan.isFetching} aria-label="Rescan wallet">
              <RefreshCw className="size-3.5" /> Rescan
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat testId="stat-assets-found" label="Assets found" value={assetsFound} loading={scan.isLoading} hint={partialScan ? "Scan incomplete" : undefined} />
          <Stat testId="stat-selected" label="Selected" value={sel.counts.total} tone={sel.counts.total > 0 ? "accent" : "neutral"} />
          <Stat testId="stat-your-gas" label="Your gas" value={yourGas} tone={quote?.sponsorship.eligible ? "accent" : "neutral"} hint={yourGasHint} />
        </div>

        {scan.error && (
          <Panel level={1} radius="lg" className="mt-4 border-[rgba(255,98,93,0.28)] p-4 text-[13px] text-fg-2">
            <span className="text-danger">Scan failed.</span> {scan.error.message}{" "}
            <button className="underline underline-offset-2" onClick={() => void scan.refetch()}>
              Retry
            </button>
          </Panel>
        )}
        {scan.data?.errors.length ? (
          <Panel level={1} radius="lg" className="mt-4 p-3.5 text-[12.5px] text-fg-3">
            Some data could not be loaded ({scan.data.errors.join("; ")}). Everything shown is verified on-chain. Rescan to retry.
          </Panel>
        ) : null}

        <Tabs defaultValue="tokens" className="mt-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <TabsList>
              <TabsTrigger value="tokens" count={scan.data?.tokens.length}>
                Tokens
              </TabsTrigger>
              <TabsTrigger value="nfts" count={scan.data?.nfts.length}>
                NFTs
              </TabsTrigger>
              <TabsTrigger value="approvals" count={scan.data?.approvals.length}>
                Approvals
              </TabsTrigger>
            </TabsList>
            <label className="relative md:mb-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter"
                aria-label="Filter assets"
                className="h-9 w-full rounded-[9px] border border-hairline bg-glass-1 pl-9 pr-3 text-[13px] text-fg placeholder:text-fg-3 focus:border-hairline-2 md:w-[200px]"
              />
            </label>
          </div>

          <TabsContent value="tokens" className="mt-4 outline-none">
            <SelectionBar
              label="tokens"
              selectable={tokens.filter((t) => (t.mechanism === "BURNABLE" || t.mechanism === "SEND_TO_DEAD") && (!t.protectedAsset || sel.overrides.has(tokenKey(t)))).map(tokenKey)}
              selected={sel.selected}
              setMany={sel.setMany}
            />
            {scan.isLoading ? (
              <RowSkeleton />
            ) : tokens.length === 0 ? (
              <Empty text={filter ? "No tokens match that filter." : "No ERC-20 balances found. Nothing to clean up here."} />
            ) : tokens.length > 60 ? (
              <VirtualList
                items={tokens}
                keyOf={(t) => t.address}
                render={(t) => (
                  <TokenRow token={t} selected={sel.selected.has(tokenKey(t))} unlocked={sel.overrides.has(tokenKey(t))} sponsorPossible={sponsorPossible} onToggle={() => sel.toggle(tokenKey(t))} onUnlock={() => sel.unlock(tokenKey(t))} />
                )}
              />
            ) : (
              <motion.div className="flex flex-col gap-2" initial={reduce ? false : "hidden"} animate="show" variants={{ show: { transition: { staggerChildren: 0.02 } } }}>
                {tokens.map((t) => (
                  <motion.div key={t.address} variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0, transition: { duration: 0.18 } } }}>
                    <TokenRow token={t} selected={sel.selected.has(tokenKey(t))} unlocked={sel.overrides.has(tokenKey(t))} sponsorPossible={sponsorPossible} onToggle={() => sel.toggle(tokenKey(t))} onUnlock={() => sel.unlock(tokenKey(t))} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="nfts" className="mt-4 outline-none">
            <SelectionBar
              label="NFTs"
              selectable={(scan.data?.nfts ?? []).filter((n) => (n.mechanism === "BURNABLE" || n.mechanism === "SEND_TO_DEAD") && (!n.protectedAsset || sel.overrides.has(nftKey(n)))).map(nftKey)}
              selected={sel.selected}
              setMany={sel.setMany}
            />
            {scan.isLoading ? (
              <RowSkeleton />
            ) : !scan.data?.nfts.length ? (
              <Empty text="No NFTs found." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {scan.data.nfts.map((n) => (
                  <NftCard key={nftKey(n)} nft={n} selected={sel.selected.has(nftKey(n))} unlocked={sel.overrides.has(nftKey(n))} onToggle={() => sel.toggle(nftKey(n))} onUnlock={() => sel.unlock(nftKey(n))} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="approvals" className="mt-4 outline-none">
            <SelectionBar label="approvals" selectable={(scan.data?.approvals ?? []).map(approvalKey)} selected={sel.selected} setMany={sel.setMany} />
            {scan.isLoading ? (
              <RowSkeleton />
            ) : !scan.data?.approvals.length ? (
              <Empty text="No active approvals found. Nothing can spend on your behalf." />
            ) : (
              <div className="flex flex-col gap-2">
                {scan.data.approvals.map((a) => (
                  <ApprovalRow key={a.id} item={a} selected={sel.selected.has(approvalKey(a))} onToggle={() => sel.toggle(approvalKey(a))} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <AnimatePresence>
          {sel.counts.total > 0 && (
            <motion.div
              className="fixed inset-x-0 bottom-0 z-30 md:bottom-6"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              transition={{ duration: 0.18 }}
            >
              <div className="mx-auto max-w-[1180px] px-0 md:px-6">
                <div className="flex items-center justify-between gap-4 border-t border-hairline-2 bg-bg-1/95 px-4 py-3 backdrop-blur-xl md:mx-auto md:max-w-[520px] md:rounded-[16px] md:border md:px-5 md:shadow-[0_24px_64px_-24px_rgba(0,0,0,0.9)]">
                  <div>
                    <div className="tnum text-[13px] font-medium uppercase tracking-[0.12em] text-fg">{sel.counts.total} selected</div>
                    <div className="text-[11.5px] text-fg-3">{sponsorPossible ? <span className="text-accent">Gas sponsored if eligible</span> : "Gas paid by you"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={sel.clear}>
                      Clear
                    </Button>
                    <Button variant="primary" size="md" onClick={() => setReviewOpen(true)} disabled={sel.operations.length === 0}>
                      Review
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ReviewSheet
          open={reviewOpen}
          onOpenChange={(o) => {
            setReviewOpen(o);
            if (!o && cleanup.state.stage === "failed") cleanup.reset();
          }}
          address={address}
          operations={sel.operations as CleanupOperation[]}
          preferredMode={preferredMode}
          token={session.token}
          signIn={session.signIn}
          signingIn={session.signingIn}
          cleanup={cleanup.state}
          onExecute={onExecute}
          onDone={onDone}
          onQuote={setQuote}
        />
      </NetworkGuard>
    </div>
  );
}

function CapabilityPill({ loading, path, sponsorActive }: { loading: boolean; path: "sponsored-capable" | "atomic" | "legacy"; sponsorActive: boolean }) {
  if (loading) return <Pill tone="neutral">Checking wallet</Pill>;
  if (path === "sponsored-capable" && sponsorActive) return <Pill tone="accent">Free burn · gas sponsored</Pill>;
  if (path === "sponsored-capable") return <Pill tone="neutral">Smart account · sponsor unavailable</Pill>;
  if (path === "atomic") return <Pill tone="neutral">Standard burn · batched</Pill>;
  return <Pill tone="neutral">Standard burn</Pill>;
}

function SelectionBar({ label, selectable, selected, setMany }: { label: string; selectable: string[]; selected: Set<string>; setMany: (k: string[], on: boolean) => void }) {
  const allOn = selectable.length > 0 && selectable.every((k) => selected.has(k));
  if (selectable.length === 0) return null;
  return (
    <div className="mb-3 flex items-center justify-between text-[12px] text-fg-3">
      <span>{plural(selectable.length, `selectable ${label.replace(/s$/, "")}`, `selectable ${label}`)}</span>
      <button className="uppercase tracking-[0.1em] hover:text-fg-2" onClick={() => setMany(selectable, !allOn)}>
        {allOn ? "Deselect all" : "Select all eligible"}
      </button>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn("flex items-center gap-4 rounded-[14px] border border-hairline bg-glass-1 px-4 py-3")}>
          <div className="skeleton size-[18px] rounded-[5px]" />
          <div className="skeleton size-9 rounded-full" />
          <div className="flex-1">
            <div className="skeleton h-3.5 w-28" />
            <div className="skeleton mt-2 h-3 w-40" />
          </div>
          <div className="skeleton h-4 w-20" />
        </div>
      ))}
      <p className="mt-2 text-center text-[12px] uppercase tracking-[0.14em] text-fg-3">Scanning Robinhood Chain</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-hairline px-4 py-10 text-center">
      <Mascot art="head" size={78} className="opacity-70" />
      <p className="max-w-[320px] text-[13px] text-fg-3">{text}</p>
    </div>
  );
}
