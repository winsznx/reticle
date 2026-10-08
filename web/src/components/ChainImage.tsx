import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { readShape, renderFrame, type CircuitShape } from "@reticle/chain";
import { publicClient } from "../lib/chain";

const cache = new Map<string, { shape: CircuitShape; rows: boolean[][]; ms: number }>();
const key = (c: string, id: bigint, f: number) => `${c.toLowerCase()}:${id}:${f}`;

export interface ChainFrameState {
  shape: CircuitShape | null;
  rows: boolean[][];
  done: boolean;
  ms: number | null;
  error: string | null;
}

export function useChainFrame(circuits: Address, id: bigint, frame: number, enabled = true): ChainFrameState {
  const [state, setState] = useState<ChainFrameState>(() => {
    const hit = cache.get(key(circuits, id, frame));
    return hit ? { shape: hit.shape, rows: hit.rows, done: true, ms: hit.ms, error: null } : { shape: null, rows: [], done: false, ms: null, error: null };
  });

  useEffect(() => {
    if (!enabled) return;
    const k = key(circuits, id, frame);
    const hit = cache.get(k);
    if (hit) {
      setState({ shape: hit.shape, rows: hit.rows, done: true, ms: hit.ms, error: null });
      return;
    }
    const ctrl = new AbortController();
    const t0 = performance.now();
    (async () => {
      try {
        const shape = await readShape(publicClient, circuits, id);
        const partial: boolean[][] = Array.from({ length: shape.w }, () => []);
        setState({ shape, rows: partial, done: false, ms: null, error: null });
        const rows = await renderFrame(publicClient, circuits, id, shape, Math.min(frame, shape.frames - 1), {
          signal: ctrl.signal,
          onRow: (y, row) => {
            partial[y] = row;
            setState((s) => ({ ...s, rows: [...partial] }));
          },
        });
        const ms = performance.now() - t0;
        cache.set(k, { shape, rows, ms });
        setState({ shape, rows, done: true, ms, error: null });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState((s) => ({ ...s, error: (e as Error).message }));
      }
    })();
    return () => ctrl.abort();
  }, [circuits, id, frame, enabled]);

  return state;
}

export function drawRows(canvas: HTMLCanvasElement, rows: boolean[][], w: number) {
  canvas.width = w;
  canvas.height = w;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#F2EFE6";
  ctx.fillRect(0, 0, w, w);
  ctx.fillStyle = "#0B0B0C";
  rows.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(x, y, 1, 1)));
}

export function BitmapCanvas({ rows, w, label }: { rows: boolean[][]; w: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawRows(ref.current, rows, w); }, [rows, w]);
  return <canvas ref={ref} role="img" aria-label={label ?? "bitmap"} />;
}

interface Props {
  circuits: Address;
  id: bigint;
  frame?: number;
  lazy?: boolean;
  onState?: (s: ChainFrameState) => void;
  label?: string;
}

export function ChainImage({ circuits, id, frame = 0, lazy = false, onState, label }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  useEffect(() => {
    if (!lazy || !wrap.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setVisible(true), io.disconnect()), { rootMargin: "200px" });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, [lazy]);

  const st = useChainFrame(circuits, id, frame, visible);
  useEffect(() => { onState?.(st); }, [st, onState]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const w = st.shape?.w ?? 16;
  useEffect(() => { if (canvas.current) drawRows(canvas.current, st.rows, w); }, [st.rows, w]);

  return (
    <div ref={wrap} className="tile" style={{ aspectRatio: "1 / 1" }}>
      <canvas ref={canvas} role="img" aria-label={label ?? `Circuit ${id.toString()} rendered from chain`} />
      {!st.done && !st.error && <span className="sk" />}
      {st.error && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#b3261e", font: "12px var(--font-mono)", lineHeight: 1.3, padding: 8, textAlign: "center" }}>RPC error</span>}
    </div>
  );
}
