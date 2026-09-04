"use client";

import { useCallback, useMemo, useState } from "react";
import type { Address } from "viem";
import type { ApprovalItem, CleanupOperation, NftAsset, ScanResult, TokenAsset } from "@incinerator/chain";

export type SelectionKey = string;

export const tokenKey = (t: TokenAsset): SelectionKey => `token:${t.address.toLowerCase()}`;
export const nftKey = (n: NftAsset): SelectionKey => `nft:${n.address.toLowerCase()}:${n.tokenId}`;
export const approvalKey = (a: ApprovalItem): SelectionKey => `approval:${a.id}`;

/**
 * Selection state. Nothing is ever pre-selected. Protected assets require an
 * explicit override per asset before they can be selected at all.
 */
export function useSelection(scan: ScanResult | undefined, owner: Address | undefined) {
  const [selected, setSelected] = useState<Set<SelectionKey>>(() => new Set());
  const [overrides, setOverrides] = useState<Set<SelectionKey>>(() => new Set());

  const toggle = useCallback((key: SelectionKey) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setMany = useCallback((keys: SelectionKey[], on: boolean) => {
    setSelected((s) => {
      const next = new Set(s);
      for (const k of keys) on ? next.add(k) : next.delete(k);
      return next;
    });
  }, []);

  const unlock = useCallback((key: SelectionKey) => setOverrides((o) => new Set(o).add(key)), []);
  const clear = useCallback(() => setSelected(new Set()), []);

  const operations = useMemo<CleanupOperation[]>(() => {
    if (!scan || !owner) return [];
    const ops: CleanupOperation[] = [];
    for (const t of scan.tokens) {
      if (!selected.has(tokenKey(t)) || t.mechanism === "UNSUPPORTED" || t.mechanism === "UNKNOWN") continue;
      ops.push({
        kind: t.mechanism === "BURNABLE" ? "ERC20_BURN" : "ERC20_DEAD",
        token: t.address,
        owner,
        amount: t.balance,
        label: { title: t.symbol, subtitle: `${t.balanceFormatted} ${t.symbol}` },
      });
    }
    for (const n of scan.nfts) {
      if (!selected.has(nftKey(n)) || n.mechanism === "UNSUPPORTED" || n.mechanism === "UNKNOWN") continue;
      const burn = n.mechanism === "BURNABLE";
      const label = { title: `${n.collectionName} #${n.tokenId}`, subtitle: n.standard === "ERC1155" ? `${n.amount} units` : "Token" };
      if (n.standard === "ERC1155") {
        ops.push({ kind: burn ? "ERC1155_BURN" : "ERC1155_DEAD", token: n.address, owner, tokenId: n.tokenId, amount: n.amount, label });
      } else {
        ops.push({ kind: burn ? "ERC721_BURN" : "ERC721_DEAD", token: n.address, owner, tokenId: n.tokenId, label });
      }
    }
    for (const a of scan.approvals) {
      if (!selected.has(approvalKey(a))) continue;
      const label = { title: `${a.asset.symbol} approval`, subtitle: `Revoke approval to ${a.spender.slice(0, 6)}…${a.spender.slice(-4)}` };
      if (a.kind === "ERC20_ALLOWANCE") ops.push({ kind: "ERC20_REVOKE", token: a.asset.address, owner, spender: a.spender, label });
      else if (a.kind === "ERC721_TOKEN") ops.push({ kind: "ERC721_REVOKE", token: a.asset.address, owner, tokenId: a.tokenId!, label });
      else ops.push({ kind: "OPERATOR_REVOKE", token: a.asset.address, owner, spender: a.spender, label });
    }
    return ops;
  }, [scan, owner, selected]);

  const counts = useMemo(() => {
    let tokens = 0;
    let nfts = 0;
    let approvals = 0;
    for (const k of selected) {
      if (k.startsWith("token:")) tokens++;
      else if (k.startsWith("nft:")) nfts++;
      else approvals++;
    }
    return { tokens, nfts, approvals, total: tokens + nfts + approvals };
  }, [selected]);

  return { selected, overrides, toggle, setMany, unlock, clear, operations, counts };
}
