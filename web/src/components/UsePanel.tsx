import { useState } from "react";
import { CodeBlock } from "./CopyButton";
import { download, downloadSvg, faviconPng, rowsToPngBlob, shareCardBlob } from "../lib/export";

interface Props { circuits: string; id: number; frame: number; rows: boolean[][] | null; gates?: number }

export function embedSnippet(circuits: string, id: number, frame = 0) {
  return `<script src="https://YOUR-SITE/reticle-embed.js" defer></script>\n<img data-reticle="${circuits}:${id}" data-frame="${frame}" data-verify width="256" height="256">`;
}

export function UsePanel({ circuits, id, frame, rows, gates }: Props) {
  const [err, setErr] = useState<string | null>(null);
  const siteSnippet = embedSnippet(circuits, id, frame).replace("https://YOUR-SITE", window.location.origin);
  const disabled = !rows;
  const wrap = (fn: () => Promise<void> | void) => async () => { try { setErr(null); await fn(); } catch (e) { setErr((e as Error).message); } };
  return (
    <section className="panel" aria-label="Use it">
      <header><b>Use it</b><span className="mono">no wallet · no gas</span></header>
      <div className="body" style={{ display: "grid", gap: 14 }}>
        <p className="muted" style={{ fontSize: 13 }}>Paste this on any page. The image is drawn from the chain when the page loads.</p>
        <CodeBlock code={siteSnippet} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn sm" disabled={disabled} onClick={wrap(() => downloadSvg(`reticle-${id}.svg`, rows!))}>Download SVG</button>
          <button className="btn sm" disabled={disabled} onClick={wrap(async () => download(`reticle-${id}.png`, await rowsToPngBlob(rows!, Math.max(512, rows!.length * 16))))}>Download PNG</button>
          <button className="btn sm" disabled={disabled} onClick={wrap(async () => download(`reticle-${id}-favicon-32.png`, await faviconPng(rows!)))}>Favicon 32×32 PNG</button>
          <button className="btn sm" disabled={disabled} onClick={wrap(async () => download(`reticle-${id}-card.png`, await shareCardBlob(rows!, [`Circuit #${id}`, gates ? `${gates} NAND gates` : "", "drawn by its own gates"].filter(Boolean))))}>Share card</button>
        </div>
        {err && <div className="bad" style={{ fontSize: 12 }}>{err}</div>}
      </div>
    </section>
  );
}
