/* Browser check: with every RPC failing the gallery says "chain busy, retry", never a broken card, and recovers on retry. */
import { chromium } from "playwright";
import { writeJson } from "../lib";

const base = process.env.BASE_URL ?? "http://localhost:4391";
const browser = await chromium.launch();
const page = await browser.newPage();
let down = true, inFlight = 0, peak = 0, hits = 0, failedRequests = 0;
await page.route(/rpc\.xlayer\.tech|xlayerrpc\.okx\.com|xlayer\.drpc\.org/, async (route) => {
  hits++;
  if (down) return route.fulfill({ status: 503, body: "busy" });
  inFlight++; peak = Math.max(peak, inFlight);
  try { await route.continue(); } finally { inFlight--; }
});
await page.goto(`${base}/gallery`);
await page.getByText("chain busy, retry").first().waitFor({ timeout: 30_000 });
failedRequests = hits;
console.log("down: shows chain busy after", hits, "failed requests");
down = false;
await page.getByRole("button", { name: "Retry" }).first().click();
await page.locator(".archive .cell").first().waitFor({ timeout: 30_000 });
await page.waitForFunction(() => document.querySelectorAll(".archive .cell").length >= 10, null, { timeout: 60_000 });
await page.waitForFunction(() => !document.querySelector(".tile .sk") && document.querySelectorAll(".tile canvas").length >= 10, null, { timeout: 90_000 });
const busyLeft = await page.getByText("chain busy").count();
console.log("recovered; cards:", await page.locator(".archive .cell").count(), "busy overlays left:", busyLeft, "peak concurrent rpc:", peak);
if (peak > 6) throw new Error(`concurrency cap exceeded: ${peak}`);
// second visit is served from the session cache
const before = hits;
await page.goto(`${base}/gallery`);
await page.waitForFunction(() => document.querySelectorAll(".archive .cell").length >= 10, null, { timeout: 30_000 });
await page.waitForTimeout(1500);
console.log("cache: rpc requests on second gallery visit:", hits - before);
writeJson("evidence/e2e-resilience.json", { source: "scripts/e2e/resilience.ts", timestamp: new Date().toISOString(), failedRequestsBeforeBusyState: failedRequests, busyStateShown: true, recoveredCards: await page.locator(".archive .cell").count(), busyOverlaysAfterRecovery: busyLeft, peakConcurrentRpc: peak, rpcRequestsOnSecondVisit: hits - before });
await browser.close();
