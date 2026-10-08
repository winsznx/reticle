import type { Gate, Netlist } from "./types";

const OP_NAND = 0x00;
const OP_LATCH = 0x01;
const U24_MAX = 0xffffff;

/*
 * Netlist wire format: no header, u24 big-endian integers.
 * Signal 0 = const 0, 1 = const 1, input i = 2 + i, gate g = 2 + nIn + g.
 * NAND = 0x00 a b (7 bytes). Outputs are the last nOut gates, in order.
 */
export function encodeNetlist(net: Netlist): Uint8Array {
  const out = new Uint8Array(net.gates.length * 7);
  net.gates.forEach((g, i) => {
    const self = 2 + net.nIn + i;
    if (g.a >= self || g.b >= self) throw new Error(`forward reference at gate ${i}`);
    if (g.a > U24_MAX || g.b > U24_MAX) throw new Error("signal exceeds u24");
    const o = i * 7;
    out[o] = OP_NAND;
    out[o + 1] = g.a >> 16;
    out[o + 2] = (g.a >> 8) & 0xff;
    out[o + 3] = g.a & 0xff;
    out[o + 4] = g.b >> 16;
    out[o + 5] = (g.b >> 8) & 0xff;
    out[o + 6] = g.b & 0xff;
  });
  return out;
}

export type DecodedGate = { op: "nand"; a: number; b: number } | { op: "latch"; d: number };

export function decodeNetlist(bytes: Uint8Array): DecodedGate[] {
  const gates: DecodedGate[] = [];
  const u24 = (o: number) => (bytes[o]! << 16) | (bytes[o + 1]! << 8) | bytes[o + 2]!;
  let o = 0;
  while (o < bytes.length) {
    const op = bytes[o];
    if (op === OP_NAND) {
      if (o + 7 > bytes.length) throw new Error("truncated NAND");
      gates.push({ op: "nand", a: u24(o + 1), b: u24(o + 4) });
      o += 7;
    } else if (op === OP_LATCH) {
      if (o + 4 > bytes.length) throw new Error("truncated LATCH");
      gates.push({ op: "latch", d: u24(o + 1) });
      o += 4;
    } else {
      throw new Error(`unsupported opcode 0x${op!.toString(16)} at byte ${o}`);
    }
  }
  return gates;
}

export function nandOnly(bytes: Uint8Array): Gate[] {
  return decodeNetlist(bytes).map((g) => {
    if (g.op !== "nand") throw new Error("netlist contains non-NAND gate");
    return { a: g.a, b: g.b };
  });
}
