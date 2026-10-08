import { nandOnly } from "./encode";
import { packBits, unpackBits } from "./bits";

/* Evaluates from the encoded bytes, never from the in-memory IR. */
export function simulate(netlist: Uint8Array, nIn: number, nOut: number, inputs: Uint8Array): Uint8Array {
  const gates = nandOnly(netlist);
  const sig = new Uint8Array(2 + nIn + gates.length);
  sig[1] = 1;
  const inBits = unpackBits(inputs, nIn);
  for (let i = 0; i < nIn; i++) sig[2 + i] = inBits[i] ? 1 : 0;
  for (let g = 0; g < gates.length; g++) {
    const gate = gates[g]!;
    sig[2 + nIn + g] = (sig[gate.a]! & sig[gate.b]!) ^ 1;
  }
  const outs: number[] = [];
  for (let j = 0; j < nOut; j++) outs.push(sig[2 + nIn + gates.length - nOut + j]!);
  return packBits(outs);
}

export function gateCount(netlist: Uint8Array): number {
  return nandOnly(netlist).length;
}
