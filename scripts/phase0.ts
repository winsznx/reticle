import { type Address, encodeFunctionData } from "viem";
import { writeFileSync } from "node:fs";
import { circuitsAbi, factoryAbi, FACTORY, RPC_URLS, XLAYER_ID, makePublicClient } from "@reticle/chain";
import { decodeNetlist, inputBytes, simulate } from "@reticle/compile";

const client = makePublicClient();
const hex = (b: Uint8Array) => ("0x" + Buffer.from(b).toString("hex")) as `0x${string}`;
const fromHex = (h: string) => Uint8Array.from(Buffer.from(h.slice(2), "hex"));

const [deployFee, protocolFee, cpuCount, block] = await Promise.all([
  client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "deployFee" }),
  client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "protocolFee" }),
  client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "cpuCount" }),
  client.getBlockNumber(),
]);
console.log({ deployFee, protocolFee, cpuCount, block });

const tapeoutFeeProbe: Address[] = [];
const candidates: { processor: Address; name: string; id: bigint; nIn: number; nOut: number; nState: number; gates: number }[] = [];
const scanFrom = Number(cpuCount) - 1;
for (let i = scanFrom; i >= Math.max(0, scanFrom - 120) && candidates.length < 10; i--) {
  const processor = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "cpuAt", args: [BigInt(i)] });
  try {
    const next = await client.readContract({ address: processor, abi: circuitsAbi, functionName: "nextId" });
    if (next === 0n) continue;
    const name = await client.readContract({ address: processor, abi: circuitsAbi, functionName: "name" });
    const top = Number(next) > 6 ? 6n : next;
    for (let id = 1n; id <= top; id++) {
      const [nIn, nOut, nState, gates] = await client.readContract({ address: processor, abi: circuitsAbi, functionName: "circuitInfo", args: [id] });
      candidates.push({ processor, name, id, nIn, nOut, nState, gates });
    }
  } catch {
    tapeoutFeeProbe.push(processor);
  }
}
console.log(`candidates: ${candidates.length}`);

interface Check {
  processor: Address; name: string; id: number; nIn: number; nOut: number; gateCount: number; netlistBytes: number;
  inputsTested: number; match: boolean; mismatches: number; skipped?: string; evalGas?: number; gasPerGate?: number; netlistGateCount?: number; usesLatch?: boolean;
}
const checks: Check[] = [];
for (const c of candidates) {
  const base = { processor: c.processor, name: c.name, id: Number(c.id), nIn: c.nIn, nOut: c.nOut, gateCount: c.gates };
  const nl = await client.readContract({ address: c.processor, abi: circuitsAbi, functionName: "netlist", args: [c.id] });
  const bytes = fromHex(nl);
  let decoded;
  try { decoded = decodeNetlist(bytes); } catch (e) {
    checks.push({ ...base, netlistBytes: bytes.length, inputsTested: 0, match: false, mismatches: 0, skipped: `decode: ${(e as Error).message}` });
    continue;
  }
  const usesLatch = decoded.some((g) => g.op !== "nand");
  if (usesLatch || c.nState > 0 || c.nIn > 8) {
    checks.push({ ...base, netlistBytes: bytes.length, inputsTested: 0, match: false, mismatches: 0, usesLatch, netlistGateCount: decoded.length, skipped: usesLatch || c.nState > 0 ? "sequential or non-NAND" : "nIn > 8" });
    continue;
  }
  const total = 2 ** c.nIn;
  let mismatches = 0;
  for (let start = 0; start < total; start += 8) {
    const batch = Array.from({ length: Math.min(8, total - start) }, (_, k) => start + k);
    const results = await Promise.all(
      batch.map(async (v) => {
        const inp = inputBytes(v, c.nIn);
        const onchain = await client.readContract({ address: c.processor, abi: circuitsAbi, functionName: "eval", args: [c.id, hex(inp)] });
        return hex(simulate(bytes, c.nIn, c.nOut, inp)) === onchain;
      }),
    );
    mismatches += results.filter((ok) => !ok).length;
  }
  let evalGas: number | undefined;
  try {
    evalGas = Number(await client.estimateGas({ to: c.processor, account: "0x0000000000000000000000000000000000000001", data: encodeFunctionData({ abi: circuitsAbi, functionName: "eval", args: [c.id, hex(inputBytes(total - 1, c.nIn))] }) }));
  } catch {}
  checks.push({ ...base, netlistBytes: bytes.length, inputsTested: total, match: mismatches === 0, mismatches, netlistGateCount: decoded.length, evalGas, gasPerGate: evalGas ? Math.round(evalGas / Math.max(1, decoded.length)) : undefined });
  console.log(c.name, `#${c.id}`, `nIn=${c.nIn} nOut=${c.nOut} gates=${c.gates} bytesGates=${decoded.length}`, mismatches === 0 ? "MATCH" : `MISMATCH x${mismatches}/${total}`);
}

const tested = checks.filter((c) => c.inputsTested > 0);
const passed = tested.filter((c) => c.match);

let capProbe: { lowGood?: number; highBad?: number; maxGas?: number } = {};
const target = tested.find((c) => c.evalGas);
if (target) {
  const c = candidates.find((x) => x.processor === target.processor && Number(x.id) === target.id)!;
  const callWith = async (gas: bigint) => {
    try {
      await client.call({
        to: c.processor, gas,
        data: encodeFunctionData({ abi: circuitsAbi, functionName: "eval", args: [c.id, hex(inputBytes(1, c.nIn))] }),
      });
      return true;
    } catch (e) {
      return !/gas/i.test(String((e as Error).message));
    }
  };
  let lo = 1_000_000n, hi = 2_000_000_000n;
  while (hi - lo > 1_000_000n) {
    const mid = (lo + hi) / 2n;
    if (await callWith(mid)) lo = mid; else hi = mid;
  }
  capProbe = { lowGood: Number(lo), highBad: Number(hi), maxGas: Number(lo) };
}

const gasSamples = tested.filter((c) => c.gasPerGate).map((c) => c.gasPerGate!);
const evidence = {
  source: "scripts/phase0.ts", chainId: XLAYER_ID, rpc: RPC_URLS[0], blockNumber: Number(block), timestamp: new Date().toISOString(),
  factory: FACTORY, deployFee: deployFee.toString(), protocolFee: protocolFee.toString(), cpuCount: Number(cpuCount),
  checks, summary: { tested: tested.length, passed: passed.length, skipped: checks.length - tested.length },
  ethCallGasCap: capProbe, gasPerGate: gasSamples.length ? { min: Math.min(...gasSamples), max: Math.max(...gasSamples), samples: gasSamples.length } : null,
};
writeFileSync(new URL("../evidence/phase0.json", import.meta.url), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence.summary), evidence.ethCallGasCap, evidence.gasPerGate);
if (tested.length === 0 || passed.length !== tested.length) {
  console.error("GATE FAILED: sim != eval");
  process.exit(1);
}
console.log("GATE PASSED: sim == eval on live circuits");
