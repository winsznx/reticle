import { mkdirSync, writeFileSync } from "node:fs";
import { allDesignIds, loadDesign } from "./design";
import { readJson, root } from "./lib";

const dir = new URL("web/src/generated/", root);
mkdirSync(dir, { recursive: true });
const put = (name: string, value: unknown) => writeFileSync(new URL(name, dir), JSON.stringify(value, null, 2) + "\n");

put("facts.json", readJson("submission-facts.json", {}));
put("tapeouts.json", readJson("evidence/tapeouts.json", []));
put("verify.json", readJson("evidence/verify.json", null));
put("bench.json", readJson("evidence/bench.json", null));
put("phase0.json", readJson("evidence/phase0.json", null));
put("gas.json", readJson("evidence/gas.json", null));
put("webSession.json", readJson("evidence/web-session.json", null));
put("mints.json", readJson("evidence/mints.json", []));
put("designs.json", allDesignIds().map((id) => loadDesign(id)));
console.log("web data synced");
