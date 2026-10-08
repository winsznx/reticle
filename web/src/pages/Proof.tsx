import { useEffect, useState } from "react";
import { transistorsAbi } from "@reticle/chain";
import { bench, facts, tapeouts, verify, phase0, designById } from "../lib/data";
import { oklinkAddr, oklinkTx, processor, publicClient, renderer } from "../lib/chain";
import { ms, okb, short } from "../lib/fmt";
import { useEmbedScript } from "./Embed";

interface Live { supplyCap: bigint; mintPrice: bigint; minted: bigint; creator: string }

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export default function Proof() {
  useEmbedScript();
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!processor) return;
    Promise.all(["supplyCap", "mintPrice", "minted", "creator"].map((fn) => publicClient.readContract({ address: processor!.transistors, abi: transistorsAbi, functionName: fn as "supplyCap" })))
      .then(([supplyCap, mintPrice, minted, creator]) => setLive({ supplyCap: supplyCap as bigint, mintPrice: mintPrice as bigint, minted: minted as bigint, creator: creator as unknown as string }))
      .catch((e) => setErr((e as Error).message));
  }, []);

  const passed = verify?.summary.passed ?? 0;
  const total = verify?.summary.designs ?? 0;
  const demo = tapeouts[0];

  return (
    <div className="wrap" style={{ paddingBottom: 72 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Proof</div>
          <h1 style={{ fontSize: "clamp(30px,4vw,52px)", marginTop: 8 }}>Measured claims only</h1>
          <p className="muted" style={{ marginTop: 12, maxWidth: "62ch" }}>Every number here is read from the chain on this page or from a committed evidence file with its source and timestamp. Nothing is typed in by hand.</p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 40 }}>
        <section style={{ display: "grid", gap: 12 }}>
          <h2>1. Processor, read live</h2>
          {!processor ? <p className="muted">Not deployed yet.</p> : (
            <div className="cols2">
              <dl className="kv" style={{ margin: 0 }}>
                <dt>Circuits (ERC-721)</dt><dd><a href={oklinkAddr(processor.circuits)}>{processor.circuits}</a></dd>
                <dt>Transistors (ERC-1155)</dt><dd><a href={oklinkAddr(processor.transistors)}>{processor.transistors}</a></dd>
                {renderer && (<><dt>ReticleRenderer</dt><dd><a href={oklinkAddr(renderer)}>{renderer}</a></dd></>)}
                <dt>Deploy tx</dt><dd><a href={oklinkTx(processor.deployTx)}>{short(processor.deployTx, 10, 8)}</a></dd>
                <dt>Supply cap</dt><dd>{live ? live.supplyCap.toLocaleString("en-US") : err ? "RPC error" : "…"}</dd>
                <dt>Mint price</dt><dd>{live ? `${okb(live.mintPrice)} OKB` : "…"}</dd>
                <dt>Minted so far</dt><dd>{live ? live.minted.toLocaleString("en-US") : "…"}</dd>
                <dt>Creator</dt><dd>{live ? <a href={oklinkAddr(live.creator)}>{short(live.creator, 8, 6)}</a> : "…"}</dd>
              </dl>
              <div>
                <div className="faint mono" style={{ fontSize: 11, marginBottom: 6 }}>STORY, AS SUBMITTED AT DEPLOY</div>
                <p style={{ fontSize: 14 }}>{processor.story}</p>
              </div>
            </div>
          )}
        </section>

        <section style={{ display: "grid", gap: 12 }}>
          <h2>2. Artworks rendered from chain eval: {verify ? `${passed}/${total}` : "pending"}</h2>
          {verify ? (
            <div className="scroll-x"><table className="t">
              <thead><tr><th className="l">Design</th><th>Circuit</th><th>Gates</th><th>Direct eval</th><th>Via renderer</th><th>svg() = client</th><th>Result</th></tr></thead>
              <tbody>
                {verify.results.map((r) => (
                  <tr key={r.designId}>
                    <td className="l">{designById(r.designId)?.title ?? r.designId}</td><td>#{r.circuitId}</td><td>{r.gates}</td>
                    <td>{r.directEval}/{r.total}</td><td>{r.viaRenderer === null ? "n/a" : `${r.viaRenderer}/${r.total}`}</td>
                    <td>{r.svgEqualsClientSvg === null ? "n/a" : r.svgEqualsClientSvg ? "yes" : "no"}</td>
                    <td className={r.pass ? "ok" : "bad"}>{r.pass ? "pass" : "FAIL"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <p className="muted">Verification has not run yet.</p>}
          {verify && <p className="faint mono" style={{ fontSize: 11 }}>source: evidence/verify.json · {verify.timestamp}</p>}
        </section>

        <section style={{ display: "grid", gap: 12 }}>
          <h2>3. Compression against a naive netlist</h2>
          {bench ? (
            <>
              <div className="scroll-x"><table className="t">
                <thead><tr><th className="l">Design</th><th>Size</th><th>Reticle gates</th><th>Naive gates</th><th>Ratio</th><th>Gates / pixel</th></tr></thead>
                <tbody>
                  {bench.rows.map((r) => (
                    <tr key={r.id}><td className="l">{designById(r.id)?.title ?? r.id}</td><td>{r.w}×{r.w}{r.frames > 1 ? `×${r.frames}` : ""}</td><td>{r.gates}</td><td>{r.naive.toLocaleString("en-US")}</td><td>{(r.ratio * 100).toFixed(1)}%</td><td>{r.gatesPerPixel.toFixed(3)}</td></tr>
                  ))}
                </tbody>
              </table></div>
              <p className="muted" style={{ fontSize: 13, maxWidth: "70ch" }}>
                Naive means one product term per lit pixel with no minimization and no sharing between outputs. It is a floor for comparison, not another tool. Mean ratio on drawn designs: {(bench.summary.meanRatioDrawn * 100).toFixed(1)}%. The pre-registered null (drawn ratio of 90% or more) did not hold.
              </p>
              <p className="faint mono" style={{ fontSize: 11 }}>source: evidence/bench.json · {bench.timestamp}</p>
            </>
          ) : <p className="muted">Bench has not run yet.</p>}
        </section>

        <section style={{ display: "grid", gap: 12 }}>
          <h2>4. Negative controls</h2>
          {verify ? (
            <dl className="kv" style={{ margin: 0, maxWidth: 760 }}>
              <dt>Mutating one gate changes the picture</dt><dd className={verify.tamper.differsAfterMutation ? "ok" : "bad"}>{verify.tamper.differsAfterMutation ? `yes, gate ${verify.tamper.gate} (local only, never taped out)` : "no"}</dd>
              <dt>Non-square circuit is refused by the renderer</dt><dd className={verify.badShape?.reverted ? "ok" : "bad"}>{verify.badShape ? (verify.badShape.reverted ? "BadShape revert" : "not refused") : "renderer not checked"}</dd>
              <dt>Compiler refuses a netlist over budget</dt><dd className={verify.budgetRefused ? "ok" : "bad"}>{verify.budgetRefused ? "BudgetError" : "not refused"}</dd>
            </dl>
          ) : <p className="muted">Pending.</p>}
        </section>

        <section style={{ display: "grid", gap: 12 }}>
          <h2>5. Simulator against live circuits</h2>
          {phase0 ? (
            <p className="muted" style={{ maxWidth: "70ch" }}>
              Before spending anything, the local simulator was checked against {phase0.summary.tested} existing X Layer circuits on every input. {phase0.summary.passed}/{phase0.summary.tested} matched <span className="mono">eval</span> exactly. Block {phase0.blockNumber.toLocaleString("en-US")}, {phase0.timestamp}.
            </p>
          ) : <p className="muted">Pending.</p>}
        </section>

        <section style={{ display: "grid", gap: 12 }}>
          <h2>6. Latencies</h2>
          {tapeouts.length ? (
            <dl className="kv" style={{ margin: 0, maxWidth: 760 }}>
              <dt>Tapeout, tx sent to wallet ack (mean of {tapeouts.length})</dt><dd>{ms(avg(tapeouts.map((t) => t.tapeoutAckMs))!)}</dd>
              <dt>Tapeout, sent to confirmed (mean)</dt><dd>{ms(avg(tapeouts.map((t) => t.tapeoutCompletionMs))!)}</dd>
              <dt>Full render from chain, all rows (mean)</dt><dd>{ms(avg(tapeouts.map((t) => t.renderMs))!)}</dd>
              {processor && (<><dt>Processor deploy, ack / confirmed</dt><dd>{ms(processor.ackMs)} / {ms(processor.completionMs)}</dd></>)}
            </dl>
          ) : <p className="muted">Pending.</p>}
        </section>

        {demo && processor && (
          <section style={{ display: "grid", gap: 12 }}>
            <h2>7. The embed, from chain, right now</h2>
            <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              <div className="tile" style={{ width: 160 }}><img data-reticle={`${processor.circuits}:${demo.circuitId}`} data-verify width={160} height={160} alt="" /></div>
              <p className="muted" style={{ maxWidth: "52ch", fontSize: 14 }}>This image is an <span className="mono">img</span> tag with a <span className="mono">data-reticle</span> attribute. Hover it for the block it was rendered at. No wallet connected, no gas spent.</p>
            </div>
          </section>
        )}

        <section style={{ display: "grid", gap: 10 }}>
          <h2>Limitations</h2>
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 14, maxWidth: "74ch" }}>
            <li>The TapeOut contracts are upgradeable beacons and unaudited. Reticle does not control them.</li>
            <li>Images are square, 8, 16 or 32 pixels, one bit per pixel, up to 8 frames.</li>
            <li>Rendering costs RPC calls. A 32×32 piece needs 32 evals, or one call to the renderer when the gas fits.</li>
            <li>Public RPCs rate limit. The embed falls back across three endpoints.</li>
            <li>{facts.deweb?.gateway ? "DeWEB publishing is recorded in the README." : "Not published to DeWEB. The embed works in any page today."}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
