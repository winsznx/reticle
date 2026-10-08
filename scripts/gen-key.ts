import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, appendFileSync, readFileSync } from "node:fs";

const path = new URL("../.env", import.meta.url);
if (existsSync(path) && /DEPLOYER_PRIVATE_KEY=0x[0-9a-f]{64}/i.test(readFileSync(path, "utf8"))) {
  const key = readFileSync(path, "utf8").match(/DEPLOYER_PRIVATE_KEY=(0x[0-9a-f]{64})/i)![1] as `0x${string}`;
  console.log("deployer", privateKeyToAccount(key).address);
} else {
  const key = generatePrivateKey();
  appendFileSync(path, `DEPLOYER_PRIVATE_KEY=${key}\n`, { mode: 0o600 });
  console.log("deployer", privateKeyToAccount(key).address);
}
