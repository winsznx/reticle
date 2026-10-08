export interface Gate {
  a: number;
  b: number;
}

export interface Netlist {
  nIn: number;
  nOut: number;
  gates: Gate[];
}

export type Frames = boolean[][][];

export interface Bitmap {
  w: number;
  frames: Frames;
}

export const SIGNAL_ZERO = 0;
export const SIGNAL_ONE = 1;
export const inputSignal = (i: number) => 2 + i;
