import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { circuitsAbi, evalRow, rendererAbi, rowsToSvg, type CircuitShape } from "@reticle/chain";
import { ChainImage, useChainFrame } from "../components/ChainImage";
import { UsePanel } from "../components/UsePanel";
import { designById, tapeoutByCircuit } from "../lib/data";
import { oklinkAddr, oklinkTx, processor, publicClient, renderer } from "../lib/chain";
import { ms, short } from "../lib/fmt";

interface Verify { path: string; match: boolean; detail: string }

export default function Piece() {
  const { id: idParam } = useParams();
  const num = Number(idParam);
  const valid = Number.isInteger(num) && num > 0 && processor;
  const id = BigInt(valid ? num : 1);
  const [frame, setFrame] = useState(0);
  const [play, setPlay] = useState(true);
  const [shape, setShape] = useState<CircuitShape | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [verify, setVerify] = useState<Verify | "running" | null>(null);

  const st = useChainFrame(processor?.circuits ?? "0x0000000000000000000000000000000000000000", id, frame, !!valid);
  useEffect(() => { if (st.shape) setShape(st.shape); }, [st.shape]);

  useEffect(() => {
    if (!valid) return;
    publicClient.readContract({ address: processor!.circuits, abi: circuitsAbi, functionName: "ownerOf", args: [id] }).then(setOwner).catch(() => setOwner(null));
  }, [valid, id]);

  useEffect(() => {
    if (!play || !shape || shape.frames < 2 || !st.done) return;
    const t = setTimeout(() => setFrame((f) => (f + 1) % shape.frames), 500);
    return () => clearTimeout(t);
  }, [play, shape, st.done, frame]);

  const record = tapeoutByCircuit(num);
  const design = record ? designById(record.designId) : undefined;
  const rows = st.done ? st.rows : null;

  const runVerify = async () => {
    if (!processor || !shape || !rows) return;
    setVerify("running");
    try {
      if (renderer) {
        try {
          const svg = await publicClient.readContract({ address: renderer, abi: rendererAbi, functionName: "svg", args: [processor.circuits, id, frame] });
          const match = svg === rowsToSvg(rows);
          setVerify({ path: "rendered by ReticleRenderer contract", match, detail: match ? `svg() output is identical to the per-row eval render (${shape.w * shape.w}/${shape.w * shape.w} pixels)` : "svg() differs from the per-row eval render" });
          return;
        } catch { /* gas or RPC limit, fall through to the per-row path */ }
      }
      const fresh = await Promise.all(Array.from({ length: shape.w }, async (_, y) => {
        return evalRow(publicClient, processor!.circuits, id, shape, frame, y, false);
      }));
      const matched = fresh.flat().filter((p, i) => p === rows.flat()[i]).length;
      setVerify({ path: "rendered from chain via direct eval", match: matched === shape.w * shape.w, detail: `${matched}/${shape.w * shape.w} pixels match a second independent read` });
    } catch (e) {
      setVerify({ path: "failed", match: false, detail: (e as Error).message });
    }
  };

  const info = useMemo(() => (shape ? `${shape.w}×${shape.w}${shape.frames > 1 ? ` · ${shape.frames} frames` : ""}` : ""), [shape]);

  if (!valid) return <div className="wrap" style={{ padding: "64px 0" }}><h2>Piece not found</h2><p className="muted" style={{ marginTop: 12 }}>That id is not a circuit on the Reticle processor. <Link to="/gallery">Back to the gallery</Link>.</p></div>;

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <div className="eyebrow">Circuit</div>
          <h1 style={{ fontSize: "clamp(30px,4vw,48px)", marginTop: 8 }}>{design ? design.title : "Piece"} <span className="mono faint">#{num}</span></h1>
        </div>
        <Link className="btn" to="/gallery">All pieces</Link>
      </div>
      <div className="piece">
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <div className="tile big-tile"><ChainImage circuits={processor!.circuits} id={id} frame={frame} label={`Circuit ${num} rendered from chain`} /></div>
          <div className="mono faint" style={{ fontSize: 12, display: "flex", justifyContent: "space-between", maxWidth: 640, gap: 12, flexWrap: "wrap" }}>
            <span>{st.done ? `rendered from chain, ${shape?.w} rows in ${ms(st.ms ?? 0)}` : "rendering from chain…"}</span>
            <span>{info}</span>
          </div>
          {shape && shape.frames > 1 && (
            <div className="stage-top" style={{ maxWidth: 640 }}>
              <div className="seg">{Array.from({ length: shape.frames }, (_, i) => <button key={i} aria-pressed={frame === i} onClick={() => { setPlay(false); setFrame(i); }}>{i + 1}</button>)}</div>
              <button className="btn sm" onClick={() => setPlay((p) => !p)}>{play ? "Pause" : "Play"}</button>
            </div>
          )}
          <div style={{ maxWidth: 640, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={runVerify} disabled={!rows || verify === "running"}>{verify === "running" ? "Verifying…" : "Verify on-chain"}</button>
              {verify && verify !== "running" && <span className={verify.match ? "ok" : "bad"} style={{ fontSize: 13 }}>{verify.match ? "✓ match" : "✗ mismatch"} · {verify.path}</span>}
            </div>
            {verify && verify !== "running" && <div className="faint" style={{ fontSize: 12 }}>{verify.detail}</div>}
          </div>
        </div>
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Circuit id</dt><dd>#{num}</dd>
            <dt>Gates</dt><dd>{shape?.gates ?? "…"}{record && <span className="faint"> (naive {record.naiveGates.toLocaleString("en-US")})</span>}</dd>
            <dt>Gates per pixel</dt><dd>{shape ? (shape.gates / (shape.w * shape.w * shape.frames)).toFixed(3) : "…"}</dd>
            <dt>Inputs / outputs</dt><dd>{shape ? `${shape.nIn} / ${shape.nOut}` : "…"}</dd>
            <dt>Owner</dt><dd>{owner ? <a href={oklinkAddr(owner)}>{short(owner, 8, 6)}</a> : "…"}</dd>
            <dt>Tapeout tx</dt><dd>{record ? <a href={oklinkTx(record.tapeoutTx)}>{short(record.tapeoutTx, 8, 6)}</a> : "see processor"}</dd>
            <dt>Processor</dt><dd><a href={oklinkAddr(processor!.circuits)}>{short(processor!.circuits, 8, 6)}</a></dd>
            {design?.formula && (<><dt>Formula</dt><dd>{design.formula}</dd></>)}
          </dl>
          <UsePanel circuits={processor!.circuits} id={num} frame={frame} rows={rows} gates={shape?.gates} />
        </div>
      </div>
    </div>
  );
}
