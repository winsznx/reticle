import type { PublicClient } from "viem";
import { makeResilientClient } from "./rpc";
import { RPC_URLS } from "./constants";

export function makePublicClient(urls: readonly string[] = RPC_URLS): PublicClient {
  return makeResilientClient({ urls });
}
