// Exercise the public CLI for every example, including generated documentation.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist/cli.js");
function modelsIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? modelsIn(path) : entry.name.endsWith(".opm.json") ? [path] : [];
  }).sort();
}
const models = modelsIn(join(root, "examples"));
if (!models.length) throw new Error("No example models found");
const scratch = mkdtempSync(join(tmpdir(), "opm-examples-"));
for (const [index, model] of models.entries()) {
  const output = join(scratch, `${index}.md`);
  for (const args of [["validate", model], ["render", model, "-o", output]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  const rendered = readFileSync(output);
  if (!rendered.length) throw new Error(`Empty rendered document: ${model}`);
  const committed = model.replace(/\.opm\.json$/, ".md");
  if (existsSync(committed) && !rendered.equals(readFileSync(committed))) {
    throw new Error(`Stale generated document: ${committed}. Regenerate with opm render. Comparison: ${output}`);
  }
}
console.log(`Validated and rendered ${models.length} examples; committed generated documents match.`);
