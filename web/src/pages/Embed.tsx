import { useEffect } from "react";
import { CodeBlock } from "../components/CopyButton";
import { facts, tapeouts, designById } from "../lib/data";
import { processor, renderer, oklinkAddr } from "../lib/chain";

const demo = tapeouts.find((t) => t.designId === "sierpinski") ?? tapeouts[0];

export function useEmbedScript() {
  useEffect(() => {
    const w = window as unknown as { Reticle?: { render(el: Element): void } };
    const run = () => document.querySelectorAll("img[data-reticle]").forEach((el) => w.Reticle?.render(el));
    if (w.Reticle) { run(); return; }
    const s = document.createElement("script");
    s.src = "/reticle-embed.js";
    s.onload = () => { /* the script renders on load; render again for elements added later */ };
    document.body.appendChild(s);
  }, []);
}

export default function Embed() {
  useEmbedScript();
  const circuits = processor?.circuits ?? "0xYOUR_CIRCUITS_ADDRESS";
  const id = demo?.circuitId ?? 1;
  const snippet = `<script src="https://reticle.example/reticle-embed.js" defer></script>\n\n<img data-reticle="${circuits}:${id}" data-frame="0" data-verify width="256" height="256" alt="">`.replace("https://reticle.example", window.location.origin);
  const css = `img[data-reticle] { image-rendering: pixelated; }`;
  return (
    <div className="wrap" style={{ paddingBottom: 72 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Embed</div>
          <h1 style={{ fontSize: "clamp(30px,4vw,52px)", marginTop: 8, maxWidth: "18ch" }}>One script tag. The image comes from the chain.</h1>
          <p className="muted" style={{ marginTop: 14, maxWidth: "60ch", fontSize: 16 }}>
            <span className="mono">reticle-embed.js</span> is under 4 KB, has no dependencies and needs no wallet, key or backend. It reads your circuit over a public X Layer RPC and sets the image source to the SVG the gates drew.
          </p>
        </div>
      </div>

      <div className="cols2" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: 20 }}>
          <section style={{ display: "grid", gap: 10 }}>
            <h3>1. Paste it</h3>
            <CodeBlock code={snippet} />
          </section>
          <section style={{ display: "grid", gap: 10 }}>
            <h3>2. Attributes</h3>
            <div className="scroll-x"><table className="t">
              <tbody>
                <tr><td>data-reticle</td><td className="l">circuits address and circuit id, joined by a colon</td></tr>
                <tr><td>data-frame</td><td className="l">frame index for animated circuits, default 0</td></tr>
                <tr><td>data-verify</td><td className="l">adds a title tooltip: rendered from chain, block N, and which path ran</td></tr>
              </tbody>
            </table></div>
          </section>
          <section style={{ display: "grid", gap: 10 }}>
            <h3>3. How it renders</h3>
            <ol className="muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 14 }}>
              <li>Reads <span className="mono">circuitInfo</span> to learn the size and gate count.</li>
              <li>If the estimated gas fits, one <span className="mono">eth_call</span> to <span className="mono">ReticleRenderer.svg()</span>.</li>
              <li>Otherwise one <span className="mono">eval</span> per row, 8 at a time, and the SVG is built in the browser. Same bytes either way.</li>
              <li>Sets a <span className="mono">data:image/svg+xml</span> source. Nothing is signed, nothing costs gas.</li>
            </ol>
            <CodeBlock lang="css" code={css} />
          </section>
        </div>

        <aside className="panel" style={{ position: "sticky", top: 72 }}>
          <header><b>Live example</b><span className="mono">pulled from X Layer now</span></header>
          <div className="body" style={{ display: "grid", gap: 14 }}>
            {demo ? (
              <>
                <div className="tile" style={{ maxWidth: 320 }}>
                  <img data-reticle={`${circuits}:${demo.circuitId}`} data-frame="0" data-verify width={320} height={320} alt="" style={{ imageRendering: "pixelated" }} />
                </div>
                <dl className="kv" style={{ margin: 0 }}>
                  <dt>Circuit</dt><dd>{designById(demo.designId)?.title} #{demo.circuitId}</dd>
                  <dt>Gates</dt><dd>{demo.gates}</dd>
                  <dt>Processor</dt><dd><a href={oklinkAddr(circuits)}>{circuits.slice(0, 10)}…</a></dd>
                  {renderer && (<><dt>Renderer</dt><dd><a href={oklinkAddr(renderer)}>{renderer.slice(0, 10)}…</a></dd></>)}
                </dl>
                <p className="faint" style={{ fontSize: 12 }}>Hover the image after it loads to see the block it was rendered at.</p>
              </>
            ) : <p className="muted">The live example appears once the first circuit is taped out.</p>}
          </div>
        </aside>
      </div>

      <section style={{ marginTop: 48, display: "grid", gap: 10, maxWidth: 680 }}>
        <h3>Where it runs</h3>
        <p className="muted">
          {facts.deweb?.gateway
            ? <>This page is also published as a DeWEB site: <a href={facts.deweb.gateway}>{facts.deweb.gateway}</a>.</>
            : "Works in any page today; built for DeWEB sites."}
        </p>
      </section>
    </div>
  );
}
