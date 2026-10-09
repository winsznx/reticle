/* Browser check of wallet discovery and chain handling with mock EIP-6963 wallets. Reads only, sends nothing. */
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:4391";
const browser = await chromium.launch();
const page = await browser.newPage();
const log: string[] = [];
await page.exposeFunction("__log", (m: string) => log.push(m));
await page.addInitScript(`
  const mk = (name, chainId) => {
    let chain = chainId, added = false;
    const p = {
      request: async ({ method, params }) => {
        window.__log(name + ":" + method);
        if (method === "eth_requestAccounts") return ["0x7945ffB152e7c6CE8f479F5A24874C57A8B9e19D"];
        if (method === "eth_chainId") return "0x" + chain.toString(16);
        if (method === "wallet_switchEthereumChain") {
          if (!added) { const e = new Error("unrecognized chain"); e.code = 4902; throw e; }
          chain = 196; return null;
        }
        if (method === "wallet_addEthereumChain") { added = true; return null; }
        if (method === "eth_getBalance") return "0x2386f26fc10000";
        return null;
      },
      on() {}, removeListener() {},
    };
    return p;
  };
  const wallets = [
    { info: { uuid: "mm", name: "MetaMask", rdns: "io.metamask", icon: "" }, provider: mk("metamask", 1) },
    { info: { uuid: "okx", name: "OKX Wallet", rdns: "com.okex.wallet", icon: "" }, provider: mk("okx", 1) },
  ];
  window.addEventListener("eip6963:requestProvider", () => wallets.forEach((detail) => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }))));
`);
await page.goto(`${base}/make`);
await page.getByRole("button", { name: "Connect wallet" }).waitFor();
await page.locator("aside select").waitFor({ timeout: 5000 });
const options = await page.locator("aside select option").allInnerTexts();
if (options[0] !== "OKX Wallet") throw new Error(`OKX Wallet should be listed first, got ${options}`);
await page.getByRole("button", { name: "Connect wallet" }).click();
await page.getByRole("button", { name: "Switch to X Layer" }).waitFor({ timeout: 10_000 });
const cause = await page.locator(".cause").innerText();
if (!/Ethereum \(1\)/.test(cause) || !/Switch to X Layer/.test(cause)) throw new Error(`wrong-chain message missing: ${cause}`);
if (!log.some((l) => l.startsWith("okx:eth_requestAccounts")) || log.some((l) => l.startsWith("metamask:"))) throw new Error(`expected OKX to be used first: ${log}`);
await page.getByRole("button", { name: "Switch to X Layer" }).click();
await page.getByRole("button", { name: /^Tape out$/ }).waitFor({ timeout: 10_000 });
const need = ["okx:wallet_switchEthereumChain", "okx:wallet_addEthereumChain"];
for (const n of need) if (!log.includes(n)) throw new Error(`missing ${n} in ${log}`);
console.log("wallet e2e passed:", log.join(" "));
await browser.close();
