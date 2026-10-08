import { formatEther } from "viem";

export const short = (s: string, a = 6, b = 4) => (s.length > a + b + 2 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);
export const okb = (wei: bigint, digits = 6) => {
  const s = formatEther(wei);
  const [i, f = ""] = s.split(".");
  const trimmed = f.slice(0, digits).replace(/0+$/, "");
  return trimmed ? `${i}.${trimmed}` : i!;
};
export const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
