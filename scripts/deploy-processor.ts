import { formatEther, type Address } from "viem";
import { circuitsAbi, factoryAbi, FACTORY, transistorsAbi } from "@reticle/chain";
import { deployer, loadFacts, oklinkTx, publicClient, saveFacts } from "./lib";

export const PARAMS = {
  name: "Reticle",
  symbol: "RTCL",
  story:
    "Reticle: images that are circuits. Every image is a NAND circuit and renders from its own eval, wallet-free and gas-free for viewers. Ink = transistors. Supply cap 1,048,576 (shared NAND/LATCH), price 0.00003 OKB each, no other cap, immutable at deploy. One transistor burns per gate at tapeout. Mint proceeds go to the creator via owed()/withdraw(). Built on TapeOut upgradeable beacon contracts, unaudited.",
  transistorSupply: 1_048_576n,
  mintPrice: 30_000_000_000_000n,
} as const;

const facts = loadFacts();
if (facts.processor) {
  console.log("processor already deployed:", facts.processor.circuits);
  process.exit(0);
}
const { account, wallet } = deployer();
const deployFee = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "deployFee" });
const balance = await publicClient.getBalance({ address: account.address });
console.log("params", { ...PARAMS, transistorSupply: PARAMS.transistorSupply.toString(), mintPrice: PARAMS.mintPrice.toString() });
console.log(`deployFee ${formatEther(deployFee)} OKB, balance ${formatEther(balance)} OKB`);
if (!process.argv.includes("--confirm")) {
  console.log("dry run. re-run with --confirm to send createCPU (irreversible).");
  process.exit(0);
}
if (balance < deployFee * 3n) throw new Error("balance too low for deploy plus gas headroom");

const args = [PARAMS.name, PARAMS.symbol, PARAMS.story, PARAMS.transistorSupply, PARAMS.mintPrice] as const;
const sim = await publicClient.simulateContract({ address: FACTORY, abi: factoryAbi, functionName: "createCPU", args, value: deployFee, account });
const [expectTransistors, expectCircuits] = sim.result;

const t0 = Date.now();
const hash = await wallet.writeContract(sim.request);
const ackMs = Date.now() - t0;
console.log("sent", hash, `ack ${ackMs}ms`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const completionMs = Date.now() - t0;
if (receipt.status !== "success") throw new Error("createCPU reverted");

const count = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "cpuCount" });
let circuits: Address = expectCircuits;
const isCpu = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "isCPU", args: [circuits] });
if (!isCpu) {
  for (let i = count - 1n; i >= count - 5n && i >= 0n; i--) {
    const c = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "cpuAt", args: [i] });
    const tx = await publicClient.readContract({ address: c, abi: circuitsAbi, functionName: "transistors" });
    const creator = await publicClient.readContract({ address: tx, abi: transistorsAbi, functionName: "creator" });
    if (creator.toLowerCase() === account.address.toLowerCase()) circuits = c;
  }
}
const transistors = await publicClient.readContract({ address: circuits, abi: circuitsAbi, functionName: "transistors" });
if (transistors.toLowerCase() !== expectTransistors.toLowerCase()) console.warn("simulated transistors differ from on-chain, using on-chain value");

facts.processor = {
  ...{ name: PARAMS.name, symbol: PARAMS.symbol, story: PARAMS.story },
  transistorSupply: PARAMS.transistorSupply.toString(),
  mintPrice: PARAMS.mintPrice.toString(),
  circuits,
  transistors,
  deployTx: hash,
  deployBlock: Number(receipt.blockNumber),
  ackMs,
  completionMs,
};
saveFacts(facts);
console.log("circuits", circuits, "transistors", transistors, oklinkTx(hash));
