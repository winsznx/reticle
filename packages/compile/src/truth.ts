import type { Bitmap } from "./types";

export const log2 = (n: number): number => {
  const l = Math.log2(n);
  if (!Number.isInteger(l)) throw new Error(`${n} is not a power of two`);
  return l;
};

export interface Shape {
  w: number;
  frames: number;
  yBits: number;
  tBits: number;
  nIn: number;
  nOut: number;
}

export function shapeOf(w: number, frames: number): Shape {
  if (![8, 16, 32].includes(w)) throw new Error(`unsupported width ${w}`);
  if (![1, 2, 4, 8].includes(frames)) throw new Error(`unsupported frame count ${frames}`);
  const yBits = log2(w);
  const tBits = log2(frames);
  return { w, frames, yBits, tBits, nIn: yBits + tBits, nOut: w };
}

/* Minterm index m = y | (t << yBits); one truth table per output column x. */
export function truthTables(bm: Bitmap): { shape: Shape; tables: Uint8Array[] } {
  const shape = shapeOf(bm.w, bm.frames.length);
  const size = 1 << shape.nIn;
  const tables: Uint8Array[] = [];
  for (let x = 0; x < bm.w; x++) {
    const table = new Uint8Array(size);
    for (let t = 0; t < shape.frames; t++) {
      for (let y = 0; y < bm.w; y++) {
        if (bm.frames[t]![y]![x]) table[y | (t << shape.yBits)] = 1;
      }
    }
    tables.push(table);
  }
  return { shape, tables };
}
