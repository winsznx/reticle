import type { Bitmap } from "./types";

export const blankBitmap = (w: number, frames = 1): Bitmap => ({
  w,
  frames: Array.from({ length: frames }, () => Array.from({ length: w }, () => new Array<boolean>(w).fill(false))),
});

/* Designs are stored as arrays of strings, '#' = ink and '.' = paper, one string per row. */
export function bitmapFromStrings(frames: string[][]): Bitmap {
  const w = frames[0]!.length;
  return {
    w,
    frames: frames.map((f) => {
      if (f.length !== w) throw new Error("frame height must equal width");
      return f.map((r) => {
        if (r.length !== w) throw new Error("row length must equal width");
        return [...r].map((c) => c === "#");
      });
    }),
  };
}

export const bitmapToStrings = (bm: Bitmap): string[][] => bm.frames.map((f) => f.map((r) => r.map((p) => (p ? "#" : ".")).join("")));

export function bitmapsEqual(a: Bitmap, b: Bitmap): boolean {
  if (a.w !== b.w || a.frames.length !== b.frames.length) return false;
  return a.frames.every((f, t) => f.every((r, y) => r.every((p, x) => p === b.frames[t]![y]![x])));
}
