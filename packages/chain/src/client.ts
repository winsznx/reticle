import { createPublicClient, fallback, http, type PublicClient } from "viem";
import { RPC_URLS } from "./constants";

export function makePublicClient(urls: readonly string[] = RPC_URLS): PublicClient {
  return createPublicClient({
    transport: fallback(urls.map((u) => http(u, { retryCount: 4, retryDelay: 400, timeout: 20_000 }))),
  });
}
