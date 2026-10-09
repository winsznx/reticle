import { createWalletClient, fallback, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { RPC_URLS, XLAYER_ID, makePublicClient } from "@reticle/chain";

export const root = new URL("../", import.meta.url);
const p = (rel: string) => new URL(rel, root);

if (existsSync(p(".env"))) process.loadEnvFile(p(".env").pathname);

export const xlayer = defineChain({
  id: XLAYER_ID,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [...RPC_URLS] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer" } },
});

export const publicClient = makePublicClient();

export function deployer() {
  const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY missing from .env");
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: xlayer, transport: fallback(RPC_URLS.map((u) => http(u, { retryCount: 3 }))) });
  return { account, wallet };
}

export const readJson = <T>(rel: string, fallbackValue: T): T => (existsSync(p(rel)) ? (JSON.parse(readFileSync(p(rel), "utf8")) as T) : fallbackValue);
export const writeJson = (rel: string, value: unknown) => writeFileSync(p(rel), JSON.stringify(value, bigintReplacer, 2) + "\n");
export const bigintReplacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

export const appendJson = <T>(rel: string, entry: T) => {
  const list = readJson<T[]>(rel, []);
  list.push(entry);
  writeJson(rel, list);
};

export interface Facts {
  chainId: number;
  deployer: Address;
  processor?: {
    name: string;
    symbol: string;
    story: string;
    transistorSupply: string;
    mintPrice: string;
    circuits: Address;
    transistors: Address;
    deployTx: Hex;
    deployBlock: number;
    ackMs: number;
    completionMs: number;
  };
  renderer?: { address: Address; deployTx: Hex; deployBlock: number };
  previousRenderers?: { address: Address; deployTx: Hex; deployBlock: number; note: string }[];
  repo?: string;
  site?: string;
  video?: string;
}

export const loadFacts = () => readJson<Facts>("submission-facts.json", { chainId: XLAYER_ID, deployer: deployer().account.address });
export const saveFacts = (f: Facts) => writeJson("submission-facts.json", f);

export const oklinkTx = (h: string) => `https://www.oklink.com/xlayer/tx/${h}`;
export const oklinkAddr = (a: string) => `https://www.oklink.com/xlayer/address/${a}`;

export function requireFacts() {
  const facts = loadFacts();
  if (!facts.processor) throw new Error("processor not deployed yet, run deploy-processor.ts first");
  return { facts, processor: facts.processor };
}
