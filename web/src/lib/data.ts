import factsRaw from "../generated/facts.json";
import tapeoutsRaw from "../generated/tapeouts.json";
import verifyRaw from "../generated/verify.json";
import benchRaw from "../generated/bench.json";
import phase0Raw from "../generated/phase0.json";
import gasRaw from "../generated/gas.json";
import mintsRaw from "../generated/mints.json";
import designsRaw from "../generated/designs.json";
import type { Address, Hex } from "viem";

export interface Facts {
  chainId?: number;
  deployer?: Address;
  processor?: {
    name: string; symbol: string; story: string; transistorSupply: string; mintPrice: string;
    circuits: Address; transistors: Address; deployTx: Hex; deployBlock: number; ackMs: number; completionMs: number;
  };
  renderer?: { address: Address; deployTx: Hex; deployBlock: number };
  repo?: string;
  site?: string;
  deweb?: { containerId?: string; gateway?: string } | null;
}

export interface TapeoutRecord {
  designId: string; circuitId: number; gates: number; naiveGates: number; w: number; frames: number;
  tapeoutTx: Hex; mintTx: Hex | null; block: number; tapeoutAckMs: number; tapeoutCompletionMs: number; renderMs: number;
  match: { total: number; matched: number }; timestamp: string;
}

export interface DesignFile {
  id: string; title: string; kind: "formula" | "drawn"; w: number; frames: number; formula?: string; rows: string[][];
}

export const facts = factsRaw as Facts;
export const tapeouts = tapeoutsRaw as unknown as TapeoutRecord[];
export const verify = verifyRaw as null | {
  timestamp: string;
  summary: { designs: number; passed: number };
  results: { designId: string; circuitId: number; gates: number; total: number; directEval: number; viaRenderer: number | null; svgEqualsClientSvg: boolean | null; pass: boolean }[];
  tamper: { gate: number; differsAfterMutation: boolean };
  badShape: { checked: string; reverted: boolean } | null;
  budgetRefused: boolean;
};
export const bench = benchRaw as null | {
  timestamp: string;
  rows: { id: string; kind: string; w: number; frames: number; gates: number; naive: number; ratio: number; gatesPerPixel: number; compileMs: number }[];
  summary: { designs: number; meanRatio: number; meanRatioDrawn: number };
};
export const phase0 = phase0Raw as null | { timestamp: string; blockNumber: number; deployFee: string; protocolFee: string; cpuCount: number; summary: { tested: number; passed: number; skipped: number }; ethCallGasCap: { maxGas?: number }; gasPerGate: { min: number; max: number } | null };
export const gas = gasRaw as null | { gasPerGate?: number; svgBudget?: number };
export const mints = mintsRaw as { tx: Hex; amount: number; purpose: string; block: number }[];
export const designs = designsRaw as DesignFile[];

export const verifiedDesignIds = new Set((verify?.results ?? []).filter((r) => r.pass).map((r) => r.designId));
export const tapeoutFor = (designId: string) => tapeouts.find((t) => t.designId === designId);
export const tapeoutByCircuit = (id: number) => tapeouts.find((t) => t.circuitId === id);
export const designById = (id: string) => designs.find((d) => d.id === id);
