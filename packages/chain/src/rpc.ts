import { custom, createPublicClient, type PublicClient } from "viem";
import { RPC_URLS } from "./constants";

export interface RpcOptions {
  urls?: readonly string[];
  concurrency?: number;
  retriesPerUrl?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class RpcError extends Error {
  constructor(message: string, readonly code?: number, readonly retryable = false) {
    super(message);
    this.name = "RpcError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* A call that reverted or was malformed will fail the same way everywhere, so it is never retried. */
const isRetryableJsonRpc = (code: number | undefined, message: string) =>
  code === -32005 || code === 429 || /rate.?limit|too many|timeout|temporar|overload|capacity/i.test(message);

class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/*
 * Ordered fallback across endpoints. Each endpoint gets retriesPerUrl retries with exponential
 * backoff on 429, 5xx, network errors and rate-limit style JSON-RPC errors, then the next one is tried.
 * At most `concurrency` requests are in flight at once.
 */
export function createRpc(opts: RpcOptions = {}) {
  const urls = opts.urls ?? RPC_URLS;
  const retries = opts.retriesPerUrl ?? 2;
  const base = opts.baseDelayMs ?? 250;
  const timeout = opts.timeoutMs ?? 15_000;
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const limiter = new Limiter(opts.concurrency ?? 6);
  let id = 0;

  async function once(url: string, method: string, params: unknown): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) throw new RpcError(`HTTP ${res.status}`, res.status, true);
      if (!res.ok) throw new RpcError(`HTTP ${res.status}`, res.status, false);
      const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
      if (json.error) throw new RpcError(json.error.message, json.error.code, isRetryableJsonRpc(json.error.code, json.error.message));
      return json.result;
    } catch (e) {
      if (e instanceof RpcError) throw e;
      throw new RpcError((e as Error).message || "network error", undefined, true);
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(method: string, params: unknown): Promise<unknown> {
    let last: RpcError | null = null;
    for (const url of urls) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await limiter.run(() => once(url, method, params));
        } catch (e) {
          last = e as RpcError;
          if (!last.retryable) throw last;
          if (attempt < retries) await sleep(base * 2 ** attempt + Math.random() * base);
        }
      }
    }
    throw last ?? new RpcError("no endpoints");
  }

  return { request };
}

export function makeResilientClient(opts: RpcOptions = {}): PublicClient {
  const { request } = createRpc(opts);
  return createPublicClient({
    transport: custom({ request: async ({ method, params }: { method: string; params?: unknown }) => request(method, params ?? []) }, { retryCount: 0 }),
  });
}
