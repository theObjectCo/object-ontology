import { Link, Model, affiliation, label, linksOf, objects, processes, refIds } from "../model";
import { Entry, GIVES, USES, cell, entryText, steps, subtree, topLevel, unique } from "./common";
import { icom } from "./idef0";

/**
 * Who stands at either end of a process: another process, an agent that handles it, an environmental object,
 * or nobody in the model.
 */
export type Party =
  | { kind: "process" | "agent" | "environment"; id: string }
  | { kind: "outside" };

export interface Sipoc {
  process: string;
  /** The subprocesses in the order of execution; empty for a process without a zoom. */
  steps: string[];
  inputs: { entry: Entry; suppliers: Party[] }[];
  outputs: { entry: Entry; customers: Party[] }[];
}

const partyKey = (p: Party) => (p.kind === "outside" ? "outside" : `${p.kind}|${p.id}`);

/** The environmental whole an environmental object belongs to, or the object itself. */
function environmentOf(model: Model, id: string): string {
  for (const [whole, o] of Object.entries(objects(model))) {
    if (affiliation(o) === "environmental" && refIds(o.consistsOf).includes(id)) return whole;
  }
  return id;
}

/**
 * SIPOC of a process. Inputs are the inputs and controls of its IDEF0 box; their suppliers are the processes
 * outside it that yield, change or affect the object, else the environment for an environmental object, else
 * nobody. Outputs are the outputs of the box; their customers are the processes outside it that use the
 * object, with the agents that handle those processes. A link to another state than the one the object is in
 * neither supplies nor uses it.
 */
export function sipoc(model: Model, id: string): Sipoc {
  const box = icom(model, id);
  const inner = subtree(model, id);
  const outside = Object.entries(processes(model)).filter(([pid]) => !inner.has(pid));
  const inputs = unique([...box.inputs, ...box.controls], (e) => `${e.object}|${e.state ?? ""}`).map((entry) => {
    // a process that leaves the object in another state than the one asked for supplies nothing
    const gives = (l: Link) => GIVES.has(l.kind) && l.target === entry.object && !(entry.state && (l.to ?? l.state ?? entry.state) !== entry.state);
    const suppliers: Party[] = outside
      .filter(([pid, p]) => linksOf(pid, p).some(gives))
      .map(([pid]) => ({ kind: "process", id: pid }));
    if (!suppliers.length && affiliation(objects(model)[entry.object] ?? {}) === "environmental") {
      suppliers.push({ kind: "environment", id: environmentOf(model, entry.object) });
    }
    return { entry, suppliers: suppliers.length ? suppliers : [{ kind: "outside" } as Party] };
  });
  const outputs = box.outputs.map((entry) => {
    const state = entry.to ?? entry.state;
    const uses = (l: Link) => USES.has(l.kind) && l.target === entry.object && !(state && (l.state ?? l.from ?? state) !== state);
    const users = outside.filter(([pid, p]) => linksOf(pid, p).some(uses));
    const customers = unique<Party>([
      ...users.map(([pid]): Party => ({ kind: "process", id: pid })),
      ...users.flatMap(([, p]) => refIds(p.handledBy)).map((a): Party => ({ kind: "agent", id: a })),
    ], partyKey);
    return { entry, customers: customers.length ? customers : [{ kind: "outside" } as Party] };
  });
  return { process: id, steps: steps(model, id), inputs, outputs };
}

export function partyText(model: Model, p: Party): string {
  return p.kind === "outside" ? "outside the model" : p.kind === "environment" ? `${label(model, p.id)} (environment)` : label(model, p.id);
}

/** The classic five columns, one input, step and output per row. */
export function sipocSection(model: Model, id: string): string[] {
  const s = sipoc(model, id);
  const stepTexts = s.steps.length ? s.steps.map((p, i) => `${i + 1}. ${label(model, p)}`) : [label(model, id)];
  const rows = Math.max(s.inputs.length, s.outputs.length, stepTexts.length);
  const out = [`### ${label(model, id)}`, "", "| Suppliers | Inputs | Process | Outputs | Customers |", "|---|---|---|---|---|"];
  for (let i = 0; i < rows; i++) {
    const input = s.inputs[i];
    const output = s.outputs[i];
    const parts = (list: Party[] | undefined) => (list ? cell(list.map((p) => partyText(model, p))) : "");
    out.push(`| ${parts(input?.suppliers)} | ${input ? cell([entryText(model, input.entry)]) : ""} | ${stepTexts[i] ?? ""} | ${output ? cell([entryText(model, output.entry)]) : ""} | ${parts(output?.customers)} |`);
  }
  out.push("");
  return out;
}

export function sipocMarkdown(model: Model, ids = topLevel(model)): string[] {
  if (!ids.length) return [];
  return [
    "## SIPOC",
    "",
    "One table per top-level process. Suppliers are the processes that yield, change or affect an input, customers the processes that use an output and the agents that handle them.",
    "",
    ...ids.flatMap((id) => sipocSection(model, id)),
  ];
}
