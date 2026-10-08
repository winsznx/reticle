/* eval inputs and outputs are little-endian bit-packed: bit i lives in byte i>>3, bit i&7. */
export function packBits(bits: ArrayLike<boolean | number>): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3]! |= 1 << (i & 7);
  return out;
}

export function unpackBits(bytes: Uint8Array, n: number): boolean[] {
  const out: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) out[i] = ((bytes[i >> 3] ?? 0) >> (i & 7) & 1) === 1;
  return out;
}

export function inputBytes(value: number, nIn: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(nIn / 8));
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(value / 2 ** (8 * i)) & 0xff;
  return out;
}
