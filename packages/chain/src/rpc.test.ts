import { describe, expect, it, vi } from "vitest";
import { createRpc } from "./rpc";
import { MemoryStore, SessionStore, rowKey, setRowStore } from "./cache";
import { evalRow, conformShape } from "./render";
import type { PublicClient } from "viem";

const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ result }) }) as Response;
const http = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response;
const rpcErr = (code: number, message: string) => ({ ok: true, status: 200, json: async () => ({ error: { code, message } }) }) as Response;
const fast = { baseDelayMs: 1, retriesPerUrl: 2 };

describe("createRpc", () => {
  it("falls through the endpoint list in order", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => { seen.push(url); return url === "https://c" ? ok("0x1") : http(503); });
    const { request } = createRpc({ urls: ["https://a", "https://b", "https://c"], fetchImpl: fetchImpl as never, ...fast });
    expect(await request("eth_blockNumber", [])).toBe("0x1");
    expect(seen.filter((u) => u === "https://a")).toHaveLength(3);
    expect(seen.indexOf("https://b")).toBeGreaterThan(seen.lastIndexOf("https://a"));
  });

  it("retries 429 with backoff on the same endpoint before moving on", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n < 3 ? http(429) : ok("0x2")));
    const { request } = createRpc({ urls: ["https://a", "https://b"], fetchImpl: fetchImpl as never, ...fast });
    expect(await request("eth_chainId", [])).toBe("0x2");
    expect(n).toBe(3);
  });

  it("does not retry a revert", async () => {
    const fetchImpl = vi.fn(async () => rpcErr(3, "execution reverted"));
    const { request } = createRpc({ urls: ["https://a", "https://b"], fetchImpl: fetchImpl as never, ...fast });
    await expect(request("eth_call", [])).rejects.toThrow(/reverted/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries rate-limit style JSON-RPC errors", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n === 1 ? rpcErr(-32005, "rate limit exceeded") : ok("0x3")));
    const { request } = createRpc({ urls: ["https://a"], fetchImpl: fetchImpl as never, ...fast });
    expect(await request("eth_call", [])).toBe("0x3");
  });

  it("throws the last error when every endpoint keeps failing", async () => {
    const fetchImpl = vi.fn(async () => http(500));
    const { request } = createRpc({ urls: ["https://a", "https://b"], fetchImpl: fetchImpl as never, ...fast });
    await expect(request("eth_call", [])).rejects.toThrow(/HTTP 500/);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("never has more than 6 requests in flight", async () => {
    let inFlight = 0, peak = 0;
    const fetchImpl = vi.fn(async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return ok("0x0"); });
    const { request } = createRpc({ urls: ["https://a"], fetchImpl: fetchImpl as never, ...fast });
    await Promise.all(Array.from({ length: 40 }, () => request("eth_call", [])));
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
  });
});

describe("row cache", () => {
  const shape = conformShape(4, 8, 0, 5);
  const circuits = "0x" + "ab".repeat(20);
  const client = (calls: { n: number }) => ({ readContract: async () => { calls.n++; return "0x81"; } }) as unknown as PublicClient;

  it("serves a repeated row from the cache without a second call", async () => {
    const calls = { n: 0 };
    setRowStore(new MemoryStore());
    const a = await evalRow(client(calls), circuits as `0x${string}`, 1n, shape, 0, 2);
    const b = await evalRow(client(calls), circuits as `0x${string}`, 1n, shape, 0, 2);
    expect(b).toEqual(a);
    expect(calls.n).toBe(1);
    setRowStore(null);
  });

  it("bypasses the cache when asked, so verification reads the chain", async () => {
    const calls = { n: 0 };
    setRowStore(new MemoryStore());
    await evalRow(client(calls), circuits as `0x${string}`, 1n, shape, 0, 2);
    await evalRow(client(calls), circuits as `0x${string}`, 1n, shape, 0, 2, false);
    expect(calls.n).toBe(2);
    setRowStore(null);
  });

  it("keys rows by circuits:id:frame:row and survives a blocked sessionStorage", () => {
    expect(rowKey("0xABC", 7n, 2, 5)).toBe("0xabc:7:2:5");
    const s = new SessionStore();
    s.set("k", "v");
    expect(s.get("k")).toBe("v");
  });
});
