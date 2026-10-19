import { Model, processes } from "../model";
import { markdown } from "../render";
import { METHODS, MethodId, topLevel, zoomed } from "./common";
import { dsmMarkdown } from "./dsm";
import { flowMarkdown } from "./flow";
import { idef0Markdown, idef0Processes } from "./idef0";
import { sipocMarkdown } from "./sipoc";

export { METHODS };
export type { MethodId };

/**
 * The processes a method can be shown for: IDEF0 for every process, the top-level and zoomed ones first; SIPOC
 * for the top-level ones; the flow for the zoomed ones. The matrix covers the whole model and has none.
 */
export function methodProcesses(model: Model, id: MethodId): string[] {
  if (id === "idef0") {
    const first = idef0Processes(model);
    return [...first, ...Object.keys(processes(model)).filter((p) => !first.includes(p))];
  }
  if (id === "sipoc") return topLevel(model);
  if (id === "flow") return zoomed(model);
  return [];
}

/** Reads a comma-separated list such as "idef0,dsm"; "none" gives an empty list and "all" every method. */
export function parseMethods(text: string): MethodId[] {
  if (text === "none") return [];
  if (text === "all") return [...METHODS];
  const ids = text.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !(METHODS as string[]).includes(id));
  if (unknown.length) throw new Error(`Unknown method: ${unknown.join(", ")}. Known: ${METHODS.join(", ")}.`);
  return METHODS.filter((m) => ids.includes(m));
}

/** The sections of the chosen methods, in the order of METHODS. */
export function methodsMarkdown(model: Model, methods: MethodId[] = METHODS): string {
  const parts: string[] = [];
  if (methods.includes("idef0")) parts.push(...idef0Markdown(model));
  if (methods.includes("sipoc")) parts.push(...sipocMarkdown(model));
  if (methods.includes("dsm")) parts.push(...dsmMarkdown(model));
  if (methods.includes("flow")) parts.push(...flowMarkdown(model));
  return parts.join("\n");
}

/** The markdown export: the OPM document followed by the sections of the chosen methods. */
export function documentWithMethods(model: Model, methods: MethodId[] = METHODS): string {
  const extra = methodsMarkdown(model, methods);
  return extra ? `${markdown(model)}\n${extra}` : markdown(model);
}
