import { describe, expect, it } from "vitest";
import { conformShape, rowsToSvg, ShapeError } from "./render";

describe("rowsToSvg", () => {
  it("matches the string ReticleRenderer.svg returns (see ReticleRenderer.t.sol test_svg_runs)", () => {
    const rows = Array.from({ length: 8 }, () => new Array<boolean>(8).fill(false));
    for (const x of [0, 1, 2, 3]) rows[0]![x] = true;
    rows[7]![0] = true;
    rows[7]![7] = true;
    expect(rowsToSvg(rows)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
        '<rect width="8" height="8" fill="#F2EFE6"/><g fill="#0B0B0C">' +
        '<rect x="0" y="0" width="4" height="1"/><rect x="0" y="7" width="1" height="1"/><rect x="7" y="7" width="1" height="1"/></g></svg>',
    );
  });
});

describe("conformShape", () => {
  it("accepts square circuits with up to 8 frames", () => {
    expect(conformShape(4, 8, 0, 10)).toMatchObject({ w: 8, frames: 2, yBits: 3 });
    expect(conformShape(8, 32, 0, 10)).toMatchObject({ w: 32, frames: 8 });
  });
  it("rejects non-square, sequential and too many frame bits", () => {
    expect(() => conformShape(8, 2, 0, 1)).toThrow(ShapeError);
    expect(() => conformShape(5, 16, 1, 1)).toThrow(ShapeError);
    expect(() => conformShape(9, 32, 0, 1)).toThrow(ShapeError);
  });
});
