/*
 * Circuits are immutable, so a row read once is valid for the session. Keyed circuits:id:frame:row.
 * The cache is opt-in so scripts and the Verify button always read the chain.
 */
export interface RowStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

export const rowKey = (circuits: string, id: bigint | number, frame: number, row: number | string) =>
  `${circuits.toLowerCase()}:${id}:${frame}:${row}`;

export class MemoryStore implements RowStore {
  private m = new Map<string, string>();
  get(k: string) { return this.m.get(k); }
  set(k: string, v: string) { this.m.set(k, v); }
}

/* Memory first, mirrored into sessionStorage when it is available (private modes and quotas can throw). */
export class SessionStore implements RowStore {
  private mem = new MemoryStore();
  constructor(private readonly prefix = "reticle:") {}
  get(k: string) {
    const hit = this.mem.get(k);
    if (hit !== undefined) return hit;
    try {
      const v = globalThis.sessionStorage?.getItem(this.prefix + k) ?? undefined;
      if (v !== undefined) this.mem.set(k, v);
      return v;
    } catch {
      return undefined;
    }
  }
  set(k: string, v: string) {
    this.mem.set(k, v);
    try { globalThis.sessionStorage?.setItem(this.prefix + k, v); } catch { /* quota or blocked storage */ }
  }
}

let active: RowStore | null = null;
export const setRowStore = (s: RowStore | null) => { active = s; };
export const rowStore = () => active;
