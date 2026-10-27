import {
  Link, Model, ProcessDef, label, linksOf, objects, parents, processes, refIds, refObject,
} from "./model";
import { oplSentences, sentenceText } from "./opl";
import { edge, finish, migratedLinks, objectNode, processNode, quote, structuralEdges, tableCell } from "./renderHelpers";
import { stories, storyTitle } from "./stories";

export interface View {
  id: string;
  title: string;
  description?: string;
  mermaid: string;
}

/** Top-level processes with the links of their subprocesses, and the objects they link to. */
export function systemView(model: Model): View {
  const parentOf = parents(model);
  const top = Object.keys(processes(model)).filter((id) => !parentOf.has(id));
  const links = top.flatMap((id) => migratedLinks(model, id)).filter((l) => l.kind !== "invokes" || top.includes(l.target));
  // objects without process links, such as parts and attributes, appear in the structure view
  const shown = new Set<string>([...top, ...links.map((l) => l.target)]);
  const lines: string[] = [];
  for (const id of Object.keys(objects(model))) if (shown.has(id)) lines.push(objectNode(model, id));
  for (const id of top) lines.push(processNode(model, id));
  for (const l of links) lines.push(...edge(model, l, `p_${l.process}`));
  return { id: "system", title: `${model.name ?? "System"}: system view`, mermaid: finish(model, lines, shown) };
}

/** Objects with their parts, attributes and generalizations; undefined if the model has none. */
export function structureView(model: Model): View | undefined {
  const involved = new Set<string>();
  for (const [id, o] of Object.entries(objects(model))) {
    const related = [...refIds(o.consistsOf), ...refIds(o.exhibits), ...(o.isA ? [refObject(o.isA)] : [])];
    if (related.length) [id, ...related].forEach((x) => involved.add(x));
  }
  if (!involved.size) return undefined;
  const lines = [...involved].filter((id) => id in objects(model)).map((id) => objectNode(model, id));
  lines.push(...structuralEdges(model, involved));
  return { id: "structure", title: "Structure", mermaid: finish(model, lines, involved) };
}

/** One process, its links and its subprocesses in order of execution. */
export function processView(model: Model, id: string, title?: string, description?: string): View {
  const p = processes(model)[id] ?? {};
  const subs = p.zoomsInto ?? [];
  const shown = new Set<string>([id, ...subs]);
  const lines: string[] = [];
  const links: [Link, string][] = linksOf(id, p).map((l) => [l, `p_${id}`]);
  if (subs.length) {
    lines.push(`  subgraph p_${id}[${quote(label(model, id))}]`, "    direction TB");
    // Mermaid ignores the direction of a subgraph linked to outside nodes, so the order is numbered
    subs.forEach((sub, i) => lines.push("  " + processNode(model, sub, `${i + 1} · `)));
    for (let i = 1; i < subs.length; i++) lines.push(`    p_${subs[i - 1]} ~~~ p_${subs[i]}`);
    lines.push("  end", `  class p_${id} process`);
    for (const sub of subs) for (const l of migratedLinks(model, sub)) links.push([l, `p_${sub}`]);
  } else lines.push(processNode(model, id));
  for (const [l] of links) if (l.target in objects(model) || l.kind === "invokes") shown.add(l.target);
  for (const target of [...shown]) {
    if (target in objects(model)) lines.push(objectNode(model, target));
    else if (!subs.includes(target) && target !== id) lines.push(processNode(model, target));
  }
  for (const [l, from] of links) lines.push(...edge(model, l, from));
  lines.push(...structuralEdges(model, shown));
  return { id, title: title ?? label(model, id), description, mermaid: finish(model, lines, shown) };
}

/** Listed objects and processes and the links between them. */
export function thingsView(model: Model, id: string, things: string[], title?: string, description?: string): View {
  const shown = new Set(things);
  const lines: string[] = [];
  for (const t of things) {
    if (t in objects(model)) lines.push(objectNode(model, t));
    else if (t in processes(model)) lines.push(processNode(model, t));
  }
  for (const t of things) {
    const p = processes(model)[t];
    if (!p) continue;
    for (const l of linksOf(t, p)) if (shown.has(l.target)) lines.push(...edge(model, l, `p_${t}`));
  }
  lines.push(...structuralEdges(model, shown));
  return { id, title: title ?? humanTitle(id), description, mermaid: finish(model, lines, shown) };
}

const humanTitle = (id: string) => id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** The system view, a view for every in-zoomed process, and the views listed in the model. */
export function views(model: Model): View[] {
  const structure = structureView(model);
  const out = structure ? [systemView(model), structure] : [systemView(model)];
  for (const [id, p] of Object.entries(processes(model))) if (p.zoomsInto?.length) out.push(processView(model, id));
  for (const [id, v] of Object.entries(model.views ?? {})) {
    if (v.process) out.push(processView(model, v.process, v.title, v.description));
    else if (v.things) out.push(thingsView(model, id, v.things, v.title, v.description));
  }
  return out;
}

/** A state diagram for every object with states; transitions come from changes links. */
export function stateDiagrams(model: Model): View[] {
  const out: View[] = [];
  for (const [id, o] of Object.entries(objects(model))) {
    if (!o.states?.length) continue;
    const sid = (s: string) => `s${o.states!.indexOf(s)}`;
    const lines = ["stateDiagram-v2", "  direction LR"];
    o.states.forEach((s, i) => lines.push(`  state ${quote(s)} as s${i}`));
    for (const [pid, p] of Object.entries(processes(model))) {
      for (const c of p.changes ?? []) {
        if (c.object !== id || !o.states.includes(c.to)) continue;
        const from = c.from && o.states.includes(c.from) ? sid(c.from) : "[*]";
        lines.push(`  ${from} --> ${sid(c.to)} : ${label(model, pid)}`);
      }
    }
    out.push({ id: `states-${id}`, title: label(model, id), mermaid: lines.join("\n") });
  }
  return out;
}

/** OPL sentences as plain text, the same as in the editor. */
export function opl(model: Model): string[] {
  return oplSentences(model).map(sentenceText);
}

export interface ModuleSummary {
  module: string;
  performs: string[];
  takes: string[];
  gives: string[];
  changes: string[];
  deploymentName?: string;
  capabilities?: string[];
  owns?: string[];
}

/** What each module takes part in, derived from the processes that require it. */
export function moduleSummaries(model: Model): ModuleSummary[] {
  const out: ModuleSummary[] = [];
  const objs = objects(model);
  const procs = processes(model);
  for (const [id, o] of Object.entries(objs)) {
    if (o.role !== "module") continue;
    const performs = Object.keys(procs).filter((pid) => procs[pid].requires?.some((r) => refObject(r) === id));
    const collect = (pick: (p: ProcessDef) => string[]) =>
      [...new Set(performs.flatMap((pid) => pick(procs[pid])))].filter((x) => x !== id && objs[x]?.role !== "module");
    const gives = collect((p) => (p.yields ?? []).map(refObject));
    const changes = collect((p) => [...refIds(p.affects), ...(p.changes ?? []).map((c) => c.object)]);
    const caps = [...new Set([
      ...(o.capabilities ?? []),
      ...performs.map((pid) => procs[pid].capability).filter((c): c is string => !!c),
    ])];
    const owns = [...new Set([
      ...(o.owns ?? []),
      ...[...gives, ...changes].map((oid) => objs[oid]?.authority).filter((a): a is string => !!a),
    ])];
    out.push({
      module: id,
      performs,
      takes: collect((p) => [...(p.consumes ?? []), ...(p.requires ?? [])].map(refObject)),
      gives,
      changes,
      ...(o.deploymentName ? { deploymentName: o.deploymentName } : {}),
      ...(caps.length ? { capabilities: caps } : {}),
      ...(owns.length ? { owns } : {}),
    });
  }
  return out;
}

/**
 * One user story as a makigami table: a column per lane in the given order, then the hand-over, the wait
 * and the problem; a row per step. A problem is marked with a red square, the red card of a makigami.
 */
export function storyMarkdown(model: Model, id: string): string[] {
  const s = stories(model)[id];
  const L = (x: string) => tableCell(label(model, x));
  const lanes = s.lanes ?? [];
  const out = [`### ${storyTitle(id, s)}`, "", s.story, ""];
  out.push(`| ${[...lanes.map(L), "Hands over", "Waits", "Problem"].join(" | ")} |`, `|${"---|".repeat(lanes.length + 3)}`);
  for (const st of s.steps ?? []) {
    const does = tableCell(st.does) + (st.process ? ` *(${L(st.process)})*` : "");
    const h = st.handsOver;
    const handsOver = h ? `${L(h.object)}${h.state ? ` (${tableCell(h.state)})` : ""} → ${L(h.to)}` : "";
    const row = [...lanes.map((lane) => (lane === st.lane ? does : "")), handsOver, st.waits ? tableCell(st.waits) : "", st.problem ? `🟥 ${tableCell(st.problem)}` : ""];
    out.push(`| ${row.join(" | ")} |`);
  }
  out.push("");
  if (s.doneWhen?.length) out.push("Done when:", "", ...s.doneWhen.map((d) => `- ${d}`), "");
  return out;
}

/** A markdown document with every view, the state diagrams, the module summary, the OPL text and the user stories. */
export function markdown(model: Model): string {
  const L = (id: string) => label(model, id);
  const parts: string[] = [`# ${model.name ?? "OPM model"}`, ""];
  if (model.description) parts.push(model.description, "");
  parts.push("Generated from the OPM model. Edit the model file, not this document.", "");
  for (const v of views(model)) {
    parts.push(`## ${v.title}`, "");
    if (v.description) parts.push(v.description, "");
    parts.push("```mermaid", v.mermaid, "```", "");
  }
  const modules = moduleSummaries(model);
  if (modules.length) {
    const hasP28 = modules.some((m) => m.deploymentName || m.capabilities?.length || m.owns?.length);
    const cell = (ids: string[]) => ids.map(L).join(", ") || "none";
    const codeList = (items?: string[]) => items?.length ? items.map((x) => `\`${x}\``).join(", ") : "none";
    if (hasP28) {
      parts.push("## Modules", "", "| Module | Deployment | Capabilities | Owns | Performs | Takes | Gives | Changes |", "|---|---|---|---|---|---|---|---|");
      for (const m of modules) {
        parts.push(`| ${L(m.module)} | ${m.deploymentName ? `\`${m.deploymentName}\`` : "none"} | ${codeList(m.capabilities)} | ${codeList(m.owns)} | ${cell(m.performs)} | ${cell(m.takes)} | ${cell(m.gives)} | ${cell(m.changes)} |`);
      }
    } else {
      parts.push("## Modules", "", "| Module | Performs | Takes | Gives | Changes |", "|---|---|---|---|---|");
      for (const m of modules) parts.push(`| ${L(m.module)} | ${cell(m.performs)} | ${cell(m.takes)} | ${cell(m.gives)} | ${cell(m.changes)} |`);
    }
    parts.push("");
  }
  const states = stateDiagrams(model);
  if (states.length) {
    parts.push("## Object states", "");
    for (const s of states) parts.push(`### ${s.title}`, "", "```mermaid", s.mermaid, "```", "");
  }
  parts.push("## OPL", "", ...opl(model).map((s) => `- ${s}`), "");
  const ids = Object.keys(stories(model));
  if (ids.length) {
    parts.push("## User stories", "");
    for (const id of ids) parts.push(...storyMarkdown(model, id));
  }
  return parts.join("\n");
}
