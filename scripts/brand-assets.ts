import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { rowsToSvg } from "@reticle/chain";
import { loadDesign } from "./design";
import { root } from "./lib";

const mark = loadDesign("crosshair").rows[0]!.map((r) => [...r].map((c) => c === "#"));
const rects = (fill: string, accent?: string) => {
  let out = "";
  mark.forEach((row, y) => {
    let x = 0;
    while (x < 16) {
      if (!row[x]) { x++; continue; }
      const s = x;
      while (x < 16 && row[x]) x++;
      const center = y >= 7 && y <= 8 && s >= 7 && x <= 9;
      out += `<rect x="${s}" y="${y}" width="${x - s}" height="1" fill="${center && accent ? accent : fill}"/>`;
    }
  });
  return out;
};
const out = (rel: string, data: string | Uint8Array) => writeFileSync(new URL(rel, root), data);

const INK = "#0B0B0C";
const PAPER = "#F2EFE6";
const AMBER = "#E8A33D";
const SAFE_INK = "#E9E4D6";
const BG = "#0A0A0B";

out("brand/mark.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects(INK, AMBER)}</svg>\n`);
out("brand/mark-mono.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor">${rects("currentColor")}</svg>\n`);
out(
  "web/public/favicon.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><style>.p{fill:${PAPER}}.i{fill:${INK}}@media (prefers-color-scheme:dark){.p{fill:${BG}}.i{fill:${SAFE_INK}}}</style><rect class="p" width="16" height="16"/>${rects(INK, AMBER).replaceAll(`fill="${INK}"`, 'class="i"')}</svg>\n`,
);
out("web/public/mark.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects(INK, AMBER)}</svg>\n`);

const png = (svg: string, width: number) => new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
const iconSvg = (bg: string, fg: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="${bg}"/>${rects(fg, AMBER)}</svg>`;
out("web/public/favicon-32.png", png(iconSvg(PAPER, INK), 32));
out("web/public/apple-touch-icon.png", png(iconSvg(PAPER, INK), 180));

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${PAPER}"/><rect x="40" y="40" width="1120" height="550" fill="none" stroke="${INK}" stroke-width="2"/><g transform="translate(88 88) scale(20)" shape-rendering="crispEdges">${rects(INK, AMBER)}</g><g transform="translate(740 126) scale(10)" shape-rendering="crispEdges">${rowsToSvg(loadDesign("sierpinski").rows[0]!.map((r) => [...r].map((c) => c === "#"))).replace(/^<svg[^>]*>/, "").replace("</svg>", "")}</g><text x="88" y="500" font-family="Helvetica, Arial, sans-serif" font-size="84" font-weight="700" fill="${INK}">Reticle</text><text x="88" y="552" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="${INK}">Images that are circuits. On X Layer.</text></svg>`;
out("web/public/og.png", png(og, 1200));
console.log("brand assets written");
