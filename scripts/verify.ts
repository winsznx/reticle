import { readShape, renderFrame, rendererAbi, rowsFromBits, rowsToSvg } from "@reticle/chain";
import { BudgetError, compileBitmap, encodeNetlist, formulaToBitmap, matchesBitmap, type Netlist } from "@reticle/compile";
import { designBitmap, loadDesign } from "./design";
import { loadFacts, publicClient, readJson, writeJson } from "./lib";

const facts = loadFacts();
const taped = readJson<{ designId: string; circuitId: number; gates: number }[]>("evidence/tapeouts.json", []);
if (!facts.processor || taped.length === 0) throw new Error("nothing taped out yet");
const { circuits } = facts.processor;
const renderer = facts.renderer?.address;

const results = [];
for (const t of taped) {
  const d = loadDesign(t.designId);
  const bm = designBitmap(d);
  const id = BigInt(t.circuitId);
  const shape = await readShape(publicClient, circuits, id);
  let direct = 0;
  let viaRenderer: number | null = renderer ? 0 : null;
  let svgEqual: boolean | null = renderer ? true : null;
  for (let f = 0; f < shape.frames; f++) {
    const rows = await renderFrame(publicClient, circuits, id, shape, f);
    for (let y = 0; y < shape.w; y++) for (let x = 0; x < shape.w; x++) if (rows[y]![x] === bm.frames[f]![y]![x]) direct++;
    if (renderer) {
      const bits = await publicClient.readContract({ address: renderer, abi: rendererAbi, functionName: "rows", args: [circuits, id, f] });
      const rr = rowsFromBits(bits, shape.w);
      for (let y = 0; y < shape.w; y++) for (let x = 0; x < shape.w; x++) if (rr[y]![x] === bm.frames[f]![y]![x]) viaRenderer!++;
      if (f === 0) {
        const svg = await publicClient.readContract({ address: renderer, abi: rendererAbi, functionName: "svg", args: [circuits, id, 0] });
        svgEqual = svg === rowsToSvg(rows);
      }
    }
  }
  const total = shape.frames * shape.w * shape.w;
  results.push({ designId: t.designId, circuitId: t.circuitId, gates: t.gates, total, directEval: direct, viaRenderer, svgEqualsClientSvg: svgEqual, pass: direct === total && (viaRenderer === null || viaRenderer === total) && svgEqual !== false });
  console.log(t.designId, `#${t.circuitId}`, `${direct}/${total}`, viaRenderer === null ? "" : `renderer ${viaRenderer}/${total}`, svgEqual === null ? "" : `svg ${svgEqual}`);
}

const first = loadDesign([...taped].sort((a, b) => b.gates - a.gates)[0]!.designId);
const bm = designBitmap(first);
const compiled = compileBitmap(bm);
const net: Netlist = { nIn: compiled.shape.nIn, nOut: compiled.shape.nOut, gates: compiled.netlist.gates.map((g) => ({ ...g })) };
let tamper: { gate: number; differsAfterMutation: boolean } | null = null;
for (let g = 0; g < net.gates.length; g++) {
  const mutated: Netlist = { ...net, gates: net.gates.map((x, i) => (i === g ? { a: x.a, b: x.b === 1 ? 0 : 1 } : x)) };
  const m = matchesBitmap(encodeNetlist(mutated), bm);
  if (m.matched !== m.total) { tamper = { gate: g, differsAfterMutation: true }; break; }
}
tamper ??= { gate: -1, differsAfterMutation: false };

let badShape: { checked: string; reverted: boolean } | null = null;
if (renderer) {
  const nonSquare = "0x839bdD6fa7A66416A609A735e11DE5411B98574e" as const;
  try {
    await publicClient.readContract({ address: renderer, abi: rendererAbi, functionName: "shape", args: [nonSquare, 1n] });
    badShape = { checked: `${nonSquare} #1`, reverted: false };
  } catch (e) {
    badShape = { checked: `${nonSquare} #1`, reverted: /BadShape|reverted/i.test(String((e as Error).message)) };
  }
}

let budgetRefused = false;
try { compileBitmap(formulaToBitmap("((x*3 + y*5) >> 3) & 1", 32, 1), 100); } catch (e) { budgetRefused = e instanceof BudgetError; }

const out = {
  source: "scripts/verify.ts", timestamp: new Date().toISOString(), circuits, renderer: renderer ?? null,
  summary: { designs: results.length, passed: results.filter((r) => r.pass).length },
  results, tamper, badShape, budgetRefused,
};
writeJson("evidence/verify.json", out);
console.log(out.summary, { tamper, badShape, budgetRefused });
if (out.summary.passed !== out.summary.designs) process.exit(1);
