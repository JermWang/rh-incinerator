import { formatUnits } from "viem";

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/** Format a raw unit amount with thousands grouping and sensible precision. */
export function formatAmount(raw: bigint | string, decimals: number, maxFraction = 4): string {
  const value = formatUnits(BigInt(raw), decimals);
  const [whole = "0", frac = ""] = value.split(".");
  const wholeGrouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (BigInt(raw) === 0n) return "0";
  if (whole !== "0" && whole.replace(/^-/, "").length >= 7) return wholeGrouped;
  const trimmed = frac.slice(0, maxFraction).replace(/0+$/, "");
  if (whole === "0" && trimmed === "") {
    return `<0.${"0".repeat(Math.max(maxFraction - 1, 0))}1`;
  }
  return trimmed ? `${wholeGrouped}.${trimmed}` : wholeGrouped;
}

export function formatEth(wei: bigint | string, maxFraction = 7): string {
  const v = BigInt(wei);
  if (v === 0n) return "0";
  const s = formatUnits(v, 18);
  const [whole = "0", frac = ""] = s.split(".");
  const trimmed = frac.slice(0, maxFraction).replace(/0+$/, "");
  if (whole === "0" && trimmed === "") return `<0.${"0".repeat(maxFraction - 1)}1`;
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function formatUsd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v < 0.01 && v > 0) return "<$0.01";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

export function formatGasUnits(gas: bigint | string): string {
  return Number(BigInt(gas)).toLocaleString("en-US");
}
