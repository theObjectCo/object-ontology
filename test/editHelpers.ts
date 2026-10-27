import * as fs from "fs";
import { Operation, applyOperation } from "../src/core/edit";
import { Model } from "../src/core/model";
import { validate } from "../src/core/validate";

export const run = (text: string, op: Operation) => applyOperation(text, op).text;
/** The example model without its layout, which changes whenever the example is edited in the diagram editor. */
export const EXAMPLE = Object.keys((JSON.parse(fs.readFileSync("examples/window-pricing/model.opm.json", "utf-8")) as Model).layout ?? {})
  .reduce((text, viewId) => run(text, { op: "setLayout", viewId, positions: null }), fs.readFileSync("examples/window-pricing/model.opm.json", "utf-8"));
export const parse = (text: string) => JSON.parse(text) as Model;
export const errors = (text: string) => validate(parse(text)).filter((d) => d.severity === "error").map((d) => d.code);
/** Lines that differ between two texts, as a rough measure of the diff. */
export const changedLines = (a: string, b: string) => {
  const la = a.split("\n"), lb = b.split("\n");
  const common = new Set(la);
  return lb.filter((l) => !common.has(l)).length + la.filter((l) => !new Set(lb).has(l)).length;
};
