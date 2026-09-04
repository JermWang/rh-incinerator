import type { Address, Hex } from "viem";
import type { CleanupOperation, ScanResult, SimulatedCall } from "@incinerator/chain";
import type { SponsorStatus, TrackedStatus } from "@incinerator/sponsor";

/** Typed client for the app's own API. All bigints travel as decimal strings. */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string> | undefined) };
  if (rest.body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...rest, headers, cache: "no-store" });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const api = {
  scan: (address: Address) => request<ScanResult>("/api/scan", { method: "POST", body: JSON.stringify({ address }) }),

  simulate: (address: Address, operations: CleanupOperation[], token: string | null) =>
    request<SimulateResponse>("/api/simulate", { method: "POST", body: JSON.stringify({ address, operations }), token }),

  sponsorStatus: () => request<SponsorStatus>("/api/sponsor/status"),

  nonce: () => request<{ nonce: string; chainId: number; domain: string }>("/api/session/nonce"),

  verify: (message: string, signature: Hex) =>
    request<{ token: string; address: Address; exp: number; chainId: number }>("/api/session/verify", {
      method: "POST",
      body: JSON.stringify({ message, signature }),
    }),

  transaction: (hash: string) => request<TrackedStatus>(`/api/transaction/${hash}`),

  transparency: () => request<TransparencyResponse>("/api/transparency"),

  recordCleanup: (record: CleanupRecordInput, token: string | null) =>
    request<{ ok: true }>("/api/cleanups", { method: "POST", body: JSON.stringify(record), token }),

  cleanups: (wallet: Address) => request<{ items: CleanupHistoryItem[] }>(`/api/cleanups?wallet=${wallet}`),

  admin: {
    get: (action: "status" | "inspect", token: string) => request<unknown>(`/api/admin/${action}`, { token }),
    post: (action: string, body: unknown, token: string) =>
      request<unknown>(`/api/admin/${action}`, { method: "POST", body: JSON.stringify(body), token }),
  },
};

export interface SimulateResponse {
  simulations: SimulatedCall[];
  allSafe: boolean;
  gas: { units: string; priceWei: string; costWei: string };
  sponsor: { state: SponsorStatus["state"]; active: boolean; backend: SponsorStatus["backend"] };
  sponsorship: { eligible: boolean; code?: string; reason?: string; index?: number };
}

export interface CleanupRecordInput {
  id: string;
  wallet: Address;
  txHash: Hex | null;
  userOpHash: Hex | null;
  kinds: CleanupOperation["kind"][];
  sponsored: boolean;
  status: "SUBMITTED" | "CONFIRMED" | "FAILED";
}

export interface CleanupHistoryItem {
  id: string;
  chainId: number;
  wallet: Address;
  txHash: Hex | null;
  userOpHash: Hex | null;
  kinds: string[];
  sponsored: boolean;
  status: "SUBMITTED" | "CONFIRMED" | "FAILED";
  createdAt: number;
}

export interface TransparencyResponse {
  chainId: number;
  deployed: boolean;
  status: SponsorStatus;
  metrics: { gas24hWei: string; ops24h: number; lifetimeGasWei: string; lifetimeOps: number };
  reserveBalanceWei: string | null;
  hotBalanceWei: string | null;
  lastRefill: RefillItem | null;
  refills: RefillItem[];
  contracts: Record<"entryPoint" | "paymaster" | "sponsorReserve" | "feeRouter" | "treasury", { address: string; url: string } | null>;
  generatedAt: number;
}

export interface RefillItem {
  txHash: string;
  amountWei: string;
  hotBalanceAfter: string;
  blockNumber: number;
  timestamp: number;
  url: string;
}
