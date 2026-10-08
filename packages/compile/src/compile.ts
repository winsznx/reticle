import type { Bitmap, Netlist } from "./types";
import { truthTables, type Shape } from "./truth";
import { primeImplicants, selectCover, literalCount, implicantKey, type Implicant } from "./qm";
import { Builder, sortTerms } from "./synth";
import { assemble, BudgetError } from "./assemble";
import { encodeNetlist } from "./encode";
import { simulate } from "./sim";
import { inputBytes, unpackBits } from "./bits";

export const DEFAULT_BUDGET = 2048;

export interface CompileResult {
  shape: Shape;
  netlist: Netlist;
  bytes: Uint8Array;
  gates: number;
}

interface Choice {
  kind: "zero" | "one" | "sop";
  invert: boolean;
  terms: Implicant[];
}

const cost = (terms: Implicant[], nVars: number) =>
  terms.reduce((n, t) => n + literalCount(t, nVars), 0) + terms.length;

function minterms(table: Uint8Array, value: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < table.length; m++) if (table[m] === value) out.push(m);
  return out;
}

/*
 * Per output, minimize both f and its complement and keep the cheaper. Cover selection is
 * run twice: the second pass discounts product terms that other outputs already use,
 * because structural hashing makes a shared term free.
 */
function planOutputs(tables: Uint8Array[], nVars: number): Choice[] {
  const size = 1 << nVars;
  const ones = tables.map((t) => minterms(t, 1));
  const zeros = tables.map((t) => minterms(t, 0));
  const primesOn = ones.map((m) => (m.length && m.length < size ? primeImplicants(m, nVars) : []));
  const primesOff = zeros.map((m) => (m.length && m.length < size ? primeImplicants(m, nVars) : []));

  let choices: Choice[] = tables.map((_, i) =>
    ones[i]!.length === 0
      ? { kind: "zero", invert: false, terms: [] }
      : ones[i]!.length === size
        ? { kind: "one", invert: false, terms: [] }
        : { kind: "sop", invert: false, terms: [] },
  );

  for (let pass = 0; pass < 3; pass++) {
    const usage = new Map<number, number>();
    for (const c of choices) for (const t of c.terms) usage.set(implicantKey(t), (usage.get(implicantKey(t)) ?? 0) + 1);
    const next: Choice[] = [];
    choices.forEach((cur, i) => {
      if (cur.kind !== "sop") {
        next.push(cur);
        return;
      }
      const own = new Set(cur.terms.map(implicantKey));
      const weight = (t: Implicant) => {
        const k = implicantKey(t);
        const others = (usage.get(k) ?? 0) - (own.has(k) ? 1 : 0);
        return Math.max(1, literalCount(t, nVars)) * (others > 0 ? 0.3 : 1);
      };
      const on = sortTerms(selectCover(ones[i]!, primesOn[i]!, weight));
      const off = sortTerms(selectCover(zeros[i]!, primesOff[i]!, weight));
      const discount = (terms: Implicant[]) =>
        terms.reduce((n, t) => {
          const k = implicantKey(t);
          const others = (usage.get(k) ?? 0) - (own.has(k) ? 1 : 0);
          return n + (others > 0 ? 1 : literalCount(t, nVars) + 1);
        }, 0);
      const costOn = discount(on);
      const costOff = discount(off) + 1;
      next.push(costOff < costOn ? { kind: "sop", invert: true, terms: off } : { kind: "sop", invert: false, terms: on });
    });
    choices = next;
  }
  return choices;
}

export function compileBitmap(bm: Bitmap, budget = DEFAULT_BUDGET): CompileResult {
  const { shape, tables } = truthTables(bm);
  const choices = planOutputs(tables, shape.nIn);
  const b = new Builder(shape.nIn);
  const outputs = choices.map((c) => {
    if (c.kind === "zero") return b.constant(false);
    if (c.kind === "one") return b.constant(true);
    const comps = c.terms.map((t) => b.termComplement(t, shape.nIn));
    const q = b.sumOfTerms(comps);
    return c.invert ? b.not(q) : q;
  });
  const netlist = assemble(b, outputs);
  if (netlist.gates.length > budget) throw new BudgetError(netlist.gates.length, budget);
  return { shape, netlist, bytes: encodeNetlist(netlist), gates: netlist.gates.length };
}

export function compileNaive(bm: Bitmap): number {
  const { shape, tables } = truthTables(bm);
  const b = new Builder(shape.nIn);
  const outputs = tables.map((table) => {
    b.forgetSharing();
    const ms = minterms(table, 1);
    if (ms.length === 0) return b.constant(false);
    if (ms.length === table.length) return b.constant(true);
    const comps = ms.map((m) => b.termComplement({ value: m, mask: 0 }, shape.nIn));
    return b.sumOfTerms(comps);
  });
  return assemble(b, outputs).gates.length;
}

export function rowsFromBytes(bytes: Uint8Array, shape: Shape, frame: number): boolean[][] {
  const rows: boolean[][] = [];
  for (let y = 0; y < shape.w; y++) {
    const out = simulate(bytes, shape.nIn, shape.nOut, inputBytes(y | (frame << shape.yBits), shape.nIn));
    rows.push(unpackBits(out, shape.w));
  }
  return rows;
}

export function matchesBitmap(bytes: Uint8Array, bm: Bitmap): { total: number; matched: number } {
  const { shape } = truthTables(bm);
  let matched = 0;
  for (let t = 0; t < shape.frames; t++) {
    const rows = rowsFromBytes(bytes, shape, t);
    for (let y = 0; y < shape.w; y++) for (let x = 0; x < shape.w; x++) if (rows[y]![x] === bm.frames[t]![y]![x]) matched++;
  }
  return { total: shape.frames * shape.w * shape.w, matched };
}
