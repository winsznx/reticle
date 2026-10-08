import { compileBitmap, compileNaive, matchesBitmap } from "@reticle/compile";
import { allDesignIds, designBitmap, loadDesign } from "./design";
import { writeJson } from "./lib";

const rows = allDesignIds().map((id) => {
  const d = loadDesign(id);
  const bm = designBitmap(d);
  const t0 = performance.now();
  const res = compileBitmap(bm);
  const ms = performance.now() - t0;
  const naive = compileNaive(bm);
  const m = matchesBitmap(res.bytes, bm);
  const pixels = d.w * d.w * d.frames;
  return { id, kind: d.kind, w: d.w, frames: d.frames, gates: res.gates, naive, ratio: +(res.gates / naive).toFixed(4), gatesPerPixel: +(res.gates / pixels).toFixed(4), compileMs: Math.round(ms), simMatch: `${m.matched}/${m.total}` };
});
const drawn = rows.filter((r) => r.kind === "drawn");
const summary = {
  designs: rows.length,
  meanRatio: +(rows.reduce((n, r) => n + r.ratio, 0) / rows.length).toFixed(4),
  meanRatioDrawn: +(drawn.reduce((n, r) => n + r.ratio, 0) / drawn.length).toFixed(4),
  preRegisteredNull: "drawn ratio >= 0.9 narrows the claim to formula pieces",
  nullHolds: drawn.reduce((n, r) => n + r.ratio, 0) / drawn.length >= 0.9,
};
writeJson("evidence/bench.json", { source: "scripts/bench.ts", timestamp: new Date().toISOString(), rows, summary });
console.table(rows);
console.log(summary);
