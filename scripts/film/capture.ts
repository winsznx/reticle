/*
 * Scripted browser capture of the deployed site. Reads happen against mainnet. The default run
 * draws, compiles, then walks gallery -> piece -> verify -> use-it and stops before any
 * transaction. --live adds a wallet bridge that signs with the deployer key in this Node
 * process (the key never enters the page) and tapes out the drawn design.
 */
import { chromium, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { loadFacts, readJson } from "../lib";

const base = process.env.BASE_URL ?? "http://localhost:4173";
const live = process.argv.includes("--live");
const out = new URL("../../film/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const marks: { t: number; name: string }[] = [];
const t0 = Date.now();
const mark = (name: string) => { marks.push({ t: Date.now() - t0, name }); console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${name}`); };

const cursorCss = `
  #__cursor { position: fixed; z-index: 2147483647; width: 18px; height: 18px; border: 2px solid #E8A33D; background: rgba(232,163,61,.25); border-radius: 50%; pointer-events: none; transform: translate(-50%,-50%); transition: transform 60ms; }
  #__cursor.down { transform: translate(-50%,-50%) scale(.7); background: rgba(232,163,61,.7); }
`;
const cursorJs = `(() => {
  const c = document.createElement('div'); c.id = '__cursor'; document.addEventListener('DOMContentLoaded', () => document.body.appendChild(c));
  addEventListener('pointermove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('pointerdown', () => c.classList.add('down'), true);
  addEventListener('pointerup', () => c.classList.remove('down'), true);
})();`;

async function drag(page: Page, selector: string, pts: [number, number][]) {
  const box = (await page.locator(selector).boundingBox())!;
  const at = ([fx, fy]: [number, number]) => [box.x + box.width * fx, box.y + box.height * fy] as const;
  const [sx, sy] = at(pts[0]!);
  await page.mouse.move(sx, sy, { steps: 12 });
  await page.mouse.down();
  for (const p of pts.slice(1)) { const [x, y] = at(p); await page.mouse.move(x, y, { steps: 14 }); }
  await page.mouse.up();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, recordVideo: { dir: out, size: { width: 1280, height: 800 } } });
await ctx.addInitScript(cursorJs);
const page = await ctx.newPage();
await page.addStyleTag({ content: cursorCss }).catch(() => undefined);
page.on("framenavigated", () => page.addStyleTag({ content: cursorCss }).catch(() => undefined));

if (live) {
  const { deployer, publicClient } = await import("../lib");
  const { account, wallet } = deployer();
  await page.exposeFunction("__rpc", async (method: string, params: unknown[]) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [account.address];
    if (method === "eth_chainId") return "0xc4";
    if (method === "eth_sendTransaction") {
      const tx = (params as { to: `0x${string}`; data: `0x${string}`; value?: `0x${string}` }[])[0]!;
      return wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n });
    }
    return publicClient.request({ method: method as never, params: params as never });
  });
  await page.addInitScript(() => {
    (window as unknown as { ethereum: unknown }).ethereum = { request: ({ method, params }: { method: string; params?: unknown[] }) => (window as unknown as { __rpc: (m: string, p: unknown[]) => Promise<unknown> }).__rpc(method, params ?? []), on() {} };
  });
}

await page.goto(base);
await page.getByRole("heading", { level: 1 }).waitFor();
mark("landing");
await page.waitForTimeout(1500);

await page.getByRole("link", { name: "Make one" }).click();
await page.locator("canvas.grid-canvas").waitFor();
mark("make-open");
await drag(page, "canvas.grid-canvas", [[0.5, 0.1], [0.5, 0.9]]);
await drag(page, "canvas.grid-canvas", [[0.1, 0.5], [0.9, 0.5]]);
await drag(page, "canvas.grid-canvas", [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7], [0.3, 0.3]]);
await page.locator('.cause:has-text("gates")').waitFor();
mark("compiled");
await page.waitForTimeout(1800);

if (live) {
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: "Tape out" }).click();
  mark("tapeout-clicked");
  await page.locator('.cause[data-state="ok"]').waitFor({ timeout: 180_000 });
  mark("verified");
  await page.waitForTimeout(2500);
}

await page.getByRole("link", { name: "Gallery" }).click();
await page.locator(".archive .cell").first().waitFor();
await page.waitForTimeout(2500);
mark("gallery");
await page.locator(".archive .cell").first().click();
await page.getByRole("button", { name: "Verify on-chain" }).waitFor();
await page.waitForFunction(() => !document.querySelector(".tile .sk"));
mark("row-done");
await page.getByRole("button", { name: "Verify on-chain" }).click();
await page.locator("text=✓ match").waitFor({ timeout: 60_000 });
mark("verified");
await page.waitForTimeout(2000);
await page.getByRole("link", { name: "Embed" }).click();
await page.locator('img[data-reticle-state="ok"]').waitFor({ timeout: 60_000 });
mark("embed-ok");
await page.waitForTimeout(2500);

await ctx.close();
await browser.close();

const webm = readdirSync(out).filter((f) => f.endsWith(".webm")).map((f) => `${out}${f}`).sort().pop();
if (webm) {
  const final = `${out}session.webm`;
  renameSync(webm, final);
  execFileSync("ffmpeg", ["-y", "-i", final, "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none", `${out}session.gif`], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-i", final, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-movflags", "+faststart", `${out}session.mp4`], { stdio: "ignore" });
}
writeFileSync(`${out}marks.json`, JSON.stringify({ base, live, marks, facts: { processor: loadFacts().processor?.circuits, tapeouts: readJson<unknown[]>("evidence/tapeouts.json", []).length } }, null, 2));
console.log("film written to", out);
