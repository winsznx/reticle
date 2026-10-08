import { encodeFunctionData } from "viem";
import { rendererAbi } from "@reticle/chain";
import { loadFacts, publicClient, readJson, writeJson } from "./lib";

const facts = loadFacts();
const taped = readJson<{ designId: string; circuitId: number; gates: number; w: number; frames: number }[]>("evidence/tapeouts.json", []);
if (!facts.processor || !facts.renderer) throw new Error("deploy processor and renderer first");

const cap = await probeDefaultCap();

async function probeDefaultCap(): Promise<number> {
  const old = facts.previousRenderers?.[0];
  if (!old) return 50_000_000;
  try {
    await publicClient.readContract({ address: old.address, abi: rendererAbi, functionName: "svg", args: [facts.processor!.circuits, 1n, 0] });
  } catch (e) {
    const m = /exceeds:?\s*(\d+)/.exec(String((e as Error).message));
    if (m) return Number(m[1]);
  }
  return 50_000_000;
}

const samples = [];
for (const t of taped) {
  const data = encodeFunctionData({ abi: rendererAbi, functionName: "svg", args: [facts.processor.circuits, BigInt(t.circuitId), 0] });
  const gas = Number(await publicClient.estimateGas({ to: facts.renderer.address, data, account: "0x0000000000000000000000000000000000000001" }));
  const t0 = performance.now();
  await publicClient.call({ to: facts.renderer.address, data });
  const callMs = Math.round(performance.now() - t0);
  samples.push({ designId: t.designId, circuitId: t.circuitId, gates: t.gates, w: t.w, svgGas: gas, gasPerGateRow: Math.round(gas / (t.gates * t.w)), callMs });
  console.log(t.designId, gas, callMs + "ms");
}
const gasPerGate = Math.max(...samples.map((s) => s.gasPerGateRow));
const out = {
  source: "scripts/measure-gas.ts", timestamp: new Date().toISOString(), ethCallGasCap: cap, gasPerGate,
  svgBudget: Math.round(cap * 0.8), capNote: "default eth_call gas on rpc.xlayer.tech, read from its out-of-gas error; an explicit gas field is accepted far above it", rule: "svg() is used when gates * W * gasPerGate < 0.8 * eth_call gas cap, otherwise per-row eval", samples,
};
writeJson("evidence/gas.json", out);
console.log({ gasPerGate, svgBudget: out.svgBudget });
