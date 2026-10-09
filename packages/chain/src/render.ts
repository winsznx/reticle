import { bytesToHex, hexToBytes, type Address, type PublicClient } from "viem";
import { circuitsAbi } from "./abi";
import { rowKey, rowStore } from "./cache";
import { inputBytes, unpackBits } from "@reticle/compile";

export interface CircuitShape {
  nIn: number;
  nOut: number;
  gates: number;
  w: number;
  frames: number;
  yBits: number;
}

export class ShapeError extends Error {
  constructor(readonly nIn: number, readonly nOut: number, readonly nState: number) {
    super(`not a square image circuit (nIn=${nIn}, nOut=${nOut}, nState=${nState})`);
    this.name = "ShapeError";
  }
}

export function conformShape(nIn: number, nOut: number, nState: number, gates: number): CircuitShape {
  const yBits = nOut === 8 ? 3 : nOut === 16 ? 4 : nOut === 32 ? 5 : -1;
  if (yBits < 0 || nState !== 0 || nIn < yBits || nIn - yBits > 3) throw new ShapeError(nIn, nOut, nState);
  return { nIn, nOut, gates, w: nOut, frames: 1 << (nIn - yBits), yBits };
}

export async function readShape(client: PublicClient, circuits: Address, id: bigint, useCache = true): Promise<CircuitShape> {
  const store = useCache ? rowStore() : null;
  const key = rowKey(circuits, id, 0, "shape");
  const hit = store?.get(key);
  if (hit) {
    const [nIn, nOut, nState, gates] = hit.split(",").map(Number) as [number, number, number, number];
    return conformShape(nIn, nOut, nState, gates);
  }
  const [nIn, nOut, nState, gates] = await client.readContract({ address: circuits, abi: circuitsAbi, functionName: "circuitInfo", args: [id] });
  store?.set(key, `${nIn},${nOut},${nState},${gates}`);
  return conformShape(nIn, nOut, nState, gates);
}

export async function evalRow(client: PublicClient, circuits: Address, id: bigint, shape: CircuitShape, frame: number, y: number, useCache = true): Promise<boolean[]> {
  const store = useCache ? rowStore() : null;
  const key = rowKey(circuits, id, frame, y);
  const hit = store?.get(key);
  if (hit) return unpackBits(hexToBytes(hit as `0x${string}`), shape.w);
  const input = inputBytes(y | (frame << shape.yBits), shape.nIn);
  const out = await client.readContract({ address: circuits, abi: circuitsAbi, functionName: "eval", args: [id, bytesToHex(input)] });
  store?.set(key, out);
  return unpackBits(hexToBytes(out), shape.w);
}

export interface RenderOptions {
  concurrency?: number;
  useCache?: boolean;
  onRow?: (y: number, row: boolean[], done: number) => void;
  signal?: AbortSignal;
}

export async function renderFrame(client: PublicClient, circuits: Address, id: bigint, shape: CircuitShape, frame: number, opts: RenderOptions = {}): Promise<boolean[][]> {
  const rows: boolean[][] = new Array(shape.w);
  const concurrency = opts.concurrency ?? 6;
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < shape.w) {
      if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const y = next++;
      rows[y] = await evalRow(client, circuits, id, shape, frame, y, opts.useCache ?? true);
      done++;
      opts.onRow?.(y, rows[y]!, done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, shape.w) }, worker));
  return rows;
}

/* Byte-for-byte the string ReticleRenderer.svg returns. */
export function rowsToSvg(rows: boolean[][]): string {
  const w = rows.length;
  let body = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      if (!row[x]) { x++; continue; }
      const start = x;
      while (x < w && row[x]) x++;
      body += `<rect x="${start}" y="${y}" width="${x - start}" height="1"/>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" shape-rendering="crispEdges"><rect width="${w}" height="${w}" fill="#F2EFE6"/><g fill="#0B0B0C">${body}</g></svg>`;
}

export function rowsFromBits(bits: readonly bigint[], w: number): boolean[][] {
  return bits.map((b) => Array.from({ length: w }, (_, x) => ((b >> BigInt(x)) & 1n) === 1n));
}
