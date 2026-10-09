import { createWalletClient, custom, type Address } from "viem";
import { makePublicClient, XLAYER_ID } from "@reticle/chain";
import { facts } from "./data";

export const publicClient = makePublicClient();
export const processor = facts.processor;
export const renderer = facts.renderer?.address;
export const oklinkTx = (h: string) => `https://www.oklink.com/xlayer/tx/${h}`;
export const oklinkAddr = (a: string) => `https://www.oklink.com/xlayer/address/${a}`;
export const oklinkBlock = (b: number | bigint) => `https://www.oklink.com/xlayer/block/${b}`;

const xlayerParams = {
  chainId: "0xc4",
  chainName: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: ["https://rpc.xlayer.tech"],
  blockExplorerUrls: ["https://www.oklink.com/xlayer"],
};

import type { Eip1193 } from "./wallet";

let selected: Eip1193 | undefined;
export const selectProvider = (p: Eip1193 | undefined) => { selected = p; };
export const injected = (): Eip1193 | undefined => selected ?? (globalThis as { ethereum?: Eip1193 }).ethereum;

export async function connectWallet(): Promise<{ address: Address; chainId: number }> {
  const eth = injected();
  if (!eth) throw new WalletError("no-wallet", "No wallet found. Install OKX Wallet or MetaMask.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
  const chainId = parseInt((await eth.request({ method: "eth_chainId" })) as string, 16);
  return { address: accounts[0]!, chainId };
}

export async function switchToXLayer() {
  const eth = injected();
  if (!eth) throw new WalletError("no-wallet", "No wallet found.");
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: xlayerParams.chainId }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === 4902 || code === -32603) {
      await eth.request({ method: "wallet_addEthereumChain", params: [xlayerParams] });
      try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: xlayerParams.chainId }] }); } catch { /* most wallets switch on add */ }
    } else throw e;
  }
}

export function walletClient(account: Address) {
  const eth = injected();
  if (!eth) throw new WalletError("no-wallet", "No wallet found.");
  return createWalletClient({ account, chain: { id: XLAYER_ID, name: "X Layer", nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } } }, transport: custom(eth) });
}

export class WalletError extends Error {
  constructor(readonly kind: "no-wallet" | "rejected" | "wrong-chain", message: string) {
    super(message);
  }
}

export const isRejection = (e: unknown) => {
  const x = e as { code?: number; name?: string; message?: string; cause?: { code?: number } };
  return x?.code === 4001 || x?.cause?.code === 4001 || /user rejected|user denied/i.test(x?.message ?? "");
};
