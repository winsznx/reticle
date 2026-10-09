// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chainName, discoverWallets, legacyWallets, orderWallets, type DiscoveredWallet, type Eip1193 } from "./wallet";

const prov = (): Eip1193 => ({ request: async () => null });
const w = (uuid: string, name: string, rdns: string): DiscoveredWallet => ({ info: { uuid, name, rdns }, provider: prov() });

describe("wallet ordering", () => {
  it("puts OKX Wallet first, then other announced wallets, then legacy injected", () => {
    const metamask = w("1", "MetaMask", "io.metamask");
    const okx = w("2", "OKX Wallet", "com.okex.wallet");
    const other = w("3", "Rabby", "io.rabby");
    const legacy = legacyWallets({ ethereum: prov() });
    const ordered = orderWallets([metamask, other, okx], legacy);
    expect(ordered.map((x) => x.info.name)).toEqual(["OKX Wallet", "MetaMask", "Rabby", "Browser wallet"]);
  });

  it("does not list a legacy provider twice when it also announced itself", () => {
    const shared = prov();
    const announced: DiscoveredWallet = { info: { uuid: "a", name: "MetaMask", rdns: "io.metamask" }, provider: shared };
    const ordered = orderWallets([announced], legacyWallets({ ethereum: shared }));
    expect(ordered).toHaveLength(1);
  });

  it("uses window.okxwallet for OKX when the wallet does not announce", () => {
    const okx = prov();
    const list = orderWallets([], legacyWallets({ okxwallet: okx, ethereum: prov() }));
    expect(list[0]!.info.name).toBe("OKX Wallet");
    expect(list[0]!.provider).toBe(okx);
  });
});

describe("EIP-6963 discovery", () => {
  it("collects announced providers and ignores malformed announcements", async () => {
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: w("x", "Test", "dev.test") }));
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { nope: true } }));
    });
    const found = await discoverWallets(20);
    expect(found.map((f) => f.info.name)).toEqual(["Test"]);
  });
});

describe("chainName", () => {
  it("names common chains and falls back to the id", () => {
    expect(chainName(1)).toBe("Ethereum");
    expect(chainName(999)).toBe("chain 999");
  });
});
