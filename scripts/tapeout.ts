import { decodeEventLog, formatEther, bytesToHex, type Hex } from "viem";
import { circuitsAbi, readShape, renderFrame, transistorsAbi } from "@reticle/chain";
import { compileBitmap, compileNaive, matchesBitmap } from "@reticle/compile";
import { allDesignIds, designBitmap, loadDesign } from "./design";
import { appendJson, deployer, oklinkTx, publicClient, readJson, requireFacts } from "./lib";

interface TapeoutRecord {
  designId: string;
  circuitId: number;
  gates: number;
  naiveGates: number;
  w: number;
  frames: number;
  tapeoutTx: Hex;
  mintTx: Hex | null;
  block: number;
  tapeoutAckMs: number;
  tapeoutCompletionMs: number;
  renderMs: number;
  match: { total: number; matched: number };
  timestamp: string;
}

export async function tapeoutDesign(idOrPath: string) {
  const { processor } = requireFacts();
  const design = loadDesign(idOrPath);
  const existing = readJson<TapeoutRecord[]>("evidence/tapeouts.json", []).find((r) => r.designId === design.id);
  if (existing) {
    console.log(`${design.id} already taped out as #${existing.circuitId}`);
    return existing;
  }
  const bm = designBitmap(design);
  const res = compileBitmap(bm);
  const sim = matchesBitmap(res.bytes, bm);
  if (sim.matched !== sim.total) throw new Error(`${design.id}: simulator mismatch ${sim.matched}/${sim.total}`);
  const naiveGates = compileNaive(bm);

  const { account, wallet } = deployer();
  const [mintPrice, protocolFee, tapeoutFee, balance] = await Promise.all([
    publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "mintPrice" }),
    publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "protocolFee" }),
    publicClient.readContract({ address: processor.circuits, abi: circuitsAbi, functionName: "TAPEOUT_FEE" }),
    publicClient.getBalance({ address: account.address }),
  ]);
  const held = await publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "balanceOf", args: [account.address, 0n] });
  const need = BigInt(res.gates) > held ? BigInt(res.gates) - held : 0n;
  const mintValue = need > 0n ? need * mintPrice + protocolFee : 0n;
  const total = mintValue + tapeoutFee;
  console.log(`${design.id}: ${res.gates} gates (naive ${naiveGates}), mint ${need} ink, total ${formatEther(total)} OKB + gas, balance ${formatEther(balance)}`);
  if (balance < total + 10n ** 15n) throw new Error("insufficient OKB");

  let mintTx: Hex | null = null;
  if (need > 0n) {
    const sim1 = await publicClient.simulateContract({ address: processor.transistors, abi: transistorsAbi, functionName: "mint", args: [0n, need], value: mintValue, account });
    mintTx = await wallet.writeContract(sim1.request);
    const r = await publicClient.waitForTransactionReceipt({ hash: mintTx });
    if (r.status !== "success") throw new Error("mint reverted");
    appendJson("evidence/mints.json", {
      tx: mintTx, block: Number(r.blockNumber), amount: Number(need), id: 0, mintPrice: mintPrice.toString(), protocolFee: protocolFee.toString(),
      value: mintValue.toString(), purpose: `ink for tapeout of design '${design.id}' (${res.gates} gates)`, timestamp: new Date().toISOString(),
    });
  }

  const args = [bytesToHex(res.bytes), res.shape.nIn, res.shape.nOut] as const;
  const call = () => publicClient.simulateContract({ address: processor.circuits, abi: circuitsAbi, functionName: "tapeout", args, value: tapeoutFee, account });
  let simTape;
  try {
    simTape = await call();
  } catch (e) {
    console.log("tapeout simulation failed, trying setApprovalForAll first:", (e as Error).message.split("\n")[0]);
    const ap = await wallet.writeContract({ address: processor.transistors, abi: [{ type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "bool" }], outputs: [] }], functionName: "setApprovalForAll", args: [processor.circuits, true] });
    await publicClient.waitForTransactionReceipt({ hash: ap });
    simTape = await call();
  }
  const t0 = Date.now();
  const tapeoutTx = await wallet.writeContract(simTape.request);
  const tapeoutAckMs = Date.now() - t0;
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tapeoutTx });
  const tapeoutCompletionMs = Date.now() - t0;
  if (receipt.status !== "success") throw new Error("tapeout reverted");

  let circuitId: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== processor.circuits.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: circuitsAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "Transfer" && /^0x0+$/.test(ev.args.from)) circuitId = ev.args.tokenId;
    } catch {}
  }
  if (circuitId === null) circuitId = (await publicClient.readContract({ address: processor.circuits, abi: circuitsAbi, functionName: "nextId" })) as bigint;

  const t1 = Date.now();
  const shape = await readShape(publicClient, processor.circuits, circuitId);
  let matched = 0;
  for (let t = 0; t < shape.frames; t++) {
    const rows = await renderFrame(publicClient, processor.circuits, circuitId, shape, t);
    for (let y = 0; y < shape.w; y++) for (let x = 0; x < shape.w; x++) if (rows[y]![x] === bm.frames[t]![y]![x]) matched++;
  }
  const record: TapeoutRecord = {
    designId: design.id, circuitId: Number(circuitId), gates: res.gates, naiveGates, w: shape.w, frames: shape.frames,
    tapeoutTx, mintTx, block: Number(receipt.blockNumber), tapeoutAckMs, tapeoutCompletionMs, renderMs: Date.now() - t1,
    match: { total: shape.frames * shape.w * shape.w, matched }, timestamp: new Date().toISOString(),
  };
  appendJson("evidence/tapeouts.json", record);
  console.log(`${design.id} -> circuit #${circuitId}, ${matched}/${record.match.total} match, ${oklinkTx(tapeoutTx)}`);
  if (matched !== record.match.total) throw new Error(`MISMATCH on ${design.id}`);
  return record;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const ids = process.argv.includes("--all") ? allDesignIds() : args;
  if (ids.length === 0) throw new Error("usage: tapeout.ts <design id|path>... | --all");
  for (const id of ids) await tapeoutDesign(id);
}
