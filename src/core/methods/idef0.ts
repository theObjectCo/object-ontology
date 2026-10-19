import { Link, Model, descendants, label, linksOf, processes } from "../model";
import { Entry, cell, entryText, isModule, quote, steps, subtree, topLevel, unique, zoomed } from "./common";

/** A process as an IDEF0 box: inputs on the left, controls on top, outputs on the right, mechanisms below. */
export interface Idef0Box {
  process: string;
  /** Node number: A0 for the process, A1, A2… for its subprocesses. */
  node: string;
  inputs: Entry[];
  controls: Entry[];
  outputs: Entry[];
  mechanisms: Entry[];
}

/** An object that one subprocess gives and a later one takes, as an input or as a control. */
export interface Idef0Arrow {
  from: number;
  to: number;
  object: string;
  role: "input" | "control";
}

export interface Idef0 {
  process: string;
  /** The A-0 diagram: the process alone, with what crosses its boundary. */
  context: Idef0Box;
  /** The A0 diagram: one box per subprocess, in the order of execution. */
  boxes: Idef0Box[];
  arrows: Idef0Arrow[];
}

const entry = (l: Link): Entry => ({
  object: l.target, kind: l.kind,
  ...(l.state ? { state: l.state } : {}), ...(l.from ? { from: l.from } : {}), ...(l.to ? { to: l.to } : {}),
});
const key = (e: Entry) => `${e.kind}|${e.object}|${e.state ?? ""}|${e.from ?? ""}|${e.to ?? ""}`;

/**
 * The ICOM of one process. An object that the process affects or changes is both an input and an output. A
 * process with subprocesses carries their links, as in OPM; an object that one subprocess yields stops being
 * an input or a control of the whole, and one that a subprocess yields and another consumes is not an output
 * either.
 */
export function icom(model: Model, id: string, node = "A0"): Idef0Box {
  const procs = processes(model);
  const inner = [...subtree(model, id)].filter((p) => procs[p]);
  const below = new Set(descendants(model, id));
  const links = inner.flatMap((p) => linksOf(p, procs[p]));
  const madeInside = new Set(links.filter((l) => below.has(l.process) && l.kind === "yields").map((l) => l.target));
  const usedUpInside = new Set(links.filter((l) => below.has(l.process) && l.kind === "consumes").map((l) => l.target));

  const consumed = links.filter((l) => l.kind === "consumes" && !madeInside.has(l.target));
  const required = links.filter((l) => l.kind === "requires" && !isModule(model, l.target) && !madeInside.has(l.target));
  const consumedKeys = new Set(consumed.map((l) => `${l.target}|${l.state ?? ""}`));
  // an affected or changed object comes in as well as going out; a change names the state it comes in
  const transformed = links.filter((l) => (l.kind === "affects" || l.kind === "changes") && !madeInside.has(l.target))
    .map((l): Entry => ({ object: l.target, kind: l.kind, ...(l.from ? { state: l.from } : {}) }));
  const inputs = unique([
    ...consumed.map(entry),
    ...required.filter((l) => !consumedKeys.has(`${l.target}|${l.state ?? ""}`)).map((l): Entry => ({ ...entry(l), kept: true })),
    ...transformed,
  ], key);
  const controls = unique(links.filter((l) => (l.kind === "conditions" || l.kind === "events") && !madeInside.has(l.target)).map(entry), key);
  const outputs = unique(links.filter((l) =>
    (l.kind === "yields" && !(below.has(l.process) && usedUpInside.has(l.target))) || l.kind === "changes" || l.kind === "affects",
  ).map(entry), key);
  const mechanisms = unique(links.filter((l) => l.kind === "handledBy" || (l.kind === "requires" && isModule(model, l.target))).map(entry), (e) => e.object);
  return { process: id, node, inputs, controls, outputs, mechanisms };
}

/** The A-0 box of a process and, when it has subprocesses, the A0 decomposition with the arrows between them. */
export function idef0(model: Model, id: string): Idef0 {
  const boxes = steps(model, id).map((s, i) => icom(model, s, `A${i + 1}`));
  const arrows: Idef0Arrow[] = [];
  boxes.forEach((a, i) => {
    const given = new Set(a.outputs.map((e) => e.object));
    boxes.slice(i + 1).forEach((b, k) => {
      // an object that is both transformed and a condition enters as a control: it decides whether the box runs
      const controls = new Set(b.controls.map((e) => e.object));
      for (const object of unique([...b.inputs, ...b.controls].map((e) => e.object))) {
        if (given.has(object)) arrows.push({ from: i, to: i + 1 + k, object, role: controls.has(object) ? "control" : "input" });
      }
    });
  });
  return { process: id, context: icom(model, id), boxes, arrows };
}

/** Processes that get their own IDEF0 section: the top-level ones and every other one with subprocesses. */
export function idef0Processes(model: Model): string[] {
  const top = topLevel(model);
  return [...top, ...zoomed(model).filter((id) => !top.includes(id))];
}

/** The decomposition as a Mermaid flowchart: input arrows solid, control arrows dotted. */
export function idef0Mermaid(model: Model, d: Idef0): string {
  const lines = ["flowchart LR"];
  d.boxes.forEach((b, i) => lines.push(`  b${i}[${quote(`${b.node} · ${label(model, b.process)}`)}]`));
  const grouped = new Map<string, string[]>();
  for (const a of d.arrows) {
    const k = `${a.from}|${a.to}|${a.role}`;
    grouped.set(k, [...(grouped.get(k) ?? []), label(model, a.object)]);
  }
  for (const [k, names] of grouped) {
    const [from, to, role] = k.split("|");
    lines.push(`  b${from} ${role === "control" ? "-.->" : "-->"}|${quote(names.join(", "))}| b${to}`);
  }
  // boxes that exchange nothing keep their order
  for (let i = 1; i < d.boxes.length; i++) {
    if (!d.arrows.some((a) => a.from === i - 1 && a.to === i)) lines.push(`  b${i - 1} ~~~ b${i}`);
  }
  return lines.join("\n");
}

/** One markdown section of a process: the ICOM table of its box and its subprocesses, and the decomposition. */
export function idef0Section(model: Model, id: string): string[] {
  const d = idef0(model, id);
  const L = (e: Entry) => entryText(model, e);
  const out = [`### A-0 ${label(model, id)}`, "", "| Node | Process | Inputs | Controls | Outputs | Mechanisms |", "|---|---|---|---|---|---|"];
  for (const b of [d.context, ...d.boxes]) {
    out.push(`| ${b.node} | ${label(model, b.process)} | ${cell(b.inputs.map(L))} | ${cell(b.controls.map(L))} | ${cell(b.outputs.map(L))} | ${cell(b.mechanisms.map(L))} |`);
  }
  out.push("");
  if (d.boxes.length) out.push(`A0 decomposition of ${label(model, id)}:`, "", "```mermaid", idef0Mermaid(model, d), "```", "");
  return out;
}

export function idef0Markdown(model: Model, ids = idef0Processes(model)): string[] {
  if (!ids.length) return [];
  return [
    "## IDEF0",
    "",
    "Inputs are the objects a process consumes, requires, changes or affects, controls its conditions and events, outputs what it yields, changes or affects, and mechanisms the modules it requires and the agents that handle it.",
    "",
    ...ids.flatMap((id) => idef0Section(model, id)),
  ];
}
