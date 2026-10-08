import { readFileSync } from "node:fs";
import { formatEther, type Hex } from "viem";
import { deployer, loadFacts, oklinkAddr, oklinkTx, publicClient, saveFacts } from "./lib";

const facts = loadFacts();
const redeploy = process.argv.includes("--redeploy");
if (facts.renderer && !redeploy) {
  console.log("renderer already deployed:", facts.renderer.address);
  process.exit(0);
}
if (facts.renderer) facts.previousRenderers = [...(facts.previousRenderers ?? []), { ...facts.renderer, note: "replaced: svg() built its string with quadratic memory growth and exceeded the 50M eth_call gas cap" }];
const artifact = JSON.parse(readFileSync(new URL("../contracts/out/ReticleRenderer.sol/ReticleRenderer.json", import.meta.url), "utf8"));
const bytecode = artifact.bytecode.object as Hex;
const { account, wallet } = deployer();
const balance = await publicClient.getBalance({ address: account.address });
console.log(`deploying ReticleRenderer, balance ${formatEther(balance)} OKB`);
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode, account });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("renderer deploy failed");
facts.renderer = { address: receipt.contractAddress, deployTx: hash, deployBlock: Number(receipt.blockNumber) };
saveFacts(facts);
console.log("renderer", receipt.contractAddress, oklinkAddr(receipt.contractAddress), oklinkTx(hash));
