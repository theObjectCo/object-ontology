import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Model } from "../src/core/model";
import { callTool } from "../src/mcp/tools";

/** A fresh copy of the example model, with its JSON Schema file beside it, in its own temp folder. */
export function copy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "opm-mcp-"));
  for (const f of ["model.opm.json", "contracts.schema.json"]) fs.copyFileSync(path.join("examples/window-pricing", f), path.join(dir, f));
  return path.join(dir, "model.opm.json");
}

export const text = (name: string, args: Record<string, unknown>) => {
  const r = callTool(name, args);
  assert.ok(!r.isError, `${name} failed: ${r.content[0].text}`);
  return r.content[0].text;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const json = (name: string, args: Record<string, unknown>): any => JSON.parse(text(name, args));
export const refused = (name: string, args: Record<string, unknown>) => {
  const r = callTool(name, args);
  assert.equal(r.isError, true, `${name} should be refused, got: ${r.content[0].text.slice(0, 200)}`);
  return r.content[0].text;
};
export const model = (file: string) => JSON.parse(fs.readFileSync(file, "utf-8")) as Model;
export const changedLines = (a: string, b: string) => {
  const la = new Set(a.split("\n")), lb = new Set(b.split("\n"));
  return [...lb].filter((l) => !la.has(l)).length + [...la].filter((l) => !lb.has(l)).length;
};
