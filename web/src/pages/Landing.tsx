import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { circuitsAbi, transistorsAbi } from "@reticle/chain";
import { ChainImage } from "../components/ChainImage";
import { CodeBlock } from "../components/CopyButton";
import { designById, facts, tapeouts } from "../lib/data";
import { oklinkAddr, processor, publicClient } from "../lib/chain";
import { okb } from "../lib/fmt";

const hero = tapeouts.find((t) => t.designId === "crosshair") ?? tapeouts[0];

function useNetlist(id?: number) {
  const [hex, setHex] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !processor) return;
    publicClient.readContract({ address: processor.circuits, abi: circuitsAbi, functionName: "netlist", args: [BigInt(id)] }).then(setHex).catch(() => setHex(null));
  }, [id]);
  return hex;
}

function useReplay() {
  const [has, setHas] = useState(false);
  useEffect(() => { fetch("/replay.mp4", { method: "HEAD" }).then((r) => setHas(r.ok && (r.headers.get("content-type") ?? "").includes("video"))).catch(() => setHas(false)); }, []);
  return has;
}

export default function Landing() {
  const netlist = useNetlist(hero?.circuitId);
  const replay = useReplay();
  const [ink, setInk] = useState<{ cap: bigint; price: bigint } | null>(null);
  useEffect(() => {
    if (!processor) return;
    Promise.all([
      publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "supplyCap" }),
      publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "mintPrice" }),
    ]).then(([cap, price]) => setInk({ cap, price })).catch(() => setInk(null));
  }, []);
  const strip = tapeouts.slice(0, 8);
  const snippet = processor && hero ? `<img data-reticle="${processor.circuits}:${hero.circuitId}" data-verify>` : `<img data-reticle="0x…:1">`;

  return (
    <>
      <div className="wrap">
        <section className="hero">
          <div>
            <div className="eyebrow">X Layer · NAND circuits · wallet-free for viewers</div>
            <h1 style={{ marginTop: 16 }}>Images that are circuits.</h1>
            <p className="lede">Draw a logo, icon, favicon, badge or artwork, or write it as a formula. Reticle compiles it to NAND gates and tapes it out on X Layer. Any website, including DeWEB sites, can then show it straight from the chain, with no wallet and no gas for the viewer.</p>
            <div className="ctas">
              <Link className="btn primary" to="/make">Make one</Link>
              <Link className="btn" to="/embed">Embed it</Link>
              <Link className="btn" to="/proof">See the proof</Link>
            </div>
            <p className="faint" style={{ marginTop: 22, fontSize: 13, maxWidth: "52ch" }}>The picture can't be pre-rendered, because the chain's own gates are what draw it.</p>
          </div>
          <div className="stack">
            {replay ? (
              <figure style={{ margin: 0 }}>
                <video src="/replay.mp4" autoPlay loop muted playsInline style={{ width: "100%", border: "1px solid var(--rule)" }} />
                <figcaption className="faint mono" style={{ fontSize: 11, marginTop: 6 }}>Real session on mainnet: drawn, minted, taped out and read back from chain. Scripted cursor.</figcaption>
              </figure>
            ) : (
              <div className="panel">
                <header><b>{hero ? `${designById(hero.designId)?.title} #${hero.circuitId}` : "First circuit"}</b><span className="mono">{hero ? `${hero.gates} gates` : "pending"}</span></header>
                <div className="body">
                  {hero && processor ? <div style={{ maxWidth: 380, margin: "0 auto" }}><ChainImage circuits={processor.circuits} id={BigInt(hero.circuitId)} label="Crosshair circuit drawn by its own gates" /></div> : <div className="faint" style={{ padding: 40, textAlign: "center" }}>The first circuit appears here after tapeout.</div>}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="wrap">
        <section className="section">
          <div className="cols2" style={{ alignItems: "center" }}>
            <div style={{ display: "grid", gap: 14 }}>
              <h2>The circuit is invisible until the gates draw it.</h2>
              <p className="muted" style={{ maxWidth: "52ch" }}>This is all that is stored on chain for the picture beside it: a list of NAND gates, seven bytes each. There is no pixel data. Every row you see is one <span className="mono">eval</span> call.</p>
              {processor && hero && <p className="mono faint" style={{ fontSize: 12 }}>{hero.gates} gates · {hero.gates * 7} bytes · <a href={oklinkAddr(processor.circuits)}>processor</a></p>}
            </div>
            <div className="panel">
              <header><b>netlist(#{hero?.circuitId ?? "?"})</b><span className="mono">u24 big-endian</span></header>
              <div className="body netlist">{netlist ?? "0x00…"}</div>
            </div>
          </div>
        </section>

        <section className="section" style={{ display: "grid", gap: 20 }}>
          <h2>How it works</h2>
          <div className="steps">
            {[
              ["01 / Draw", "Paint pixels on an 8, 16 or 32 grid, drop in an image, or type a formula in x, y and t."],
              ["02 / Compile", "A minimizer and a gate sharer turn every pixel column into NAND logic. You see gates per pixel and the ratio against naive."],
              ["03 / Tape out", "One transistor burns per gate. The circuit becomes an NFT on X Layer."],
              ["04 / Show it", "Any page draws it back from chain with one img tag. No wallet, no gas, no backend."],
            ].map(([t, d]) => (<div key={t}><span className="n">{t}</span><p style={{ fontSize: 14 }}>{d}</p></div>))}
          </div>
        </section>

        <section className="section" style={{ display: "grid", gap: 18 }}>
          <div className="stage-top"><h2>From chain, right now</h2><Link className="btn sm" to="/gallery">Open gallery</Link></div>
          {strip.length && processor ? (
            <div className="archive" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
              {strip.map((t) => (<Link key={t.circuitId} className="cell" to={`/piece/${t.circuitId}`} style={{ padding: 10 }}><ChainImage circuits={processor!.circuits} id={BigInt(t.circuitId)} lazy label={t.designId} /><div className="meta"><b>{designById(t.designId)?.title}</b><span>{t.gates}g</span></div></Link>))}
            </div>
          ) : <p className="muted">Nothing taped out yet.</p>}
        </section>

        <section className="section">
          <div className="cols2" style={{ alignItems: "start" }}>
            <div style={{ display: "grid", gap: 14 }}>
              <h2>Ink is the transistor supply.</h2>
              <p className="muted" style={{ maxWidth: "52ch" }}>Every gate burns one Reticle transistor at tapeout, so smaller circuits cost less. The supply is capped and immutable.</p>
              <dl className="kv" style={{ margin: 0, maxWidth: 440 }}>
                <dt>Supply cap</dt><dd>{ink ? ink.cap.toLocaleString("en-US") : "1,048,576"}</dd>
                <dt>Price per transistor</dt><dd>{ink ? `${okb(ink.price)} OKB` : "0.00003 OKB"}</dd>
                <dt>Burn at tapeout</dt><dd>1 per gate</dd>
              </dl>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div className="faint mono" style={{ fontSize: 11 }}>THE ENTIRE EMBED</div>
              <CodeBlock code={snippet} />
              <p className="faint" style={{ fontSize: 12 }}>{facts.deweb?.gateway ? "Also live as a DeWEB site." : "Works in any page today; built for DeWEB sites."}</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
