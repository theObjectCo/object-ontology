import { thingKind } from "../../core/links";
import { Model, label, objects, processes } from "../../core/model";
import { stories } from "../../core/stories";
import { Json, ToolError } from "./contracts";

// ---------------------------------------------------------------- arguments

export function str(args: Json, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

export function need(args: Json, key: string, what: string): string {
  const v = str(args, key);
  if (!v) throw new ToolError(`"${key}" is required: ${what}.`);
  return v;
}

export function thingOrFail(model: Model, id: string, expected?: "object" | "process"): "object" | "process" {
  const kind = thingKind(model, id);
  if (!kind) throw new ToolError(`No object or process "${id}" in the model.${didYouMean(model, id)}`);
  if (expected && kind !== expected) throw new ToolError(`"${id}" is ${kind === "object" ? "an object" : "a process"}; ${expected === "object" ? "an object" : "a process"} is needed here.`);
  return kind;
}

/** " Did you mean: a, b?" for identifiers or labels that contain the given text, ignoring case. */
export function didYouMean(model: Model, id: string): string {
  const needle = id.toLowerCase();
  const all = [...Object.keys(objects(model)), ...Object.keys(processes(model)), ...Object.keys(stories(model)), ...Object.keys(model.views ?? {})];
  const hits = all.filter((x) => x.toLowerCase().includes(needle) || needle.includes(x.toLowerCase()) || label(model, x).toLowerCase().includes(needle));
  return hits.length ? ` Did you mean: ${hits.slice(0, 8).join(", ")}?` : "";
}

export function checkState(model: Model, object: string, state: string) {
  const states = objects(model)[object]?.states ?? [];
  if (!states.includes(state)) {
    throw new ToolError(`${object} has no state "${state}". ${states.length ? `Its states are: ${states.join(", ")}.` : "It has no states; add them with opm_set first."}`);
  }
}

export const ID = /^[a-z][A-Za-z0-9]*$/;

export function checkNewId(model: Model, id: string) {
  if (!ID.test(id)) throw new ToolError(`"${id}" is not a valid identifier: use camelCase starting with a lowercase letter, for example priceResult.`);
  const taken = new Set([...Object.keys(objects(model)), ...Object.keys(processes(model)), ...Object.keys(model.views ?? {}), "system", "structure"]);
  if (taken.has(id)) throw new ToolError(`"${id}" is already used in this model.`);
}
