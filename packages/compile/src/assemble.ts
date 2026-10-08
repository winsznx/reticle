import type { Gate, Netlist } from "./types";
import { SIGNAL_ONE, SIGNAL_ZERO } from "./types";
import { Builder } from "./synth";

export class BudgetError extends Error {
  constructor(readonly gates: number, readonly budget: number) {
    super(`netlist needs ${gates} gates, budget is ${budget}`);
    this.name = "BudgetError";
  }
}

/*
 * Outputs must be exactly the last nOut gates, in column order. An output gate can be the
 * existing node only when it is unshared; otherwise a fresh NOT(NOT(node)) tail gate is emitted.
 */
export function assemble(b: Builder, outputs: number[]): Netlist {
  const nIn = b.nIn;
  const base = 2 + nIn;
  const occurrences = new Map<number, number>();
  for (const s of outputs) occurrences.set(s, (occurrences.get(s) ?? 0) + 1);

  const countUses = () => {
    const uses = new Map<number, number>();
    for (const g of b.gates) {
      uses.set(g.a, (uses.get(g.a) ?? 0) + 1);
      uses.set(g.b, (uses.get(g.b) ?? 0) + 1);
    }
    return uses;
  };

  const inverted = new Map<number, number>();
  let claimed = new Set<number>();
  for (;;) {
    const uses = countUses();
    const next = new Set<number>();
    for (const s of outputs) {
      if (s >= base && (uses.get(s) ?? 0) === 0 && occurrences.get(s) === 1) next.add(s);
    }
    let grew = false;
    for (const s of outputs) {
      if (next.has(s) || s === SIGNAL_ZERO || s === SIGNAL_ONE || inverted.has(s)) continue;
      inverted.set(s, b.not(s));
      grew = true;
    }
    if (!grew) {
      claimed = next;
      break;
    }
  }

  const tails: ({ claimed: number } | { fresh: Gate })[] = outputs.map((s) => {
    if (claimed.has(s)) return { claimed: s };
    if (s === SIGNAL_ZERO) return { fresh: { a: SIGNAL_ONE, b: SIGNAL_ONE } };
    if (s === SIGNAL_ONE) return { fresh: { a: SIGNAL_ZERO, b: SIGNAL_ZERO } };
    const inv = inverted.get(s)!;
    return { fresh: { a: inv, b: inv } };
  });

  const remap = new Map<number, number>();
  const gates: Gate[] = [];
  const map = (s: number) => (s < base ? s : remap.get(s)!);
  b.gates.forEach((g, i) => {
    const sig = base + i;
    if (claimed.has(sig)) return;
    gates.push({ a: map(g.a), b: map(g.b) });
    remap.set(sig, base + gates.length - 1);
  });
  for (const t of tails) {
    if ("claimed" in t) {
      const g = b.gates[t.claimed - base]!;
      gates.push({ a: map(g.a), b: map(g.b) });
      remap.set(t.claimed, base + gates.length - 1);
    } else {
      gates.push({ a: map(t.fresh.a), b: map(t.fresh.b) });
    }
  }
  return { nIn, nOut: outputs.length, gates };
}
