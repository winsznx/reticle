// @vitest-environment jsdom
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { minify } from "terser";

const src = readFileSync(resolve(process.cwd(), "embed/reticle-embed.src.js"), "utf8");
const RENDERER = "0x" + "ab".repeat(20);
const CIRCUITS = "0x" + "cd".repeat(20);
const word = (n: number | bigint) => BigInt(n).toString(16).padStart(64, "0");

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#F2EFE6"/></svg>';
const abiString = (s: string) => {
  const hex = Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
  return "0x" + word(32) + word(s.length) + hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
};

function mockRpc(opts: { rendererFails: boolean }) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    const { method, params } = JSON.parse(init.body);
    let result: string;
    if (method === "eth_blockNumber") result = "0x1f4";
    else {
      const { to, data } = params[0] as { to: string; data: string };
      calls.push(data.slice(0, 10));
      if (data.startsWith("0x084d60f1")) result = "0x" + word(4) + word(8) + word(0) + word(7);
      else if (data.startsWith("0xb9a4e835")) {
        if (opts.rendererFails) return { json: async () => ({ error: { message: "execution reverted" } }) };
        result = abiString(SVG);
      } else if (data.startsWith("0x934d06ea")) result = "0x" + word(32) + word(1) + "81".padEnd(64, "0");
      else throw new Error("unexpected call " + to + data);
    }
    return { json: async () => ({ result }) };
  });
  return calls;
}

async function load(renderer: string) {
  const code = src.replace("__RENDERER__", renderer).replace("__GAS_PER_GATE__", "12000").replace("__GAS_BUDGET__", "1000000000");
  document.body.innerHTML = `<img id="a" data-reticle="${CIRCUITS}:3" data-frame="0" data-verify>`;
  new Function(code)();
  const img = document.getElementById("a") as HTMLImageElement;
  await vi.waitFor(() => expect(img.getAttribute("data-reticle-state")).not.toBe("loading"), { timeout: 2000 });
  return img;
}

describe("reticle-embed", () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it("stays under 4 KB minified", async () => {
    const min = await minify(src.replace("__RENDERER__", RENDERER).replace("__GAS_PER_GATE__", "12000").replace("__GAS_BUDGET__", "1000000000"), { compress: { passes: 2 }, mangle: true });
    expect(Buffer.byteLength(min.code!)).toBeLessThan(4096);
    expect(statSync(resolve(process.cwd(), "public/reticle-embed.js")).size).toBeLessThan(4096);
  });

  it("uses the renderer and labels the block when data-verify is set", async () => {
    const calls = mockRpc({ rendererFails: false });
    const img = await load(RENDERER);
    expect(img.getAttribute("data-reticle-state")).toBe("ok");
    expect(decodeURIComponent(img.src.split(",")[1]!)).toBe(SVG);
    expect(img.title).toBe("rendered from chain, block 500 (ReticleRenderer.svg)");
    expect(calls).toContain("0xb9a4e835");
  });

  it("falls back to per-row eval when the renderer call fails", async () => {
    const calls = mockRpc({ rendererFails: true });
    const img = await load(RENDERER);
    expect(img.getAttribute("data-reticle-state")).toBe("ok");
    expect(calls.filter((c) => c === "0x934d06ea")).toHaveLength(8);
    expect(img.title).toContain("per-row eval");
    expect(decodeURIComponent(img.src.split(",")[1]!)).toContain('viewBox="0 0 8 8"');
  });

  it("goes straight to eval when no renderer is configured", async () => {
    const calls = mockRpc({ rendererFails: false });
    await load("");
    expect(calls).not.toContain("0xb9a4e835");
  });

  it("marks malformed attributes as errors without throwing", async () => {
    mockRpc({ rendererFails: false });
    document.body.innerHTML = '<img id="b" data-reticle="nonsense">';
    const code = src.replace("__RENDERER__", "").replace("__GAS_PER_GATE__", "1").replace("__GAS_BUDGET__", "1");
    new Function(code)();
    expect(document.getElementById("b")!.getAttribute("data-reticle-state")).toBe("error");
  });
});
