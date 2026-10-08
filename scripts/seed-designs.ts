import { writeFileSync } from "node:fs";
import { bitmapToStrings, formulaToBitmap } from "@reticle/compile";

const dir = new URL("../designs/", import.meta.url);

const formulas = [
  { id: "xor", title: "XOR", formula: "x ^ y", w: 32, frames: 1 },
  { id: "sierpinski", title: "Sierpinski", formula: "(x & y) == 0", w: 32, frames: 1 },
  { id: "plaid", title: "Plaid", formula: "((x ^ y) >> 2) & 1", w: 32, frames: 1 },
  { id: "rings", title: "Rings", formula: "((x*x + y*y) >> 4) & 1", w: 32, frames: 1 },
  { id: "weave", title: "Weave", formula: "(((x + y) >> 2) ^ ((x - y) >> 2)) & 1", w: 32, frames: 1 },
  { id: "drift", title: "Drift", formula: "(((x + t*2) ^ y) >> 2) & 1", w: 32, frames: 4 },
];

for (const f of formulas) {
  const rows = bitmapToStrings(formulaToBitmap(f.formula, f.w, f.frames));
  writeFileSync(new URL(`${f.id}.json`, dir), JSON.stringify({ ...f, kind: "formula", rows }, null, 2) + "\n");
}

const drawn = [
  {
    id: "crosshair",
    title: "Crosshair",
    rows: [
      ".......##.......", ".......##.......", ".......##.......", ".....######.....",
      "....#..##..#....", "...#........#...", "...#........#...", "#####..##..#####",
      "#####..##..#####", "...#........#...", "...#........#...", "....#..##..#....",
      ".....######.....", ".......##.......", ".......##.......", ".......##.......",
    ],
  },
  {
    id: "mark",
    title: "Mark",
    rows: [
      "................", "................", "..#########.....", "..##########....",
      "..###....####...", "..###.....###...", "..###....####...", "..##########....",
      "..#########.....", "..###..####.....", "..###...####....", "..###....####...",
      "..###.....####..", "..###......###..", "................", "................",
    ],
  },
  {
    id: "badge",
    title: "Badge",
    rows: [
      ".##############.", "#..............#", "#..............#", "#..............#",
      "#..#####.......#", "#..#....#......#", "####.....#.....#", "#..#.....#.##..#",
      "#..#.....#.##..#", "####.....#.....#", "#..#....#......#", "#..#####.......#",
      "#..............#", "#..............#", "#..............#", ".##############.",
    ],
  },
];

for (const d of drawn) {
  writeFileSync(new URL(`${d.id}.json`, dir), JSON.stringify({ id: d.id, title: d.title, kind: "drawn", w: 16, frames: 1, rows: [d.rows] }, null, 2) + "\n");
}
