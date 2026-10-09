export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: never[]) => void): void;
  removeListener?(event: string, listener: (...args: never[]) => void): void;
}

export interface WalletInfo {
  uuid: string;
  name: string;
  icon?: string;
  rdns: string;
}

export interface DiscoveredWallet {
  info: WalletInfo;
  provider: Eip1193;
}

const OKX_RDNS = ["com.okex.wallet", "com.okx.wallet"];
const isOkx = (w: DiscoveredWallet) => OKX_RDNS.includes(w.info.rdns) || /okx|okex/i.test(w.info.name);

/* EIP-6963: ask every wallet to announce itself, collect for a short window. */
export function discoverWallets(windowMs = 250): Promise<DiscoveredWallet[]> {
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredWallet>();
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<DiscoveredWallet>).detail;
      if (d?.info?.uuid && d.provider) found.set(d.info.uuid, d);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve([...found.values()]);
    }, windowMs);
  });
}

/* Legacy globals are the fallback for wallets that do not announce: OKX's own global, then window.ethereum. */
export function legacyWallets(w: { okxwallet?: Eip1193; ethereum?: Eip1193 } = window as never): DiscoveredWallet[] {
  const out: DiscoveredWallet[] = [];
  if (w.okxwallet) out.push({ info: { uuid: "legacy-okx", name: "OKX Wallet", rdns: "com.okex.wallet" }, provider: w.okxwallet });
  if (w.ethereum && w.ethereum !== w.okxwallet) out.push({ info: { uuid: "legacy-injected", name: "Browser wallet", rdns: "injected" }, provider: w.ethereum });
  return out;
}

/* OKX Wallet first, then anything else announced, then legacy injected providers. */
export function orderWallets(announced: DiscoveredWallet[], legacy: DiscoveredWallet[]): DiscoveredWallet[] {
  const all = [...announced];
  for (const l of legacy) if (!all.some((a) => a.provider === l.provider)) all.push(l);
  return all.sort((a, b) => Number(isOkx(b)) - Number(isOkx(a)));
}

export async function listWallets(): Promise<DiscoveredWallet[]> {
  return orderWallets(await discoverWallets(), legacyWallets());
}

export const XLAYER_CHAIN_ID = 196;
export const chainName = (id: number) => ({ 1: "Ethereum", 56: "BNB Chain", 137: "Polygon", 196: "X Layer", 8453: "Base", 42161: "Arbitrum One", 10: "OP Mainnet" } as Record<number, string>)[id] ?? `chain ${id}`;
