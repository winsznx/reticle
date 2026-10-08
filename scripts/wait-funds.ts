import { formatEther, parseEther } from "viem";
import { deployer, publicClient } from "./lib";

const minArg = process.argv.find((a) => a.startsWith("--min="));
const min = parseEther(minArg ? minArg.slice(6) : "0.05");
const { account } = deployer();
console.log(`waiting for >= ${formatEther(min)} OKB at ${account.address}`);
for (;;) {
  const bal = await publicClient.getBalance({ address: account.address });
  console.log(new Date().toISOString(), formatEther(bal), "OKB");
  if (bal >= min) break;
  await new Promise((r) => setTimeout(r, 15_000));
}
console.log("funded");
