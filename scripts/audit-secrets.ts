import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { root, writeJson } from "./lib";

const cwd = root.pathname;
const sh = (cmd: string) => { try { return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return (e as { stdout?: string }).stdout ?? ""; } };

const BUILD_DIRS = /^(node_modules|dist|out|\.next|\.vercel|broadcast|cache|test-results|playwright-report|film|contracts\/lib|contracts\/out|contracts\/cache)\/?$/;
const localOnly = sh("git ls-files --others --ignored --exclude-standard --directory").split("\n").filter((d) => d.endsWith("/") && !BUILD_DIRS.test(d) && !/(^|\/)node_modules\//.test(d));
const historyFiles = sh("git log --all --name-only --pretty=format:").split("\n").filter(Boolean);
const forbiddenInHistory = [...new Set(historyFiles)].filter((f) => (/(^|\/)\.env(\..*)?$/.test(f) && f !== ".env.example") || localOnly.some((d) => f.startsWith(d)));

const key = readFileSync(join(cwd, ".env"), "utf8").match(/0x[0-9a-fA-F]{64}/)?.[0]?.slice(2) ?? "";
const keyInHistory = key ? sh(`git log --all -p -S${key} --oneline`).trim().length > 0 : false;

const leaks = sh("gitleaks git . --no-banner --redact --report-format json --report-path /dev/stdout 2>/dev/null");
let gitleaksFindings = -1;
try { gitleaksFindings = JSON.parse(leaks.slice(leaks.indexOf("["))).length; } catch { gitleaksFindings = /no leaks found/.test(sh("gitleaks git . --no-banner 2>&1")) ? 0 : -1; }

sh("pnpm -F web build");
const dist = join(cwd, "web/dist");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const text = walk(dist).filter((f) => /\.(js|html|css|json|svg|txt)$/.test(f));
const found64 = new Set<string>();
let bundleHits = 0, viteVars = new Set<string>(), privateKeyWords = 0;
for (const f of text) {
  const c = readFileSync(f, "utf8");
  if (key && c.includes(key)) bundleHits++;
  for (const m of c.matchAll(/\b0x[0-9a-fA-F]{64}\b/g)) found64.add(m[0].toLowerCase());
  for (const m of c.matchAll(/VITE_[A-Z_]+/g)) viteVars.add(m[0]);
  if (/PRIVATE_KEY/i.test(c)) privateKeyWords++;
}
const publicHashes = new Set(
  ["submission-facts.json", "evidence/tapeouts.json", "evidence/mints.json", "evidence/web-session.json", "evidence/verify.json", "evidence/gas.json"]
    .flatMap((f) => (existsSync(join(cwd, f)) ? [...readFileSync(join(cwd, f), "utf8").matchAll(/0x[0-9a-fA-F]{64}\b/g)].map((m) => m[0].toLowerCase()) : [])),
);
/* Library constants bundled with viem: repeating-nibble ERC-6492 style suffixes and secp256k1 curve parameters. */
const SECP256K1_BETA = "0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee";
const isLibraryConstant = (h: string) => /^0x([0-9a-f]{4})\1{15}$/.test(h) || /^0xf{31}/.test(h) || h === SECP256K1_BETA;
const unexplained64 = [...found64].filter((h) => !publicHashes.has(h) && !isLibraryConstant(h));
const hex64 = found64.size;
const trackedSecrets = sh("git ls-files").split("\n").filter((f) => /(^|\/)\.env$/.test(f) || localOnly.some((d) => f.startsWith(d)));

const result = {
  source: "scripts/audit-secrets.ts", timestamp: new Date().toISOString(),
  commitsScanned: Number(sh("git rev-list --all --count").trim()),
  envOrLocalOnlyInHistory: forbiddenInHistory.length, trackedNow: trackedSecrets.length, localOnlyFoldersIgnored: localOnly.length, deployerKeyValueInHistory: keyInHistory,
  gitleaksFindings, distFilesScanned: text.length, distKeyHits: bundleHits, distHex64Strings: hex64, distHex64Explained: hex64 - unexplained64.length, distHex64Unexplained: unexplained64.length, distViteVars: [...viteVars],
  distFilesMentioningPrivateKey: privateKeyWords, envIgnored: sh("git check-ignore .env").trim() === ".env",
  envFileExists: existsSync(join(cwd, ".env")),
};
writeJson("evidence/audit.json", result);
console.log(result);
const bad = forbiddenInHistory.length || trackedSecrets.length || keyInHistory || gitleaksFindings !== 0 || bundleHits || unexplained64.length || viteVars.size || privateKeyWords;
if (bad || !result.envIgnored) { console.error("SECRET AUDIT FAILED"); process.exit(1); }
console.log("secret audit clean");
