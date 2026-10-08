import { readFileSync, writeFileSync } from "node:fs";
import { minify } from "terser";
import { root, readJson } from "./lib";

const src = readFileSync(new URL("web/embed/reticle-embed.src.js", root), "utf8");
const facts = readJson<{ renderer?: { address: string } }>("submission-facts.json", {});
const gas = readJson<{ gasPerGate?: number; svgBudget?: number }>("evidence/gas.json", {});
const filled = src
  .replace("__RENDERER__", facts.renderer?.address ?? "")
  .replace("__GAS_PER_GATE__", String(gas.gasPerGate ?? 12000))
  .replace("__GAS_BUDGET__", String(gas.svgBudget ?? 40_000_000));
const min = await minify(filled, { compress: { passes: 2 }, mangle: true, format: { comments: false } });
const code = min.code!;
writeFileSync(new URL("web/public/reticle-embed.js", root), code);
const bytes = Buffer.byteLength(code);
console.log(`reticle-embed.js ${bytes} bytes`);
if (bytes >= 4096) throw new Error("embed must stay under 4 KB");
