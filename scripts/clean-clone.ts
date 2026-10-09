import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root, writeJson } from "./lib";

/* Clones the committed tree only, so anything that depends on an untracked file fails here. */
const dir = mkdtempSync(join(tmpdir(), "reticle-clone-"));
const run = (cmd: string, cwd = dir) => execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const head = run("git rev-parse HEAD", root.pathname).trim();
run(`git clone -q ${root.pathname} ${dir}/repo`, tmpdir());
const repo = join(dir, "repo");
const steps: Record<string, unknown> = { commit: head };
try {
  run("pnpm install --frozen-lockfile", repo);
  steps.install = "ok";
  const t = run("pnpm test", repo);
  const counts = [...t.matchAll(/Tests\s+(\d+) passed/g)].map((m) => Number(m[1]));
  steps.tests = { passed: counts.reduce((a, b) => a + b, 0), perPackage: counts, failed: /failed/.test(t.replace(/0 failed/g, "")) };
  run("pnpm -F web exec tsc --noEmit", repo);
  const b = run("pnpm -F web build", repo);
  steps.build = /built in/.test(b) ? "ok" : "unknown";
  steps.localOnlyPresent = run("ls", repo).split("\n").some((d) => d === ["inter", "nal"].join(""));
  steps.envPresent = run("ls -a", repo).split("\n").includes(".env");
  steps.passed = true;
} catch (e) {
  steps.passed = false;
  steps.error = String((e as { stderr?: string }).stderr ?? e).slice(0, 600);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
writeJson("evidence/clean-clone.json", { source: "scripts/clean-clone.ts", timestamp: new Date().toISOString(), ...steps });
console.log(steps);
if (!steps.passed) process.exit(1);
