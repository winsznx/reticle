import { describe, expect, it } from "vitest";
import { BudgetError, blankBitmap, compileBitmap, compileNaive, formulaToBitmap, FormulaError, matchesBitmap, gateCount, type Bitmap } from "./index";

const PRESETS = ["x ^ y", "(x & y) == 0", "((x ^ y) >> 2) & 1", "((x*x + y*y) >> 4) & 1", "((x + t) ^ y) & 4"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomBitmap(r: () => number, w: number, f: number, density: number): Bitmap {
  return { w, frames: Array.from({ length: f }, () => Array.from({ length: w }, () => Array.from({ length: w }, () => r() < density))) };
}

describe("compiler", () => {
  for (const f of PRESETS) {
    for (const [w, frames] of [[16, 1], [32, 1], [16, 4], [32, 8]] as const) {
      it(`preset ${f} @${w}x${w}x${frames} matches sim`, () => {
        const bm = formulaToBitmap(f, w, frames);
        const res = compileBitmap(bm, 100000);
        const m = matchesBitmap(res.bytes, bm);
        expect(m.matched).toBe(m.total);
        expect(gateCount(res.bytes)).toBe(res.gates);
        expect(res.gates).toBeLessThanOrEqual(compileNaive(bm));
      });
    }
  }

  it("200 random bitmaps are pixel exact and never exceed naive", () => {
    const r = rng(7);
    const sizes: [number, number][] = [[8, 1], [8, 2], [16, 1], [16, 2], [32, 1], [32, 4]];
    for (let i = 0; i < 200; i++) {
      const [w, f] = sizes[i % sizes.length]!;
      const bm = randomBitmap(r, w, f, [0.1, 0.5, 0.9][i % 3]!);
      const res = compileBitmap(bm, 100000);
      const m = matchesBitmap(res.bytes, bm);
      expect(m.matched, `case ${i} ${w}x${w}x${f}`).toBe(m.total);
      expect(res.gates).toBeLessThanOrEqual(compileNaive(bm));
    }
  }, 120000);

  it("blank design is constant zero and renders blank", () => {
    const bm = blankBitmap(16);
    const res = compileBitmap(bm);
    expect(res.gates).toBe(16);
    expect(matchesBitmap(res.bytes, bm)).toEqual({ total: 256, matched: 256 });
  });

  it("full design is constant one", () => {
    const bm = formulaToBitmap("1", 8, 1);
    const res = compileBitmap(bm);
    expect(matchesBitmap(res.bytes, bm).matched).toBe(64);
  });

  it("refuses above budget with a named error", () => {
    const bm = randomBitmap(rng(3), 32, 1, 0.5);
    expect(() => compileBitmap(bm, 100)).toThrow(BudgetError);
  });

  it("compiles a 32x32 frame in under a second", () => {
    const bm = randomBitmap(rng(11), 32, 1, 0.5);
    const t0 = performance.now();
    compileBitmap(bm, 100000);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("formula", () => {
  it("evaluates x ^ y", () => {
    const bm = formulaToBitmap("x ^ y", 8, 1);
    expect(bm.frames[0]![3]![5]).toBe(((3 ^ 5) & 1) === 1);
  });
  it("rejects unknown names and code-like input", () => {
    expect(() => formulaToBitmap("constructor", 8, 1)).toThrow(FormulaError);
    expect(() => formulaToBitmap("alert(1)", 8, 1)).toThrow(FormulaError);
    expect(() => formulaToBitmap("x +", 8, 1)).toThrow(FormulaError);
    expect(() => formulaToBitmap("(((", 8, 1)).toThrow(FormulaError);
  });
  it("uses C precedence for comparison versus bitwise and", () => {
    const bm = formulaToBitmap("x & 1 == 1", 8, 1);
    expect(bm.frames[0]![0]![1]).toBe(true);
    expect(bm.frames[0]![0]![2]).toBe(false);
  });
});
