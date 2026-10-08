import type { Gate } from "./types";
import { SIGNAL_ONE, SIGNAL_ZERO, inputSignal } from "./types";
import type { Implicant } from "./qm";

export class Builder {
  readonly gates: Gate[] = [];
  private hash = new Map<string, number>();
  constructor(readonly nIn: number, private readonly share = true) {}

  private signalOf(index: number) {
    return 2 + this.nIn + index;
  }

  nand(a: number, b: number): number {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo},${hi}`;
    const hit = this.hash.get(key);
    if (hit !== undefined) return hit;
    this.gates.push({ a: lo, b: hi });
    const s = this.signalOf(this.gates.length - 1);
    if (this.share) this.hash.set(key, s);
    return s;
  }

  not(s: number): number {
    return this.nand(s, s);
  }

  and(a: number, b: number): number {
    return this.not(this.nand(a, b));
  }

  forgetSharing() {
    this.hash.clear();
  }

  literal(varIndex: number, positive: boolean): number {
    const s = inputSignal(varIndex);
    return positive ? s : this.not(s);
  }

  /* Returns the complement of the product term (one NAND over the AND-chain of its literals). */
  termComplement(term: Implicant, nVars: number): number {
    const lits: number[] = [];
    for (let b = 0; b < nVars; b++) {
      if ((term.mask >> b) & 1) continue;
      lits.push(this.literal(b, ((term.value >> b) & 1) === 1));
    }
    if (lits.length === 0) throw new Error("empty product term");
    if (lits.length === 1) return this.not(lits[0]!);
    let p = lits[0]!;
    for (let i = 1; i < lits.length - 1; i++) p = this.and(p, lits[i]!);
    return this.nand(p, lits[lits.length - 1]!);
  }

  /* OR of products given their complements: NAND(¬p1, ¬p2), then NAND(NOT(q), ¬pi). */
  sumOfTerms(complements: number[]): number {
    if (complements.length === 0) return SIGNAL_ZERO;
    if (complements.length === 1) return this.not(complements[0]!);
    let q = this.nand(complements[0]!, complements[1]!);
    for (let i = 2; i < complements.length; i++) q = this.nand(this.not(q), complements[i]!);
    return q;
  }

  constant(value: boolean): number {
    return value ? SIGNAL_ONE : SIGNAL_ZERO;
  }
}

export function sortTerms(terms: Implicant[]): Implicant[] {
  return [...terms].sort((p, q) => p.mask - q.mask || p.value - q.value);
}
