import { useCallback, useEffect, useRef } from "react";

export type Tool = "pencil" | "erase";
export interface Mirror { x: boolean; y: boolean }

interface Props {
  w: number;
  frame: boolean[][];
  tool: Tool;
  mirror: Mirror;
  onStroke: (next: boolean[][], commit: boolean) => void;
  readOnly?: boolean;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function PixelGrid({ w, frame, tool, mirror, onStroke, readOnly }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hover = useRef<[number, number] | null>(null);
  const drag = useRef<{ value: boolean; last: [number, number]; work: boolean[][] } | null>(null);

  const draw = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const box = c.parentElement!.getBoundingClientRect().width;
    const dpr = window.devicePixelRatio || 1;
    const cell = Math.max(4, Math.floor((box * dpr) / w));
    c.width = cell * w;
    c.height = cell * w;
    c.style.width = "100%";
    c.style.height = "auto";
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#F2EFE6";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#0B0B0C";
    frame.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect(x * cell, y * cell, cell, cell)));
    ctx.strokeStyle = "rgba(11,11,12,0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
      const major = i % 8 === 0;
      if (major) continue;
      ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, c.height);
      ctx.moveTo(0, i * cell + 0.5); ctx.lineTo(c.width, i * cell + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(11,11,12,0.38)";
    ctx.beginPath();
    for (let i = 0; i <= w; i += 8) {
      ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, c.height);
      ctx.moveTo(0, i * cell + 0.5); ctx.lineTo(c.width, i * cell + 0.5);
    }
    ctx.stroke();
    if (mirror.x) { ctx.fillStyle = "#E8A33D"; ctx.fillRect((c.width >> 1) - 1, 0, 2, c.height); }
    if (mirror.y) { ctx.fillStyle = "#E8A33D"; ctx.fillRect(0, (c.height >> 1) - 1, c.width, 2); }
    const h = hover.current;
    if (h && !readOnly) {
      ctx.strokeStyle = css("--accent") || "#E8A33D";
      ctx.lineWidth = 2;
      ctx.strokeRect(h[0] * cell + 1, h[1] * cell + 1, cell - 2, cell - 2);
    }
  }, [w, frame, mirror, readOnly]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(ref.current!.parentElement!);
    return () => ro.disconnect();
  }, [draw]);

  const cellAt = (e: React.PointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.min(w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * w)));
    const y = Math.min(w - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * w)));
    return [x, y];
  };

  const paint = (work: boolean[][], x: number, y: number, v: boolean) => {
    work[y]![x] = v;
    if (mirror.x) work[y]![w - 1 - x] = v;
    if (mirror.y) work[w - 1 - y]![x] = v;
    if (mirror.x && mirror.y) work[w - 1 - y]![w - 1 - x] = v;
  };

  const line = (work: boolean[][], a: [number, number], b: [number, number], v: boolean) => {
    let [x0, y0] = a;
    const [x1, y1] = b;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      paint(work, x0, y0, v);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  return (
    <canvas
      ref={ref}
      className="grid-canvas"
      role="img"
      aria-label={`${w} by ${w} drawing grid`}
      style={{ cursor: readOnly ? "default" : "crosshair", display: "block" }}
      onPointerDown={(e) => {
        if (readOnly) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const [x, y] = cellAt(e);
        const value = tool === "pencil";
        const work = frame.map((r) => [...r]);
        paint(work, x, y, value);
        drag.current = { value, last: [x, y], work };
        onStroke(work, false);
      }}
      onPointerMove={(e) => {
        const p = cellAt(e);
        hover.current = p;
        const d = drag.current;
        if (d) {
          line(d.work, d.last, p, d.value);
          d.last = p;
          onStroke(d.work.map((r) => [...r]), false);
        } else draw();
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d) onStroke(d.work, true);
      }}
      onPointerLeave={() => { hover.current = null; if (!drag.current) draw(); }}
    />
  );
}
