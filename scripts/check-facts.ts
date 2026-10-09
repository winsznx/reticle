import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { loadFacts, root } from "./lib";

const facts = loadFacts();
const problems: string[] = [];
const files = execSync("git ls-files", { cwd: root.pathname, encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !/pnpm-lock|\.(png|woff2?|mp4|gif)$|contracts\/lib\//.test(f) && existsSync(new URL(f, root)));
const read = (f: string) => readFileSync(new URL(f, root), "utf8");

const known = new Set<string>(
  [
    "0x1f09DAeFA827f02CBb40967cc91b259763760761", "0xf70d1ed4f62cf3780157b0b421b7e2f45bd0991c", "0x977f217887e085d298cb3819cdad5a0ee35f29b2",
    "0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6", "0x536adD8F30f03b69f6fbF29d425A816A0dC50106", "0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9",
    "0x839bdD6fa7A66416A609A735e11DE5411B98574e", "0x0000000000000000000000000000000000000001",
    facts.deployer, ...(facts.previousRenderers ?? []).map((r) => r.address), facts.processor?.circuits, facts.processor?.transistors, facts.renderer?.address,
  ].filter((a): a is string => !!a).map((a) => a.toLowerCase()),
);

for (const f of files.filter((f) => /\.(md|tsx?|json|html|js)$/.test(f) && !/web\/src\/generated|evidence\//.test(f))) {
  for (const m of read(f).matchAll(/0x[0-9a-fA-F]{40}\b/g)) {
    if (!known.has(m[0].toLowerCase()) && !/0x0+$/.test(m[0]) && !/^0x(0|f)+$/i.test(m[0])) problems.push(`${f}: unknown address ${m[0]}`);
  }
}

if (facts.processor) {
  const readme = read("README.md");
  for (const needle of [facts.processor.circuits, facts.processor.transistors, "1,048,576", "0.00003"]) {
    if (!readme.includes(needle)) problems.push(`README.md does not mention ${needle}`);
  }
  if (!readme.includes(facts.processor.story.slice(0, 40))) problems.push("README.md does not quote the on-chain story");
}

const termsFile = new URL(".local/forbidden-terms.txt", root);
if (existsSync(termsFile)) {
  const re = new RegExp(readFileSync(termsFile, "utf8").split("\n").filter(Boolean).join("|"), "i");
  for (const f of files) {
    if (f === ".gitignore" || f === ".vercelignore") continue;
    read(f).split("\n").forEach((line, i) => re.test(line) && problems.push(`${f}:${i + 1} contains a forbidden term`));
  }
} else console.warn("forbidden-terms list missing, skipped term scan");

if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`facts check passed over ${files.length} files`);
