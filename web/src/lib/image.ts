/* Local-only image import: no network calls, no dithering, a single brightness threshold. */

export function luminance(r: number, g: number, b: number, a: number): number {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum * a) / 255 + 255 * (1 - a / 255);
}

/* Ink where the pixel is darker than the threshold (0..255). */
export function thresholdBitmap(rgba: Uint8ClampedArray | Uint8Array, size: number, threshold: number, invert = false): boolean[][] {
  const out: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dark = luminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!) < threshold;
      row.push(invert ? !dark : dark);
    }
    out.push(row);
  }
  return out;
}

/* Center-crops to a square and downscales into size x size with the canvas's own area averaging. */
export function downscale(img: CanvasImageSource & { width: number; height: number }, size: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const side = Math.min(img.width, img.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

export async function loadImageFile(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}
