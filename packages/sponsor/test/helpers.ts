import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  numberToHex,
  pad,
  parseAbi,
  parseGwei,
  slice,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  DEAD_ADDRESS,
  ENTRYPOINT_V07,
  ROBINHOOD_CHAIN_TESTNET_ID,
  TOPIC_TRANSFER,
  ZERO_ADDRESS,
  type Deployment,
} from "@incinerator/chain";
import { DEFAULT_POLICY, type SponsorPolicy } from "../src/config";
import type { SponsorEnv } from "../src/env";
import { MemoryStore } from "../src/store";
import type { PaymasterDeps } from "../src/paymaster";
import type { SessionPayload } from "../src/session";
import type { UserOperationV07 } from "../src/userop";

/**
 * A tiny deterministic EVM stand-in. Enough of eth_simulateV1, multicall,
 * getCode and readContract to exercise the policy engine end to end.
 */

export const SIGNER_KEY: Hex = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const signerAccount = privateKeyToAccount(SIGNER_KEY);

export const WALLET = getAddress("0x1000000000000000000000000000000000000001");
export const OTHER_WALLET = getAddress("0x2000000000000000000000000000000000000002");
export const TOKEN_A = getAddress("0xa000000000000000000000000000000000000001");
export const TOKEN_B = getAddress("0xb000000000000000000000000000000000000002");
export const NFT = getAddress("0xc000000000000000000000000000000000000003");
export const MULTI = getAddress("0xd000000000000000000000000000000000000004");
export const SPENDER = getAddress("0xe000000000000000000000000000000000000005");
export const PAYMASTER = getAddress("0xf000000000000000000000000000000000000006");
export const RESERVE = getAddress("0xf000000000000000000000000000000000000007");

export interface TokenBehavior {
  revert?: string;
  gasUsed?: bigint;
  noBalanceChange?: boolean;
  externalLog?: boolean;
  ethTransfer?: boolean;
  returnFalse?: boolean;
  noTransferLog?: boolean;
}

export class FakeChain {
  code = new Set<string>([TOKEN_A, TOKEN_B, NFT, MULTI].map((a) => a.toLowerCase()));
  erc20 = new Map<string, bigint>();
  erc721 = new Map<string, Address>();
  erc1155 = new Map<string, bigint>();
  allowances = new Map<string, bigint>();
  operators = new Map<string, boolean>();
  tokenApprovals = new Map<string, Address>();
  behaviors = new Map<string, TokenBehavior>();
  gasPrice = parseGwei("0.01");
  paymasterDeposit = 10n ** 17n;
  reserveBalance = 10n ** 18n;

  setErc20(token: Address, owner: Address, bal: bigint) {
    this.erc20.set(`${token}:${owner}`.toLowerCase(), bal);
  }
  setErc721(token: Address, id: bigint, owner: Address) {
    this.erc721.set(`${token}:${id}`.toLowerCase(), owner);
  }
  setErc1155(token: Address, owner: Address, id: bigint, bal: bigint) {
    this.erc1155.set(`${token}:${owner}:${id}`.toLowerCase(), bal);
  }
  setAllowance(token: Address, owner: Address, spender: Address, v: bigint) {
    this.allowances.set(`${token}:${owner}:${spender}`.toLowerCase(), v);
  }
  setOperator(token: Address, owner: Address, op: Address, v: boolean) {
    this.operators.set(`${token}:${owner}:${op}`.toLowerCase(), v);
  }
  setTokenApproval(token: Address, id: bigint, to: Address) {
    this.tokenApprovals.set(`${token}:${id}`.toLowerCase(), to);
  }
  behave(token: Address, b: TokenBehavior) {
    this.behaviors.set(token.toLowerCase(), b);
  }

  private read(to: Address, data: Hex, from: Address): Hex {
    const sel = slice(data, 0, 4).toLowerCase();
    const args = slice(data, 4);
    switch (sel) {
      case "0x70a08231": {
        const [owner] = decodeAbiParameters([{ type: "address" }], args);
        const v = this.erc20.get(`${to}:${owner}`.toLowerCase());
        if (v === undefined) throw new Error("revert");
        return u256(v);
      }
      case "0x6352211e": {
        const [id] = decodeAbiParameters([{ type: "uint256" }], args);
        const o = this.erc721.get(`${to}:${id}`.toLowerCase());
        if (!o) throw new Error("revert");
        return addr(o);
      }
      case "0x00fdd58e": {
        const [owner, id] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], args);
        return u256(this.erc1155.get(`${to}:${owner}:${id}`.toLowerCase()) ?? 0n);
      }
      case "0xdd62ed3e": {
        const [owner, spender] = decodeAbiParameters([{ type: "address" }, { type: "address" }], args);
        return u256(this.allowances.get(`${to}:${owner}:${spender}`.toLowerCase()) ?? 0n);
      }
      case "0x081812fc": {
        const [id] = decodeAbiParameters([{ type: "uint256" }], args);
        return addr(this.tokenApprovals.get(`${to}:${id}`.toLowerCase()) ?? ZERO_ADDRESS);
      }
      case "0xe985e9c5": {
        const [owner, op] = decodeAbiParameters([{ type: "address" }, { type: "address" }], args);
        return u256(this.operators.get(`${to}:${owner}:${op}`.toLowerCase()) ? 1n : 0n);
      }
      default:
        throw new Error(`unknown read ${sel} from ${from}`);
    }
  }

  private write(to: Address, data: Hex, from: Address): { returnData: Hex; logs: { address: Address; topics: Hex[]; data: Hex }[]; gasUsed: bigint } {
    const b = this.behaviors.get(to.toLowerCase()) ?? {};
    if (b.revert !== undefined) throw new Error(b.revert);
    const sel = slice(data, 0, 4).toLowerCase();
    const args = slice(data, 4);
    const logs: { address: Address; topics: Hex[]; data: Hex }[] = [];
    let returnData: Hex = "0x";
    const transfer = (f: Address, t: Address, v: bigint) => {
      if (!b.noTransferLog) logs.push({ address: to, topics: [TOPIC_TRANSFER, pad(f), pad(t)], data: u256(v) });
    };
    switch (sel) {
      case "0x42966c68": {
        const [amount] = decodeAbiParameters([{ type: "uint256" }], args);
        const k20 = `${to}:${from}`.toLowerCase();
        const k721 = `${to}:${amount}`.toLowerCase();
        if (this.erc20.has(k20)) {
          if (!b.noBalanceChange) this.erc20.set(k20, this.erc20.get(k20)! - amount);
          transfer(from, ZERO_ADDRESS, amount);
        } else if (this.erc721.get(k721)?.toLowerCase() === from.toLowerCase()) {
          if (!b.noBalanceChange) this.erc721.delete(k721);
          transfer(from, ZERO_ADDRESS, amount);
        } else throw new Error("ERC20: burn amount exceeds balance");
        break;
      }
      case "0xa9059cbb": {
        const [t, amount] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], args);
        const k = `${to}:${from}`.toLowerCase();
        const bal = this.erc20.get(k) ?? 0n;
        if (bal < amount) throw new Error("ERC20: transfer amount exceeds balance");
        if (!b.noBalanceChange) this.erc20.set(k, bal - amount);
        transfer(from, t, amount);
        returnData = u256(b.returnFalse ? 0n : 1n);
        break;
      }
      case "0x23b872dd": {
        const [f, t, id] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], args);
        const k = `${to}:${id}`.toLowerCase();
        if (this.erc721.get(k)?.toLowerCase() !== f.toLowerCase()) throw new Error("ERC721: not owner");
        if (!b.noBalanceChange) this.erc721.set(k, t);
        transfer(f, t, id);
        break;
      }
      case "0xf5298aca": {
        const [acct, id, amount] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }], args);
        const k = `${to}:${acct}:${id}`.toLowerCase();
        const bal = this.erc1155.get(k) ?? 0n;
        if (bal < amount) throw new Error("ERC1155: burn exceeds balance");
        if (!b.noBalanceChange) this.erc1155.set(k, bal - amount);
        break;
      }
      case "0xf242432a": {
        const [f, t, id, amount] = decodeAbiParameters(
          [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
          args,
        );
        const k = `${to}:${f}:${id}`.toLowerCase();
        const bal = this.erc1155.get(k) ?? 0n;
        if (bal < amount) throw new Error("ERC1155: insufficient");
        if (!b.noBalanceChange) this.erc1155.set(k, bal - amount);
        void t;
        break;
      }
      case "0x095ea7b3": {
        const [spender, amount] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], args);
        if (spender.toLowerCase() === ZERO_ADDRESS && this.tokenApprovals.has(`${to}:${amount}`.toLowerCase())) {
          if (!b.noBalanceChange) this.tokenApprovals.set(`${to}:${amount}`.toLowerCase(), ZERO_ADDRESS);
        } else if (!b.noBalanceChange) this.allowances.set(`${to}:${from}:${spender}`.toLowerCase(), amount);
        returnData = u256(1n);
        break;
      }
      case "0xa22cb465": {
        const [op, approved] = decodeAbiParameters([{ type: "address" }, { type: "bool" }], args);
        if (!b.noBalanceChange) this.operators.set(`${to}:${from}:${op}`.toLowerCase(), approved);
        break;
      }
      default:
        throw new Error(`unknown write ${sel}`);
    }
    if (b.externalLog) logs.push({ address: SPENDER, topics: [TOPIC_TRANSFER], data: "0x" });
    if (b.ethTransfer) logs.push({ address: ZERO_ADDRESS, topics: [TOPIC_TRANSFER, pad(from), pad(SPENDER)], data: u256(1n) });
    return { returnData, logs, gasUsed: b.gasUsed ?? 45_000n };
  }

  private isRead(data: Hex): boolean {
    return ["0x70a08231", "0x6352211e", "0x00fdd58e", "0xdd62ed3e", "0x081812fc", "0xe985e9c5"].includes(slice(data, 0, 4).toLowerCase());
  }

  client(): PublicClient {
    const self = this;
    const fake = {
      chain: { id: ROBINHOOD_CHAIN_TESTNET_ID },
      async getCode({ address }: { address: Address }) {
        return self.code.has(address.toLowerCase()) ? ("0x6001" as Hex) : undefined;
      },
      async getGasPrice() {
        return self.gasPrice;
      },
      async getBalance({ address }: { address: Address }) {
        return address.toLowerCase() === RESERVE.toLowerCase() ? self.reserveBalance : 0n;
      },
      async readContract({ functionName }: { functionName: string }) {
        if (functionName === "balanceOf") return self.paymasterDeposit;
        throw new Error("unsupported");
      },
      async multicall({ contracts }: { contracts: { address: Address; abi: unknown; functionName: string; args: unknown[] }[] }) {
        return contracts.map((c) => {
          try {
            const data = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args } as never);
            const ret = self.read(c.address, data, WALLET);
            const fn = c.functionName;
            const result =
              fn === "ownerOf" || fn === "getApproved"
                ? getAddress(`0x${ret.slice(26)}`)
                : fn === "isApprovedForAll"
                  ? BigInt(ret) !== 0n
                  : BigInt(ret);
            return { status: "success", result };
          } catch (e) {
            return { status: "failure", error: e };
          }
        });
      },
      async request({ method, params }: { method: string; params: unknown[] }) {
        if (method !== "eth_simulateV1") throw new Error(`unsupported ${method}`);
        const [{ blockStateCalls }] = params as [{ blockStateCalls: { calls: { from: Address; to: Address; data: Hex }[] }[] }];
        const snapshot = self.snapshot();
        const results = blockStateCalls[0]!.calls.map((c) => {
          try {
            if (self.isRead(c.data)) {
              return { status: "0x1", returnData: self.read(c.to, c.data, c.from), gasUsed: "0x5208", logs: [] };
            }
            const w = self.write(c.to, c.data, c.from);
            return { status: "0x1", returnData: w.returnData, gasUsed: numberToHex(w.gasUsed), logs: w.logs };
          } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            const data: Hex = reason === "revert" ? "0x" : (`0x08c379a0${encodeAbiParameters([{ type: "string" }], [reason]).slice(2)}` as Hex);
            return { status: "0x0", returnData: "0x", gasUsed: "0x5208", logs: [], error: { code: -32000, message: "execution reverted", data } };
          }
        });
        self.restore(snapshot);
        return [{ calls: results }];
      },
    };
    return fake as unknown as PublicClient;
  }

  private snapshot() {
    return {
      erc20: new Map(this.erc20),
      erc721: new Map(this.erc721),
      erc1155: new Map(this.erc1155),
      allowances: new Map(this.allowances),
      operators: new Map(this.operators),
      tokenApprovals: new Map(this.tokenApprovals),
    };
  }
  private restore(s: ReturnType<FakeChain["snapshot"]>) {
    this.erc20 = s.erc20;
    this.erc721 = s.erc721;
    this.erc1155 = s.erc1155;
    this.allowances = s.allowances;
    this.operators = s.operators;
    this.tokenApprovals = s.tokenApprovals;
  }
}

function u256(v: bigint): Hex {
  return pad(numberToHex(v), { size: 32 });
}
function addr(a: Address): Hex {
  return pad(a, { size: 32 });
}

export const deployment: Deployment = {
  entryPoint: ENTRYPOINT_V07,
  paymaster: PAYMASTER,
  sponsorReserve: RESERVE,
};

export function makeEnv(overrides: Partial<SponsorEnv> = {}): SponsorEnv {
  return {
    chainId: ROBINHOOD_CHAIN_TESTNET_ID,
    network: "testnet",
    alchemyApiKey: undefined,
    alchemyGasPolicyId: undefined,
    backend: "self",
    signerPrivateKey: SIGNER_KEY,
    serverSigningSecret: "test-secret",
    adminToken: "admin",
    databaseUrl: undefined,
    isProduction: false,
    ...overrides,
  };
}

export function makeDeps(chain: FakeChain, opts: { policy?: Partial<SponsorPolicy>; session?: SessionPayload | null; env?: Partial<SponsorEnv>; now?: () => number } = {}): PaymasterDeps & { store: MemoryStore } {
  const store = new MemoryStore();
  const now = opts.now ?? (() => 1_800_000_000_000);
  return {
    chainId: ROBINHOOD_CHAIN_TESTNET_ID,
    client: chain.client(),
    store,
    policy: { ...DEFAULT_POLICY, ...opts.policy },
    deployment,
    now,
    env: makeEnv(opts.env),
    signer: signerAccount,
    session: opts.session === undefined ? { address: WALLET, chainId: ROBINHOOD_CHAIN_TESTNET_ID, iat: now(), exp: now() + 60_000 } : opts.session,
  };
}

const batchAbi = parseAbi(["function executeBatch((address target,uint256 value,bytes data)[] calls)"]);

export function batchCallData(calls: { to: Address; value?: bigint; data: Hex }[]): Hex {
  return encodeFunctionData({
    abi: batchAbi,
    functionName: "executeBatch",
    args: [calls.map((c) => ({ target: c.to, value: c.value ?? 0n, data: c.data }))],
  });
}

export function makeUserOp(callData: Hex, overrides: Partial<UserOperationV07> = {}): UserOperationV07 {
  return {
    sender: WALLET,
    nonce: 1n,
    callData,
    callGasLimit: 300_000n,
    verificationGasLimit: 150_000n,
    preVerificationGas: 60_000n,
    maxFeePerGas: parseGwei("0.02"),
    maxPriorityFeePerGas: 0n,
    signature: "0x",
    ...overrides,
  };
}

export const erc20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function burn(uint256 amount)",
]);
export const erc721 = parseAbi([
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
  "function approve(address to, uint256 tokenId)",
]);

export function deadTransfer(amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20, functionName: "transfer", args: [DEAD_ADDRESS, amount] });
}
