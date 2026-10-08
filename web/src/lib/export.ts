import { rowsToSvg } from "@reticle/chain";

export function rowsToPngBlob(rows: boolean[][], px: number): Promise<Blob> {
  const w = rows.length;
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#F2EFE6";
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = "#0B0B0C";
  const cell = px / w;
  rows.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(Math.floor(x * cell), Math.floor(y * cell), Math.ceil(cell), Math.ceil(cell))));
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png failed"))), "image/png"));
}

export function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const downloadSvg = (name: string, rows: boolean[][]) => download(name, new Blob([rowsToSvg(rows)], { type: "image/svg+xml" }));

/* Integer scale so the 32x32 favicon stays crisp: 8 -> x4, 16 -> x2, 32 -> x1. */
export const faviconPng = (rows: boolean[][]) => rowsToPngBlob(rows, 32);

export async function shareCardBlob(rows: boolean[][], lines: string[]): Promise<Blob> {
  const W = 1200, H = 630;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#F2EFE6"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#0B0B0C"; ctx.lineWidth = 2; ctx.strokeRect(24, 24, W - 48, H - 48);
  const art = 480, ax = 72, ay = (H - art) / 2;
  const w = rows.length, cell = art / w;
  ctx.fillStyle = "#0B0B0C";
  rows.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(ax + Math.floor(x * cell), ay + Math.floor(y * cell), Math.ceil(cell), Math.ceil(cell))));
  ctx.strokeRect(ax, ay, art, art);
  ctx.fillStyle = "#0B0B0C";
  ctx.font = "700 72px Helvetica, Arial, sans-serif";
  ctx.fillText(lines[0] ?? "", 620, 250);
  ctx.font = "500 28px Menlo, monospace";
  lines.slice(1).forEach((l, i) => ctx.fillText(l, 620, 310 + i * 44));
  ctx.fillStyle = "#8A5A0B";
  ctx.font = "600 24px Helvetica, Arial, sans-serif";
  ctx.fillText("Reticle · images that are circuits · X Layer", 620, H - 70);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("png failed"))), "image/png"));
}
