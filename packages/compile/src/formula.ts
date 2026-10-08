import type { Bitmap } from "./types";

export class FormulaError extends Error {
  constructor(message: string, readonly pos: number) {
    super(message);
    this.name = "FormulaError";
  }
}

type Tok = { k: "num"; v: number; pos: number } | { k: "id"; v: string; pos: number } | { k: "op"; v: string; pos: number };
type Node =
  | { t: "num"; v: number }
  | { t: "var"; v: "x" | "y" | "t" }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node };

const MAX_LEN = 240;
const MAX_DEPTH = 40;
const OPS = ["<<", ">>", "==", "!=", "<=", ">=", "^", "&", "|", "~", "!", "+", "-", "*", "%", "<", ">", "(", ")"];

function lex(src: string): Tok[] {
  if (src.length > MAX_LEN) throw new FormulaError(`formula longer than ${MAX_LEN} characters`, MAX_LEN);
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      if (c === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        j = i + 2;
        while (/[0-9a-fA-F]/.test(src[j] ?? "")) j++;
      } else {
        while (/[0-9]/.test(src[j] ?? "")) j++;
      }
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v) || v > 0x7fffffff) throw new FormulaError("integer literal out of range", i);
      out.push({ k: "num", v, pos: i });
      i = j;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      let j = i;
      while (/[a-z0-9_]/i.test(src[j] ?? "")) j++;
      out.push({ k: "id", v: src.slice(i, j).toLowerCase(), pos: i });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new FormulaError(`unexpected character '${c}'`, i);
    out.push({ k: "op", v: op, pos: i });
    i += op.length;
  }
  return out;
}

const LEVELS: string[][] = [["|"], ["^"], ["&"], ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"], ["+", "-"], ["*", "%"]];

function parse(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const fail = (m: string): never => { throw new FormulaError(m, peek()?.pos ?? src.length); };

  const binary = (level: number, depth: number): Node => {
    if (depth > MAX_DEPTH) fail("expression nested too deeply");
    if (level === LEVELS.length) return unary(depth);
    let left = binary(level + 1, depth);
    for (;;) {
      const tk = peek();
      if (tk?.k === "op" && LEVELS[level]!.includes(tk.v)) {
        p++;
        left = { t: "bin", op: tk.v, a: left, b: binary(level + 1, depth) };
      } else return left;
    }
  };
  const unary = (depth: number): Node => {
    if (depth > MAX_DEPTH) fail("expression nested too deeply");
    const tk = peek();
    if (tk?.k === "op" && (tk.v === "~" || tk.v === "-" || tk.v === "!")) {
      p++;
      return { t: "un", op: tk.v, a: unary(depth + 1) };
    }
    return primary(depth);
  };
  const primary = (depth: number): Node => {
    const tk = peek();
    if (!tk) return fail("unexpected end of formula");
    p++;
    if (tk.k === "num") return { t: "num", v: tk.v };
    if (tk.k === "id") {
      if (tk.v === "x" || tk.v === "y" || tk.v === "t") return { t: "var", v: tk.v };
      throw new FormulaError(`unknown name '${tk.v}', use x, y or t`, tk.pos);
    }
    if (tk.v === "(") {
      const inner = binary(0, depth + 1);
      const close = peek();
      if (!(close?.k === "op" && close.v === ")")) fail("missing closing parenthesis");
      p++;
      return inner;
    }
    throw new FormulaError(`unexpected '${tk.v}'`, tk.pos);
  };

  const ast = binary(0, 0);
  if (p < toks.length) fail("unexpected trailing input");
  return ast;
}

function evalNode(n: Node, x: number, y: number, t: number): number {
  switch (n.t) {
    case "num": return n.v | 0;
    case "var": return n.v === "x" ? x : n.v === "y" ? y : t;
    case "un": {
      const a = evalNode(n.a, x, y, t);
      return n.op === "~" ? ~a : n.op === "-" ? -a | 0 : a === 0 ? 1 : 0;
    }
    case "bin": {
      const a = evalNode(n.a, x, y, t);
      const b = evalNode(n.b, x, y, t);
      switch (n.op) {
        case "|": return a | b;
        case "^": return a ^ b;
        case "&": return a & b;
        case "==": return a === b ? 1 : 0;
        case "!=": return a !== b ? 1 : 0;
        case "<": return a < b ? 1 : 0;
        case ">": return a > b ? 1 : 0;
        case "<=": return a <= b ? 1 : 0;
        case ">=": return a >= b ? 1 : 0;
        case "<<": return a << (b & 31);
        case ">>": return a >> (b & 31);
        case "+": return (a + b) | 0;
        case "-": return (a - b) | 0;
        case "*": return Math.imul(a, b);
        case "%": return b === 0 ? 0 : a % b;
      }
    }
  }
  return 0;
}

export function formulaToBitmap(src: string, w: number, frames: number): Bitmap {
  const ast = parse(src);
  const out: boolean[][][] = [];
  for (let t = 0; t < frames; t++) {
    const rows: boolean[][] = [];
    for (let y = 0; y < w; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < w; x++) row.push((evalNode(ast, x, y, t) & 1) === 1);
      rows.push(row);
    }
    out.push(rows);
  }
  return { w, frames: out };
}
