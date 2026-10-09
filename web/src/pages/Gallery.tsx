import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { circuitsAbi, readShape } from "@reticle/chain";
import { ChainImage } from "../components/ChainImage";
import { designById, tapeoutByCircuit } from "../lib/data";
import { processor, publicClient } from "../lib/chain";

interface Item { id: number; gates: number | null; w: number | null; frames: number | null; ok: boolean }
type Sort = "newest" | "fewest";

export default function Gallery() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!processor) return;
    let alive = true;
    setError(null);
    (async () => {
      try {
        const next = await publicClient.readContract({ address: processor!.circuits, abi: circuitsAbi, functionName: "nextId" });
        const ids = Array.from({ length: Number(next) }, (_, i) => i + 1);
        const list: Item[] = ids.map((id) => ({ id, gates: null, w: null, frames: null, ok: true }));
        if (alive) setItems(list);
        await Promise.all(ids.map(async (id) => {
          try {
            const shape = await readShape(publicClient, processor!.circuits, BigInt(id));
            const it = { id, gates: shape.gates, w: shape.w, frames: shape.frames, ok: true };
            if (alive) setItems((cur) => cur?.map((x) => (x.id === id ? it : x)) ?? null);
          } catch { /* leave the card in loading state */ }
        }));
      } catch (e) { if (alive) setError((e as Error).message); }
    })();
    return () => { alive = false; };
  }, [attempt]);

  const sorted = useMemo(() => {
    if (!items) return [];
    const c = [...items];
    return sort === "newest" ? c.sort((a, b) => b.id - a.id) : c.sort((a, b) => (a.gates ?? 1e9) - (b.gates ?? 1e9));
  }, [items, sort]);

  const densest = useMemo(() => {
    const known = (items ?? []).filter((i) => i.gates && i.w);
    if (!known.length) return null;
    return known.reduce((best, i) => (i.gates! / (i.w! * i.w! * (i.frames ?? 1)) < best.gates! / (best.w! * best.w! * (best.frames ?? 1)) ? i : best)).id;
  }, [items]);

  return (
    <div className="wrap" style={{ paddingBottom: 64 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gallery</div>
          <h1 style={{ fontSize: "clamp(30px,4vw,48px)", marginTop: 8 }}>Every image is a circuit</h1>
          <p className="muted" style={{ marginTop: 12, maxWidth: "56ch" }}>Read from the processor with <span className="mono">nextId()</span>. Each thumbnail is drawn by that circuit's own eval, row by row.</p>
        </div>
        <div className="seg" aria-label="Sort">
          <button aria-pressed={sort === "newest"} onClick={() => setSort("newest")}>Newest</button>
          <button aria-pressed={sort === "fewest"} onClick={() => setSort("fewest")}>Fewest gates</button>
        </div>
      </div>
      {!processor && <div className="panel"><div className="body">The Reticle processor is not deployed yet.</div></div>}
      {error && (
        <div className="panel" role="alert"><div className="body" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>chain busy, retry</span>
          <button className="btn sm" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div></div>
      )}
      {items && items.length === 0 && <div className="panel"><div className="body">No circuits taped out yet. <Link to="/make">Make the first one.</Link></div></div>}
      <div className="archive">
        {sorted.map((it) => {
          const rec = tapeoutByCircuit(it.id);
          const title = rec ? designById(rec.designId)?.title : undefined;
          return (
            <Link key={it.id} to={`/piece/${it.id}`} className="cell">
              <ChainImage circuits={processor!.circuits} id={BigInt(it.id)} lazy label={`Circuit ${it.id}`} />
              <div className="meta"><b>{title ?? "Circuit"} #{it.id}</b><span>{it.gates ?? "…"} g</span></div>
              <div className="meta faint"><span>{it.w ? `${it.w}×${it.w}${it.frames && it.frames > 1 ? `·${it.frames}f` : ""}` : ""}</span>{densest === it.id && <span className="chip accent">densest</span>}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
