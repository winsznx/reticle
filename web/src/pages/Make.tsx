import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { bytesToHex, decodeEventLog, keccak256, type Address, type Hex } from "viem";
import { circuitsAbi, readShape, renderFrame, transistorsAbi } from "@reticle/chain";
import { BudgetError, DEFAULT_BUDGET, blankBitmap, compileBitmap, compileNaive, formulaToBitmap, FormulaError, rowsFromBytes, type Bitmap, type CompileResult } from "@reticle/compile";
import { PixelGrid, type Mirror, type Tool } from "../components/PixelGrid";
import { BitmapCanvas } from "../components/ChainImage";
import { CauseStrip, type CauseState } from "../components/CauseStrip";
import { PRESETS, drawPathVerified } from "../lib/presets";
import { connectWallet, injected, isRejection, oklinkTx, processor, publicClient, switchToXLayer, walletClient } from "../lib/chain";
import { okb, short } from "../lib/fmt";
import { tapeouts } from "../lib/data";
import { downscale, loadImageFile, thresholdBitmap } from "../lib/image";

type Mode = "draw" | "formula" | "upload";
type Size = 8 | 16 | 32;
type FrameCount = 1 | 2 | 4;

const blank = (w: number) => Array.from({ length: w }, () => new Array<boolean>(w).fill(false));
const resample = (f: boolean[][], w: number) => Array.from({ length: w }, (_, y) => Array.from({ length: w }, (_, x) => f[Math.floor((y * f.length) / w)]![Math.floor((x * f.length) / w)]!));

const avgTapeoutMs = tapeouts.length ? Math.round(tapeouts.reduce((n, t) => n + t.tapeoutCompletionMs, 0) / tapeouts.length) : null;

interface Fees { mintPrice: bigint; protocolFee: bigint; tapeoutFee: bigint }
interface Wallet { address: Address; chainId: number }

type Phase =
  | { kind: "idle" }
  | { kind: "minting"; amount: number; tx?: Hex; block?: bigint }
  | { kind: "tapeout"; tx?: Hex }
  | { kind: "rendering"; done: number; total: number }
  | { kind: "done"; id: bigint; matched: number; total: number; rows: boolean[][][]; tx: Hex; ms: number }
  | { kind: "mismatch"; id: bigint; matched: number; total: number; rows: boolean[][][] }
  | { kind: "error"; message: string };

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const ICONS = {
  pencil: "M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3",
  erase: "M4 16l9-9 6 6-5 5H8zM9 21h11",
  mirrorX: "M12 3v18M7 8l-3 4 3 4M17 8l3 4-3 4",
  mirrorY: "M3 12h18M8 7l4-3 4 3M8 17l4 3 4-3",
  invert: "M12 3a9 9 0 100 18V3z",
  clear: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  undo: "M9 14L4 9l5-5M4 9h9a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9h-9a6 6 0 000 12h3",
};

export default function Make() {
  const [mode, setMode] = useState<Mode>("draw");
  const [size, setSize] = useState<Size>(16);
  const [frameCount, setFrameCount] = useState<FrameCount>(1);
  const [frames, setFrames] = useState<boolean[][][]>([blank(16)]);
  const [fi, setFi] = useState(0);
  const [tool, setTool] = useState<Tool>("pencil");
  const [mirror, setMirror] = useState<Mirror>({ x: false, y: false });
  const history = useRef<{ past: boolean[][][][]; future: boolean[][][][] }>({ past: [], future: [] });

  const [formula, setFormula] = useState(PRESETS[0]?.formula ?? "(x & y) == 0");
  const [fSize, setFSize] = useState<Size>(PRESETS[0]?.w ?? 32);
  const [fFrames, setFFrames] = useState<1 | 2 | 4 | 8>(PRESETS[0]?.frames ?? 1);

  const [up, setUp] = useState<{ name: string; bitmap: ImageBitmap | null; size: 16 | 32; threshold: number; invert: boolean }>({ name: "", bitmap: null, size: 16, threshold: 128, invert: false });

  const [fees, setFees] = useState<Fees | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inflight = useRef(new Set<string>());
  const finished = useRef(new Map<string, bigint>());

  const bitmap: Bitmap | null = useMemo(() => {
    if (mode === "draw") return { w: size, frames };
    if (mode === "formula") {
      try { return formulaToBitmap(formula, fSize, fFrames); } catch { return null; }
    }
    return null;
  }, [mode, size, frames, formula, fSize, fFrames]);

  const formulaError = useMemo(() => {
    if (mode !== "formula") return null;
    try { formulaToBitmap(formula, fSize, fFrames); return null; } catch (e) { return e instanceof FormulaError ? e.message : "invalid formula"; }
  }, [mode, formula, fSize, fFrames]);

  const [compiled, setCompiled] = useState<{ ok: CompileResult; naive: number | null } | { error: string; gates?: number } | null>(null);
  useEffect(() => {
    if (!bitmap) { setCompiled(null); return; }
    const h = setTimeout(() => {
      try {
        const ok = compileBitmap(bitmap);
        setCompiled({ ok, naive: null });
        setTimeout(() => {
          try { setCompiled((c) => (c && "ok" in c && c.ok === ok ? { ok, naive: compileNaive(bitmap) } : c)); } catch { /* baseline is informational */ }
        }, 30);
      } catch (e) {
        setCompiled(e instanceof BudgetError ? { error: `needs ${e.gates} gates, budget is ${e.budget}`, gates: e.gates } : { error: (e as Error).message });
      }
    }, 150);
    return () => clearTimeout(h);
  }, [bitmap]);

  const ok = compiled && "ok" in compiled ? compiled.ok : null;
  const naive = compiled && "ok" in compiled ? compiled.naive : null;
  const designHash = useMemo(() => (ok ? keccak256(bytesToHex(ok.bytes)) : null), [ok]);

  useEffect(() => {
    if (!processor) return;
    let alive = true;
    const load = async () => {
      try {
        const [mintPrice, protocolFee, tapeoutFee] = await Promise.all([
          publicClient.readContract({ address: processor!.transistors, abi: transistorsAbi, functionName: "mintPrice" }),
          publicClient.readContract({ address: processor!.transistors, abi: transistorsAbi, functionName: "protocolFee" }),
          publicClient.readContract({ address: processor!.circuits, abi: circuitsAbi, functionName: "TAPEOUT_FEE" }),
        ]);
        if (alive) setFees({ mintPrice, protocolFee, tapeoutFee });
      } catch { /* fee display stays empty, tx path re-reads anyway */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!wallet) return;
    publicClient.getBalance({ address: wallet.address }).then(setBalance).catch(() => setBalance(null));
  }, [wallet, phase.kind]);

  useEffect(() => {
    const eth = injected() as (ReturnType<typeof injected> & { on?: (e: string, f: (...a: never[]) => void) => void }) | undefined;
    eth?.on?.("chainChanged", ((id: string) => setWallet((w) => (w ? { ...w, chainId: parseInt(id, 16) } : w))) as never);
    eth?.on?.("accountsChanged", ((a: Address[]) => setWallet((w) => (a[0] ? { address: a[0], chainId: w?.chainId ?? 0 } : null))) as never);
  }, []);

  const pushHistory = useCallback((prev: boolean[][][]) => {
    history.current.past.push(prev);
    if (history.current.past.length > 60) history.current.past.shift();
    history.current.future = [];
  }, []);

  const strokeBase = useRef<boolean[][][] | null>(null);
  const onStroke = (next: boolean[][], commit: boolean) => {
    if (!strokeBase.current) strokeBase.current = frames;
    setFrames((fs) => fs.map((f, i) => (i === fi ? next : f)));
    if (commit) { pushHistory(strokeBase.current!); strokeBase.current = null; }
    resetResult();
  };
  const resetResult = () => setPhase((p) => (p.kind === "done" || p.kind === "mismatch" || p.kind === "error" ? { kind: "idle" } : p));

  const edit = (fn: (fs: boolean[][][]) => boolean[][][]) => { pushHistory(frames); setFrames(fn(frames)); resetResult(); };
  const undo = () => { const h = history.current; const p = h.past.pop(); if (p) { h.future.push(frames); setFrames(p); } };
  const redo = () => { const h = history.current; const n = h.future.pop(); if (n) { h.past.push(frames); setFrames(n); } };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "draw" || (e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (e.key === "b") setTool("pencil");
      else if (e.key === "e") setTool("erase");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const changeSize = (s: Size) => { pushHistory(frames); setSize(s); setFrames(frames.map((f) => resample(f, s))); setFi(0); setPhase({ kind: "idle" }); };
  const changeFrameCount = (n: FrameCount) => {
    pushHistory(frames);
    const next = Array.from({ length: n }, (_, i) => frames[i] ?? frames[frames.length - 1]!.map((r) => [...r]));
    setFrameCount(n); setFrames(next); setFi(Math.min(fi, n - 1)); setPhase({ kind: "idle" });
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try { setUp((u) => ({ ...u, name: file.name, bitmap: null })); const bm = await loadImageFile(file); setUp((u) => ({ ...u, bitmap: bm })); }
    catch { setUp((u) => ({ ...u, name: `${file.name} (could not read)`, bitmap: null })); }
  };
  const uploadBits = useMemo(() => (up.bitmap ? thresholdBitmap(downscale(up.bitmap, up.size), up.size, up.threshold, up.invert) : null), [up]);
  const loadIntoDraw = () => {
    if (!uploadBits) return;
    pushHistory(frames);
    setSize(up.size); setFrameCount(1); setFrames([uploadBits]); setFi(0); setMirror({ x: false, y: false }); setMode("draw"); setPhase({ kind: "idle" });
  };

  const costWei = ok && fees ? BigInt(ok.gates) * fees.mintPrice + fees.protocolFee + fees.tapeoutFee : null;
  const inkWei = ok && fees ? BigInt(ok.gates) * fees.mintPrice : null;
  const needsNetworkSwitch = wallet && wallet.chainId !== 196;
  const shortfall = costWei !== null && balance !== null && balance < costWei + 2n * 10n ** 15n ? costWei + 2n * 10n ** 15n - balance : null;
  const liveReady = !!processor;

  const connect = async () => {
    try { setWallet(await connectWallet()); } catch (e) { setPhase({ kind: "error", message: (e as Error).message }); }
  };

  const tapeout = async () => {
    if (!ok || !bitmap || !designHash || !processor || !wallet) return;
    if (inflight.current.has(designHash)) return;
    inflight.current.add(designHash);
    try {
      const wc = walletClient(wallet.address);
      const [mintPrice, protocolFee, tapeoutFee, held] = await Promise.all([
        publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "mintPrice" }),
        publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "protocolFee" }),
        publicClient.readContract({ address: processor.circuits, abi: circuitsAbi, functionName: "TAPEOUT_FEE" }),
        publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "balanceOf", args: [wallet.address, 0n] }),
      ]);
      const gates = BigInt(ok.gates);
      const need = gates > held ? gates - held : 0n;
      if (need > 0n) {
        setPhase({ kind: "minting", amount: Number(need) });
        const value = need * mintPrice + protocolFee;
        const sim = await publicClient.simulateContract({ address: processor.transistors, abi: transistorsAbi, functionName: "mint", args: [0n, need], value, account: wallet.address });
        const tx = await wc.writeContract(sim.request);
        setPhase({ kind: "minting", amount: Number(need), tx });
        const r = await publicClient.waitForTransactionReceipt({ hash: tx });
        if (r.status !== "success") throw new Error("mint reverted");
        setPhase({ kind: "minting", amount: Number(need), tx, block: r.blockNumber });
      }
      setPhase({ kind: "tapeout" });
      const args = [bytesToHex(ok.bytes), ok.shape.nIn, ok.shape.nOut] as const;
      let sim;
      try {
        sim = await publicClient.simulateContract({ address: processor.circuits, abi: circuitsAbi, functionName: "tapeout", args, value: tapeoutFee, account: wallet.address });
      } catch {
        const ap = await wc.writeContract({ address: processor.transistors, abi: [{ type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "bool" }], outputs: [] }], functionName: "setApprovalForAll", args: [processor.circuits, true] });
        await publicClient.waitForTransactionReceipt({ hash: ap });
        sim = await publicClient.simulateContract({ address: processor.circuits, abi: circuitsAbi, functionName: "tapeout", args, value: tapeoutFee, account: wallet.address });
      }
      const t0 = Date.now();
      const tx = await wc.writeContract(sim.request);
      setPhase({ kind: "tapeout", tx });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("tapeout reverted");
      let id: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== processor.circuits.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: circuitsAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "Transfer" && /^0x0+$/.test(ev.args.from)) id = ev.args.tokenId;
        } catch { /* other event */ }
      }
      if (id === null) id = (await publicClient.readContract({ address: processor.circuits, abi: circuitsAbi, functionName: "nextId" })) as bigint;
      const shape = await readShape(publicClient, processor.circuits, id);
      const total = shape.frames * shape.w * shape.w;
      let matched = 0;
      const chainRows: boolean[][][] = [];
      for (let t = 0; t < shape.frames; t++) {
        const rows = await renderFrame(publicClient, processor.circuits, id, shape, t, { onRow: (_y, _r, n) => setPhase({ kind: "rendering", done: n, total: shape.w }) });
        chainRows.push(rows);
        for (let y = 0; y < shape.w; y++) for (let x = 0; x < shape.w; x++) if (rows[y]![x] === bitmap.frames[t]![y]![x]) matched++;
      }
      if (matched === total) { finished.current.set(designHash, id); setPhase({ kind: "done", id, matched, total, rows: chainRows, tx, ms: Date.now() - t0 }); }
      else setPhase({ kind: "mismatch", id, matched, total, rows: chainRows });
    } catch (e) {
      setPhase({ kind: "error", message: isRejection(e) ? "Transaction rejected in wallet." : ((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).split("\n")[0]! });
    } finally {
      inflight.current.delete(designHash);
    }
  };

  const busy = phase.kind === "minting" || phase.kind === "tapeout" || phase.kind === "rendering";
  const dims = bitmap ? `${bitmap.w}×${bitmap.w}${bitmap.frames.length > 1 ? ` · ${bitmap.frames.length} frames` : ""}` : "";
  const activeFrames = mode === "draw" ? frames : bitmap?.frames ?? [];
  const activeFi = Math.min(fi, Math.max(0, activeFrames.length - 1));
  const w = bitmap?.w ?? size;
  const previewRows = useMemo(() => (ok && bitmap ? rowsFromBytes(ok.bytes, ok.shape, activeFi) : null), [ok, bitmap, activeFi]);

  const cause: { state: CauseState; text: React.ReactNode } = (() => {
    switch (phase.kind) {
      case "minting": return { state: "busy", text: <>minting {phase.amount} ink… {phase.tx && <>→ tx <a href={oklinkTx(phase.tx)} target="_blank" rel="noreferrer">{short(phase.tx, 6, 4)}</a>{phase.block !== undefined && <> (block {phase.block.toString()})</>}</>}</> };
      case "tapeout": return { state: "busy", text: <>taping out… {phase.tx ? <>tx <a href={oklinkTx(phase.tx)} target="_blank" rel="noreferrer">{short(phase.tx, 6, 4)}</a> </> : "confirm in wallet "}{avgTapeoutMs ? `manufacturing ~${Math.round(avgTapeoutMs / 1000)}s` : "manufacturing"}</> };
      case "rendering": return { state: "busy", text: <>rendering from chain row {phase.done}/{phase.total}</> };
      case "done": return { state: "ok", text: <>✓ pixel-perfect: {phase.matched}/{phase.total} match · circuit #{phase.id.toString()}</> };
      case "mismatch": return { state: "bad", text: <>MISMATCH: {phase.matched}/{phase.total} pixels match chain eval for circuit #{phase.id.toString()}</> };
      case "error": return { state: "bad", text: phase.message };
      default:
        if (compiled && "error" in compiled) return { state: "bad", text: compiled.error };
        if (mode === "upload") return { state: "idle", text: "load the image into the Draw grid to compile it" };
        if (mode === "formula" && formulaError) return { state: "bad", text: formulaError };
        if (ok) return { state: "idle", text: `${dims} · ${ok.gates} gates${inkWei !== null ? ` · ${okb(inkWei)} OKB ink` : ""} → ready to tape out` };
        return { state: "idle", text: "compiling…" };
    }
  })();

  const doneRows = phase.kind === "done" || phase.kind === "mismatch" ? phase.rows[Math.min(activeFi, phase.rows.length - 1)] ?? null : null;
  const diff = phase.kind === "mismatch" && doneRows && bitmap ? doneRows.map((r, y) => r.map((p, x) => p !== bitmap.frames[activeFi]![y]![x])) : null;

  const tapeoutLabel = busy ? "Working…" : !liveReady ? "Processor not deployed" : !wallet ? "Connect wallet" : needsNetworkSwitch ? "Switch to X Layer" : shortfall ? "Insufficient OKB" : "Tape out";
  const tapeoutDisabled = busy || !ok || !liveReady || (wallet !== null && !needsNetworkSwitch && !!shortfall) || mode === "upload";
  const onAction = async () => {
    if (!wallet) return connect();
    if (needsNetworkSwitch) { try { await switchToXLayer(); setWallet(await connectWallet()); } catch (e) { setPhase({ kind: "error", message: isRejection(e) ? "Network switch rejected." : (e as Error).message }); } return; }
    if (designHash && finished.current.has(designHash)) { window.location.assign(`/piece/${finished.current.get(designHash)}`); return; }
    return tapeout();
  };

  const frameStrip = activeFrames.length > 1 && (
    <div className="frames" role="group" aria-label="Frames">
      {activeFrames.map((f, i) => (
        <button key={i} aria-pressed={i === activeFi} onClick={() => setFi(i)} aria-label={`Frame ${i + 1}`}><BitmapCanvas rows={f} w={w} /></button>
      ))}
    </div>
  );

  return (
    <div className="wrap" style={{ paddingTop: 28, paddingBottom: 56, display: "grid", gap: 14 }}>
      <div className="stage-top">
        <div>
          <div className="eyebrow">Make</div>
          <h2 style={{ marginTop: 6 }}>Draw it, or write it. Compile to gates.</h2>
        </div>
        <div className="seg" role="tablist" aria-label="Input mode">
          {(["draw", "formula", "upload"] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-pressed={mode === m} onClick={() => { setMode(m); setFi(0); setPhase({ kind: "idle" }); }}>{m[0]!.toUpperCase() + m.slice(1)}</button>
          ))}
        </div>
      </div>

      <CauseStrip state={cause.state}>{cause.text}</CauseStrip>

      <div className="bench">
        <div className="rail" role="toolbar" aria-label="Tools">
          {mode === "draw" ? (
            <>
              <button aria-pressed={tool === "pencil"} onClick={() => setTool("pencil")} title="Pencil (B)" aria-label="Pencil"><Icon d={ICONS.pencil} /></button>
              <button aria-pressed={tool === "erase"} onClick={() => setTool("erase")} title="Eraser (E)" aria-label="Eraser"><Icon d={ICONS.erase} /></button>
              <button aria-pressed={mirror.x} onClick={() => setMirror((m) => ({ ...m, x: !m.x }))} title="Mirror left-right" aria-label="Mirror horizontally"><Icon d={ICONS.mirrorX} /></button>
              <button aria-pressed={mirror.y} onClick={() => setMirror((m) => ({ ...m, y: !m.y }))} title="Mirror top-bottom" aria-label="Mirror vertically"><Icon d={ICONS.mirrorY} /></button>
              <button onClick={() => edit((fs) => fs.map((f, i) => (i === fi ? f.map((r) => r.map((p) => !p)) : f)))} title="Invert frame" aria-label="Invert frame"><Icon d={ICONS.invert} /></button>
              <button onClick={() => edit((fs) => fs.map((f, i) => (i === fi ? blank(size) : f)))} title="Clear frame" aria-label="Clear frame"><Icon d={ICONS.clear} /></button>
              <button onClick={undo} title="Undo (Ctrl Z)" aria-label="Undo"><Icon d={ICONS.undo} /></button>
              <button onClick={redo} title="Redo" aria-label="Redo"><Icon d={ICONS.redo} /></button>
            </>
          ) : <div style={{ padding: 10, fontSize: 11, color: "var(--ink-3)", font: "11px var(--font-mono)", writingMode: "vertical-rl" }}>{mode}</div>}
        </div>

        <div className="stage">
          {mode === "draw" && (
            <div className="stage-top">
              <div className="seg" aria-label="Canvas size">
                {([8, 16, 32] as Size[]).map((s) => <button key={s} aria-pressed={size === s} onClick={() => changeSize(s)}>{s}×{s}</button>)}
              </div>
              <div className="seg" aria-label="Frames">
                {([1, 2, 4] as FrameCount[]).map((n) => <button key={n} aria-pressed={frameCount === n} onClick={() => changeFrameCount(n)}>{n} {n === 1 ? "frame" : "frames"}</button>)}
              </div>
            </div>
          )}

          {mode === "formula" && (
            <div style={{ display: "grid", gap: 10 }}>
              <label className="field">Formula in x, y, t. Pixel is ink when the result is odd.
                <textarea rows={2} value={formula} onChange={(e) => { setFormula(e.target.value); resetResult(); }} spellCheck={false} aria-invalid={!!formulaError} style={{ resize: "vertical" }} />
              </label>
              <div className="stage-top">
                <div className="frames" style={{ gap: 6 }}>
                  {PRESETS.map((p) => (
                    <button key={p.id} className="btn sm" onClick={() => { setFormula(p.formula); setFSize(p.w); setFFrames(p.frames); setFi(0); resetResult(); }}>{p.title}</button>
                  ))}
                  {PRESETS.length === 0 && <span className="faint" style={{ fontSize: 12 }}>Presets appear once their circuits are verified on-chain.</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div className="seg">{([8, 16, 32] as Size[]).map((s) => <button key={s} aria-pressed={fSize === s} onClick={() => setFSize(s)}>{s}</button>)}</div>
                  <div className="seg">{([1, 2, 4, 8] as const).map((n) => <button key={n} aria-pressed={fFrames === n} onClick={() => setFFrames(n)}>{n}f</button>)}</div>
                </div>
              </div>
              <div className="faint mono" style={{ fontSize: 11 }}>operators: ^ &amp; | ~ &lt;&lt; &gt;&gt; + - * % == != &lt; &gt; &lt;= &gt;= ( )</div>
            </div>
          )}

          {mode === "upload" && (
            <div style={{ display: "grid", gap: 12 }}>
              <label className="field">Image file. It is read in your browser and never uploaded.
                <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} />
              </label>
              <div className="stage-top">
                <div className="seg">{([16, 32] as const).map((s) => <button key={s} aria-pressed={up.size === s} onClick={() => setUp({ ...up, size: s })}>{s}×{s}</button>)}</div>
                <label className="chk"><input type="checkbox" checked={up.invert} onChange={(e) => setUp({ ...up, invert: e.target.checked })} /> Invert</label>
              </div>
              <label className="field">Brightness threshold {up.threshold}
                <input type="range" min={1} max={254} value={up.threshold} onChange={(e) => setUp({ ...up, threshold: +e.target.value })} />
              </label>
              {uploadBits ? (
                <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
                  <div className="tile"><BitmapCanvas rows={uploadBits} w={up.size} label="Thresholded preview" /></div>
                  <button className="btn primary" onClick={loadIntoDraw}>Load into Draw grid</button>
                </div>
              ) : <div className="faint" style={{ fontSize: 13 }}>{up.name || "No image chosen."}</div>}
            </div>
          )}

          {mode !== "upload" && (
            <div className="pair">
              <figure style={{ margin: 0 }}>
                <figcaption><span>{mode === "draw" ? "Source" : "Formula output"}</span><span>{dims}</span></figcaption>
                <div className="tile">
                  {mode === "draw"
                    ? <PixelGrid w={size} frame={frames[activeFi]!} tool={tool} mirror={mirror} onStroke={onStroke} />
                    : bitmap ? <BitmapCanvas rows={bitmap.frames[activeFi]!} w={bitmap.w} label="Formula output" /> : <div style={{ aspectRatio: "1", display: "grid", placeItems: "center", font: "12px var(--font-mono)", color: "var(--bad)" }}>invalid</div>}
                </div>
              </figure>
              <figure style={{ margin: 0 }}>
                <figcaption>
                  <span>{doneRows ? "Rendered from chain · eval" : "Gate preview · simulated locally"}</span>
                  <span>{ok ? `${ok.gates} gates` : ""}</span>
                </figcaption>
                <div className="tile" style={{ position: "relative" }}>
                  {doneRows ? <BitmapCanvas rows={doneRows} w={w} label="Rendered from chain" /> : previewRows ? <BitmapCanvas rows={previewRows} w={w} label="Local simulation of the compiled gates" /> : <div style={{ aspectRatio: "1" }} />}
                  {diff && (
                    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${w}, 1fr)`, pointerEvents: "none" }}>
                      {diff.flatMap((r, y) => r.map((d, x) => <i key={`${x},${y}`} style={{ background: d ? "rgba(179,38,30,.75)" : "transparent" }} />))}
                    </div>
                  )}
                </div>
              </figure>
            </div>
          )}
          {frameStrip}
        </div>

        <aside className="inspect" aria-label="Compile and tape out">
          <section>
            <h3>Compression</h3>
            <div className="big">{ok ? ok.gates : "…"}<span className="faint" style={{ fontSize: 14, fontWeight: 400 }}> gates</span></div>
            {ok && bitmap && (
              <dl className="kv" style={{ margin: 0 }}>
                <dt>per pixel</dt><dd>{(ok.gates / (bitmap.w * bitmap.w * bitmap.frames.length)).toFixed(3)}</dd>
                <dt>naive baseline</dt><dd>{naive === null ? "…" : naive.toLocaleString("en-US")}</dd>
                <dt>ratio vs naive</dt><dd>{naive ? `${((ok.gates / naive) * 100).toFixed(1)}%` : "…"}</dd>
              </dl>
            )}
            <div>
              <div className={`meter${ok && ok.gates > DEFAULT_BUDGET ? " over" : ""}`}><i style={{ width: `${Math.min(100, ((ok?.gates ?? (compiled && "gates" in compiled ? compiled.gates : 0) ?? 0) / DEFAULT_BUDGET) * 100)}%` }} /></div>
              <div className="faint mono" style={{ fontSize: 11, marginTop: 4 }}>budget {DEFAULT_BUDGET.toLocaleString("en-US")} gates</div>
            </div>
          </section>
          <section>
            <h3>Cost</h3>
            {fees && ok ? (
              <dl className="kv" style={{ margin: 0 }}>
                <dt>ink ({ok.gates} × {okb(fees.mintPrice)})</dt><dd>{okb(inkWei!)}</dd>
                <dt>protocol fee</dt><dd>{okb(fees.protocolFee)}</dd>
                <dt>tapeout fee</dt><dd>{okb(fees.tapeoutFee)}</dd>
                <dt><b>total OKB</b></dt><dd><b>{okb(costWei!)}</b></dd>
              </dl>
            ) : <div className="faint" style={{ fontSize: 13 }}>{liveReady ? "Reading fees from chain…" : "Fees appear once the processor is deployed."}</div>}
          </section>
          <section>
            <h3>Tape out</h3>
            {wallet && <div className="mono faint" style={{ fontSize: 12 }}>{short(wallet.address, 6, 4)}{balance !== null && ` · ${okb(balance, 4)} OKB`}</div>}
            {shortfall !== null && !needsNetworkSwitch ? <div className="bad" style={{ fontSize: 12 }}>Short by {okb(shortfall, 5)} OKB (includes gas headroom).</div> : null}
            <button className="btn primary" disabled={tapeoutDisabled && !(wallet === null && ok && liveReady) && !needsNetworkSwitch} onClick={onAction}>{phase.kind === "done" ? "Open piece" : tapeoutLabel}</button>
            {phase.kind === "done" ? <Link className="btn" to={`/piece/${phase.id}`}>View piece #{phase.id.toString()}</Link> : null}
            {!injected() && <div className="faint" style={{ fontSize: 12 }}>No wallet detected. Compiling and previewing work without one.</div>}
            {!drawPathVerified && <div className="faint" style={{ fontSize: 12 }}>Draw path not yet verified live.</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
