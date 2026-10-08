import { describe, expect, it } from "vitest";
import { thresholdBitmap } from "./image";

const px = (...v: number[][]) => new Uint8ClampedArray(v.flat());

describe("thresholdBitmap", () => {
  it("marks dark pixels as ink", () => {
    const data = px([0, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255], [0, 0, 0, 255]);
    expect(thresholdBitmap(data, 2, 128)).toEqual([[true, false], [false, true]]);
  });
  it("treats transparent pixels as paper", () => {
    const data = px([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
    expect(thresholdBitmap(data, 2, 128).flat().some(Boolean)).toBe(false);
  });
  it("respects the threshold and invert", () => {
    const data = px([100, 100, 100, 255], [100, 100, 100, 255], [100, 100, 100, 255], [100, 100, 100, 255]);
    expect(thresholdBitmap(data, 2, 90).flat().every((p) => !p)).toBe(true);
    expect(thresholdBitmap(data, 2, 110).flat().every(Boolean)).toBe(true);
    expect(thresholdBitmap(data, 2, 110, true).flat().every((p) => !p)).toBe(true);
  });
});
