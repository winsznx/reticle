import { readFileSync, readdirSync } from "node:fs";
import { bitmapFromStrings, type Bitmap } from "@reticle/compile";
import { root } from "./lib";

export interface DesignFile {
  id: string;
  title: string;
  kind: "formula" | "drawn";
  w: number;
  frames: number;
  formula?: string;
  rows: string[][];
}

export const loadDesign = (idOrPath: string): DesignFile => {
  const path = idOrPath.endsWith(".json") ? idOrPath : new URL(`designs/${idOrPath}.json`, root).pathname;
  return JSON.parse(readFileSync(path, "utf8"));
};
export const designBitmap = (d: DesignFile): Bitmap => bitmapFromStrings(d.rows);
export const allDesignIds = () => readdirSync(new URL("designs/", root)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
