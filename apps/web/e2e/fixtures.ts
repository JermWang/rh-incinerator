import type { Page, Route } from "@playwright/test";

/**
 * End-to-end fixtures.
 *
 * - A mock EIP-1193 / EIP-6963 wallet injected before page scripts run.
 * - The public Robinhood Chain RPC is intercepted at the network layer.
 * - The app's own /api routes are intercepted with deterministic fixtures so
 *   the UI is exercised without touching the live chain.
 */

export const WALLET = "0x1000000000000000000000000000000000000001";
export const TX_HASH = "0x" + "ab".repeat(32);
export const CHAIN_HEX = "0xb626"; // 46630

export interface WalletOptions {
  /** Initial chain the mock wallet is on. Default: Ethereum mainnet to exercise the network guard. */
  initialChainId?: string;
  /** Advertise EIP-5792 capabilities for chain 46630. */
  capabilities?: { paymasterService?: boolean; atomic?: boolean } | null;
  /** Make eth_sendTransaction reject (user rejection). */
  rejectSend?: boolean;
  /** Receipt status for mined transactions. */
  receiptStatus?: "0x1" | "0x0";
}

export function mockWalletScript(opts: WalletOptions = {}): string {
  const config = JSON.stringify({
    initialChainId: opts.initialChainId ?? "0x1",
    capabilities: opts.capabilities ?? null,
    rejectSend: opts.rejectSend ?? false,
    wallet: WALLET,
    chainHex: CHAIN_HEX,
    txHash: TX_HASH,
  });
  return `
(() => {
  const cfg = ${config};
  const listeners = {};
  let chainId = cfg.initialChainId;
  let connected = false;
  let sent = [];
  let calls = [];
  const emit = (ev, ...args) => (listeners[ev] || []).forEach((l) => l(...args));
  const provider = {
    isMetaMask: false,
    isMockWallet: true,
    on(ev, l) { (listeners[ev] ||= []).push(l); return provider; },
    removeListener(ev, l) { listeners[ev] = (listeners[ev] || []).filter((x) => x !== l); return provider; },
    async request({ method, params }) {
      window.__mockRequests = window.__mockRequests || [];
      window.__mockRequests.push({ method, params });
      switch (method) {
        case "eth_requestAccounts": connected = true; emit("connect", { chainId }); return [cfg.wallet];
        case "eth_accounts": return connected ? [cfg.wallet] : [];
        case "eth_chainId": return chainId;
        case "net_version": return String(parseInt(chainId, 16));
        case "wallet_switchEthereumChain": chainId = params[0].chainId; emit("chainChanged", chainId); return null;
        case "wallet_addEthereumChain": chainId = params[0].chainId; emit("chainChanged", chainId); return null;
        case "wallet_getCapabilities": {
          if (!cfg.capabilities) { const e = new Error("Method not supported"); e.code = -32601; throw e; }
          const caps = {};
          if (cfg.capabilities.paymasterService) caps.paymasterService = { supported: true };
          if (cfg.capabilities.atomic) caps.atomic = { status: "supported" };
          return { [cfg.chainHex]: caps };
        }
        case "eth_getTransactionCount": return "0x1";
        case "eth_estimateGas": return "0x186a0";
        case "eth_gasPrice": return "0x989680";
        case "eth_maxPriorityFeePerGas": return "0x0";
        case "eth_getBlockByNumber": return { number: "0x1", baseFeePerGas: "0x989680", gasLimit: "0x4000000000000", timestamp: "0x6b000000", hash: "0x" + "11".repeat(32), transactions: [] };
        case "eth_sendTransaction": {
          if (cfg.rejectSend) { const e = new Error("User rejected the request."); e.code = 4001; throw e; }
          sent.push(params[0]);
          window.__mockSent = sent;
          const h = cfg.txHash.slice(0, -2) + (sent.length).toString(16).padStart(2, "0");
          return h;
        }
        case "wallet_sendCalls": {
          calls.push(params[0]);
          window.__mockCalls = calls;
          return { id: "0x" + "cc".repeat(32) };
        }
        case "wallet_getCallsStatus": return { version: "2.0.0", id: params[0], chainId: cfg.chainHex, status: 200, atomic: true, receipts: [{ transactionHash: cfg.txHash, blockNumber: "0x10", blockHash: "0x" + "22".repeat(32), gasUsed: "0x5208", status: "0x1", logs: [] }] };
        case "personal_sign": return "0x" + "ab".repeat(64) + "1b";
        default: { const e = new Error("Unsupported method " + method); e.code = -32601; throw e; }
      }
    },
  };
  window.ethereum = provider;
  const info = { uuid: "mock-wallet-0000-0000-0000-000000000000", name: "Mock Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "test.mock" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;
}

/** Fake JSON-RPC for the public RPC used by wagmi's http transport. */
export function fakeRpc(opts: { receiptStatus?: "0x1" | "0x0"; receiptDelayMs?: number } = {}) {
  const status = opts.receiptStatus ?? "0x1";
  const handle = (req: { id: number; method: string; params?: unknown[] }) => {
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result });
    switch (req.method) {
      case "eth_chainId":
        return ok(CHAIN_HEX);
      case "eth_blockNumber":
        return ok("0x6b62bb0");
      case "eth_gasPrice":
        return ok("0x989680");
      case "eth_getBlockByNumber":
        return ok({ number: "0x6b62bb0", baseFeePerGas: "0x989680", gasLimit: "0x4000000000000", timestamp: "0x6b000000", hash: "0x" + "11".repeat(32), transactions: [] });
      case "eth_getTransactionReceipt": {
        const hash = (req.params?.[0] as string) ?? TX_HASH;
        return ok({ transactionHash: hash, blockNumber: "0x10", blockHash: "0x" + "22".repeat(32), gasUsed: "0x5208", cumulativeGasUsed: "0x5208", effectiveGasPrice: "0x989680", status, logs: [], from: WALLET, to: WALLET, transactionIndex: "0x0", type: "0x2", logsBloom: "0x" + "00".repeat(256) });
      }
      case "eth_getTransactionByHash":
        return ok({ hash: req.params?.[0], blockNumber: "0x10", from: WALLET, to: WALLET, value: "0x0", nonce: "0x1", gas: "0x5208", input: "0x", transactionIndex: "0x0", blockHash: "0x" + "22".repeat(32), type: "0x2", chainId: CHAIN_HEX, v: "0x0", r: "0x0", s: "0x0" });
      case "eth_call":
        return ok("0x");
      case "eth_estimateGas":
        return ok("0x186a0");
      default:
        return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `mock: ${req.method} unsupported` } };
    }
  };
  return async (route: Route) => {
    const body = route.request().postDataJSON() as { id: number; method: string; params?: unknown[] } | { id: number; method: string; params?: unknown[] }[];
    if (opts.receiptDelayMs && JSON.stringify(body).includes("eth_getTransactionReceipt")) await new Promise((r) => setTimeout(r, opts.receiptDelayMs));
    const res = Array.isArray(body) ? body.map(handle) : handle(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(res) });
  };
}

const T = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

interface TokenFixture {
  standard: "ERC20";
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
  valueUsd: number | null;
  iconUrl: string | null;
  verified: boolean;
  holdersCount: number | null;
  classification: string;
  reasons: string[];
  protectedAsset: boolean;
  mechanism: string;
  mechanismReason?: string;
}

interface ScanFixture {
  chainId: number;
  address: string;
  nativeBalance: string;
  partial: { tokens: boolean; nfts: boolean; approvals: boolean };
  errors: string[];
  scannedAt: number;
  tokens: TokenFixture[];
  nfts: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
}

export const scanFixture: ScanFixture = {
  chainId: 46630,
  address: WALLET,
  nativeBalance: "1000000000000000",
  partial: { tokens: true, nfts: true, approvals: true },
  errors: [] as string[],
  scannedAt: 1_800_000_000_000,
  tokens: [
    token({ address: T(0xa1), symbol: "DOGCOIN", name: "Dogcoin", balance: "84920193000000000000000000", balanceFormatted: "84,920,193", classification: "UNVERIFIED", reasons: ["Contract source not verified"], mechanism: "SEND_TO_DEAD" }),
    token({ address: T(0xa2), symbol: "BURNY", name: "Burnable Token", balance: "5000000000000000000", balanceFormatted: "5", classification: "VERIFIED", reasons: ["Contract source verified on explorer"], mechanism: "BURNABLE", verified: true }),
    token({ address: T(0xa3), symbol: "NFLX", name: "Netflix", balance: "1000000000000000000", balanceFormatted: "1", classification: "PROTECTED", reasons: ["Stock Token (Robinhood Chain issuer implementation)"], mechanism: "SEND_TO_DEAD", protectedAsset: true, verified: true }),
    token({ address: T(0xa4), symbol: "TRAP", name: "WWW.CLAIM-NOW.XYZ", balance: "1", balanceFormatted: "<0.0001", classification: "SUSPICIOUS", reasons: ["Name contains a URL, claim prompt or lookalike characters"], mechanism: "UNSUPPORTED", mechanismReason: "Balance changed by 0, expected 1" }),
  ],
  nfts: [
    { standard: "ERC721", address: T(0xb1), collectionName: "Fake Badge", symbol: "FB", tokenId: "184", amount: "1", imageUrl: null, verified: false, mechanism: "SEND_TO_DEAD", classification: "UNVERIFIED", reasons: ["Contract source not verified"], protectedAsset: false },
    { standard: "ERC721", address: T(0xb2), collectionName: "GMCards", symbol: "GM", tokenId: "7", amount: "1", imageUrl: null, verified: true, mechanism: "UNSUPPORTED", mechanismReason: "NFT transfer is disabled - GMCards are non-transferable", classification: "VERIFIED", reasons: ["Contract source verified on explorer"], protectedAsset: false },
  ],
  approvals: [
    { id: `ERC20_ALLOWANCE:${T(0xa3)}:${T(0xc1)}:`, kind: "ERC20_ALLOWANCE", standard: "ERC20", asset: { address: T(0xa3), symbol: "NFLX", name: "Netflix", decimals: 18 }, spender: T(0xc1), spenderName: null, spenderIsContract: true, spenderVerified: false, amount: "115792089237316195423570985008687907853269984665640564039457584007913129639935", amountFormatted: "Unlimited", unlimited: true, risk: "MEDIUM", riskReasons: ["Spender contract source is not verified", "Unlimited allowance"], lastActivityBlock: 100, lastActivityAt: 1_799_000_000_000, txHash: TX_HASH },
    { id: `OPERATOR:${T(0xb1)}:${T(0xc2)}:`, kind: "OPERATOR", standard: "ERC721", asset: { address: T(0xb1), symbol: "FB", name: "Fake Badge", decimals: null }, spender: T(0xc2), spenderName: null, spenderIsContract: false, spenderVerified: false, risk: "HIGH", riskReasons: ["Spender is an externally owned account, not a contract", "Operator can move every token in the collection"], lastActivityBlock: 90, lastActivityAt: 1_799_000_000_000, txHash: TX_HASH },
  ],
};

function token(
  t: Partial<TokenFixture> & { address: string; symbol: string; name: string; balance: string; balanceFormatted: string; classification: string; reasons: string[]; mechanism: string },
): TokenFixture {
  return { standard: "ERC20", decimals: 18, valueUsd: null, iconUrl: null, verified: false, holdersCount: 12, protectedAsset: false, ...t };
}

export const statusFixture = (state: "ACTIVE" | "NOT_CONFIGURED" | "PAUSED" = "NOT_CONFIGURED") => ({
  chainId: 46630,
  backend: state === "NOT_CONFIGURED" ? "none" : "self",
  active: state === "ACTIVE",
  state,
  reason: state === "ACTIVE" ? "Sponsorship active" : state === "PAUSED" ? "Sponsorship paused by operator" : "No sponsor backend configured on this deployment",
  hotBalanceWei: state === "ACTIVE" ? "20000000000000000" : null,
  reserveBalanceWei: state === "ACTIVE" ? "1000000000000000000" : null,
  spend: { hourWei: "0", dayWei: "0", hourLimitWei: "10000000000000000", dayLimitWei: "50000000000000000", opsHour: 0, opsDay: 0 },
  contracts: { entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032", paymaster: null, sponsorReserve: null, feeRouter: null, treasury: null },
  limits: {},
  checkedAt: 1_800_000_000_000,
});

export function quoteFixture(count: number, opts: { revertIndex?: number; sponsorState?: "ACTIVE" | "NOT_CONFIGURED"; eligible?: boolean; denyReason?: string } = {}) {
  const active = opts.sponsorState === "ACTIVE";
  return {
    simulations: Array.from({ length: count }, (_, i) => ({
      to: T(0xa1),
      data: "0x",
      status: i === opts.revertIndex ? "revert" : "success",
      gasUsed: "48000",
      revertReason: i === opts.revertIndex ? "blacklisted recipient" : null,
      anomalies: [] as string[],
      logsCount: 1,
    })),
    allSafe: opts.revertIndex === undefined,
    gas: { units: String(21_000 + 60_000 * count), priceWei: "10000000", costWei: String((21_000 + 60_000 * count) * 10_000_000) },
    sponsor: { state: active ? "ACTIVE" : "NOT_CONFIGURED", active, backend: active ? "self" : "none" },
    sponsorship: opts.eligible ? { eligible: true } : { eligible: false, code: active ? "BUDGET_EXHAUSTED" : "NOT_CONFIGURED", reason: opts.denyReason ?? (active ? "daily sponsor budget exhausted" : "No sponsor backend configured on this deployment") },
  };
}

export interface SetupOptions extends WalletOptions {
  scan?: ScanFixture | (() => ScanFixture);
  scanDelayMs?: number;
  scanStatus?: number;
  status?: ReturnType<typeof statusFixture>;
  quote?: ReturnType<typeof quoteFixture> | ((body: { operations: unknown[] }) => ReturnType<typeof quoteFixture>);
  rpc?: Parameters<typeof fakeRpc>[0];
  /** Skip wallet injection entirely (unsupported-wallet scenario). */
  noWallet?: boolean;
}

export async function setup(page: Page, opts: SetupOptions = {}) {
  if (!opts.noWallet) await page.addInitScript(mockWalletScript(opts));
  await page.route(/rpc\.(testnet|mainnet)\.chain\.robinhood\.com/, fakeRpc(opts.rpc ?? {}));
  await page.route("**/api/sponsor/status", (r) => r.fulfill({ json: opts.status ?? statusFixture() }));
  await page.route("**/api/scan", async (r) => {
    if (opts.scanDelayMs) await new Promise((res) => setTimeout(res, opts.scanDelayMs));
    if (opts.scanStatus && opts.scanStatus >= 400) return r.fulfill({ status: opts.scanStatus, json: { error: "scan failed upstream" } });
    const s = typeof opts.scan === "function" ? opts.scan() : (opts.scan ?? scanFixture);
    return r.fulfill({ json: s });
  });
  await page.route("**/api/simulate", (r) => {
    const body = r.request().postDataJSON() as { operations: unknown[] };
    const q = typeof opts.quote === "function" ? opts.quote(body) : (opts.quote ?? quoteFixture(body.operations.length));
    return r.fulfill({ json: q });
  });
  await page.route("**/api/cleanups**", (r) => r.fulfill({ json: r.request().method() === "GET" ? { items: [] } : { ok: true } }));
  await page.route("**/api/transparency", (r) => r.fulfill({ json: { chainId: 46630, deployed: false, status: statusFixture(), metrics: { gas24hWei: "0", ops24h: 0, lifetimeGasWei: "0", lifetimeOps: 0 }, reserveBalanceWei: null, hotBalanceWei: null, lastRefill: null, refills: [], contracts: { entryPoint: null, paymaster: null, sponsorReserve: null, feeRouter: null, treasury: null }, generatedAt: 0 } }));
}

/** Connect through the wallet modal and land on the dashboard on the right chain. */
export async function connectAndScan(page: Page, opts: { expectNetworkGuard?: boolean } = {}) {
  await page.goto("/app");
  await page.getByRole("button", { name: /connect wallet/i }).first().click();
  await page.getByRole("button", { name: /mock wallet/i }).click();
  if (opts.expectNetworkGuard !== false) {
    await page.getByRole("button", { name: /switch network/i }).click();
  }
  await page.getByRole("heading", { name: /wallet cleanup/i }).waitFor();
}
