/* mask bit = 1 means the variable is eliminated (don't care); value bits under the mask are 0. */
export interface Implicant {
  value: number;
  mask: number;
}

export const implicantKey = (i: Implicant) => (i.mask << 16) | i.value;

export function literalCount(i: Implicant, nVars: number): number {
  let n = 0;
  for (let b = 0; b < nVars; b++) if (!((i.mask >> b) & 1)) n++;
  return n;
}

export function covers(i: Implicant, minterm: number): boolean {
  return ((minterm & ~i.mask) ^ i.value) === 0;
}

export function primeImplicants(minterms: number[], nVars: number): Implicant[] {
  let current = new Map<number, Implicant>();
  for (const m of minterms) {
    const imp = { value: m, mask: 0 };
    current.set(implicantKey(imp), imp);
  }
  const primes: Implicant[] = [];
  while (current.size > 0) {
    const next = new Map<number, Implicant>();
    const used = new Set<number>();
    for (const imp of current.values()) {
      for (let b = 0; b < nVars; b++) {
        const bit = 1 << b;
        if (imp.mask & bit || imp.value & bit) continue;
        const partner = { value: imp.value | bit, mask: imp.mask };
        if (!current.has(implicantKey(partner))) continue;
        used.add(implicantKey(imp));
        used.add(implicantKey(partner));
        const merged = { value: imp.value, mask: imp.mask | bit };
        next.set(implicantKey(merged), merged);
      }
    }
    for (const [k, imp] of current) if (!used.has(k)) primes.push(imp);
    current = next;
  }
  return primes;
}

/*
 * Greedy set cover (not Petrick): essential primes first, then repeatedly the prime with the
 * best newly-covered / weight ratio, then redundant picks are dropped. Not guaranteed minimal.
 */
export function selectCover(
  minterms: number[],
  primes: Implicant[],
  weight: (i: Implicant) => number,
): Implicant[] {
  const uncovered = new Set(minterms);
  const chosen: Implicant[] = [];
  const pick = (imp: Implicant) => {
    chosen.push(imp);
    for (const m of [...uncovered]) if (covers(imp, m)) uncovered.delete(m);
  };

  for (const m of minterms) {
    if (!uncovered.has(m)) continue;
    const owners = primes.filter((p) => covers(p, m));
    if (owners.length === 1 && !chosen.includes(owners[0]!)) pick(owners[0]!);
  }

  while (uncovered.size > 0) {
    let best: Implicant | null = null;
    let bestScore = -1;
    for (const p of primes) {
      if (chosen.includes(p)) continue;
      let gain = 0;
      for (const m of uncovered) if (covers(p, m)) gain++;
      if (gain === 0) continue;
      const score = gain / weight(p);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (!best) throw new Error("cover failed");
    pick(best);
  }

  const kept = [...chosen];
  for (const imp of chosen) {
    const rest = kept.filter((k) => k !== imp);
    if (minterms.every((m) => rest.some((o) => covers(o, m)))) kept.splice(kept.indexOf(imp), 1);
  }
  return kept;
}
