import { formatEther } from "viem";
import { transistorsAbi } from "@reticle/chain";
import { compileBitmap } from "@reticle/compile";
import { allDesignIds, designBitmap, loadDesign } from "./design";
import { appendJson, deployer, oklinkTx, publicClient, readJson, requireFacts } from "./lib";

/* One mint covering every design that has not been taped out yet, so the protocol fee is paid once. */
const { processor } = requireFacts();
const done = new Set(readJson<{ designId: string }[]>("evidence/tapeouts.json", []).map((t) => t.designId));
const pending = allDesignIds().filter((id) => !done.has(id));
const gates = pending.reduce((n, id) => n + compileBitmap(designBitmap(loadDesign(id))).gates, 0);
const { account, wallet } = deployer();
const held = await publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "balanceOf", args: [account.address, 0n] });
const need = BigInt(gates) > held ? BigInt(gates) - held : 0n;
if (need === 0n) { console.log("enough ink held"); process.exit(0); }
const [mintPrice, protocolFee] = await Promise.all([
  publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "mintPrice" }),
  publicClient.readContract({ address: processor.transistors, abi: transistorsAbi, functionName: "protocolFee" }),
]);
const value = need * mintPrice + protocolFee;
console.log(`minting ${need} ink for ${pending.join(", ")} = ${formatEther(value)} OKB`);
const sim = await publicClient.simulateContract({ address: processor.transistors, abi: transistorsAbi, functionName: "mint", args: [0n, need], value, account });
const tx = await wallet.writeContract(sim.request);
const r = await publicClient.waitForTransactionReceipt({ hash: tx });
if (r.status !== "success") throw new Error("mint reverted");
appendJson("evidence/mints.json", { tx, block: Number(r.blockNumber), amount: Number(need), id: 0, mintPrice: mintPrice.toString(), protocolFee: protocolFee.toString(), value: value.toString(), purpose: `ink for tapeouts of designs: ${pending.join(", ")} (${gates} gates)`, timestamp: new Date().toISOString() });
console.log(oklinkTx(tx));
