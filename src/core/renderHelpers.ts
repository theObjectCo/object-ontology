import {
  Link, Model, affiliation, descendants, label, linksOf, objects, processes, refIds, refObject,
} from "./model";

export const STYLE = [
  "  classDef object fill:transparent,stroke:#2e7d32,stroke-width:2px",
  "  classDef module fill:transparent,stroke:#2e7d32,stroke-width:4px",
  "  classDef process fill:transparent,stroke:#1565c0,stroke-width:2px",
  "  classDef environmental stroke-dasharray:6 4",
];

export const nodeId = (model: Model, id: string) => (id in objects(model) ? `o_${id}` : `p_${id}`);
export const quote = (text: string) => `"${text.replace(/"/g, "#quot;")}"`;

export function objectNode(model: Model, id: string): string {
  const o = objects(model)[id];
  const states = o?.states?.length ? `<br/><i>${o.states.join(" · ")}</i>` : "";
  return `  o_${id}[${quote(label(model, id) + states)}]:::${o?.role === "module" ? "module" : "object"}`;
}

export function processNode(model: Model, id: string, prefix = ""): string {
  return `  p_${id}([${quote(prefix + label(model, id))}]):::process`;
}

export function edge(model: Model, link: Link, processNodeId: string): string[] {
  const o = nodeId(model, link.target);
  switch (link.kind) {
    case "consumes": return [link.state ? `  ${o} -->|${quote(link.state)}| ${processNodeId}` : `  ${o} --> ${processNodeId}`];
    case "yields": return [link.state ? `  ${processNodeId} -->|${quote(link.state)}| ${o}` : `  ${processNodeId} --> ${o}`];
    case "affects": return [`  ${o} <--> ${processNodeId}`];
    case "requires": return [link.state ? `  ${o} --o|${quote(link.state)}| ${processNodeId}` : `  ${o} --o ${processNodeId}`];
    case "handledBy": return [`  ${o} --o|agent| ${processNodeId}`];
    case "changes": return [
      ...(link.from ? [`  ${o} -->|${quote(link.from)}| ${processNodeId}`] : []),
      `  ${processNodeId} -->|${quote(link.to ?? "")}| ${o}`,
    ];
    case "conditions": return [`  ${o} -.->|${quote(link.state ? `c: ${link.state}` : "c")}| ${processNodeId}`];
    case "events": return [`  ${o} -.->|${quote(link.state ? `e: ${link.state}` : "e")}| ${processNodeId}`];
    case "invokes": return [`  ${processNodeId} -.->|invokes| ${nodeId(model, link.target)}`];
  }
}

export function structuralEdges(model: Model, include: Set<string>): string[] {
  const out: string[] = [];
  for (const [id, o] of Object.entries(objects(model))) {
    if (!include.has(id)) continue;
    for (const part of refIds(o.consistsOf)) if (include.has(part)) out.push(`  o_${id} ---|consists of| o_${part}`);
    for (const attr of refIds(o.exhibits)) if (include.has(attr)) out.push(`  o_${id} ---|exhibits| o_${attr}`);
    if (o.isA && include.has(refObject(o.isA))) out.push(`  o_${id} ---|is a| o_${refObject(o.isA)}`);
    for (const t of o.tagged ?? []) if (include.has(t.object)) out.push(`  o_${id} -->|${quote(t.tag)}| o_${t.object}`);
  }
  for (const [id, p] of Object.entries(processes(model))) {
    if (!include.has(id)) continue;
    for (const part of refIds(p.consistsOf)) if (include.has(part)) out.push(`  p_${id} ---|consists of| p_${part}`);
    if (p.isA && include.has(refObject(p.isA))) out.push(`  p_${id} ---|is a| p_${refObject(p.isA)}`);
  }
  return out;
}

/** Links of a process together with the links of its subprocesses, which OPM migrates to the parent. */
export function migratedLinks(model: Model, id: string): Link[] {
  const procs = processes(model);
  const seen = new Set<string>();
  const inner = new Set([id, ...descendants(model, id)]);
  const out: Link[] = [];
  for (const pid of inner) {
    for (const l of linksOf(pid, procs[pid] ?? {})) {
      if (l.kind === "invokes" && inner.has(l.target)) continue;
      const key = `${l.kind}|${l.target}|${l.from ?? ""}|${l.to ?? ""}|${l.state ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...l, process: id });
    }
  }
  return out;
}

export function finish(model: Model, lines: string[], shown: Set<string>): string {
  const env = [
    ...Object.keys(objects(model)).filter((id) => shown.has(id) && affiliation(objects(model)[id]) === "environmental").map((id) => `o_${id}`),
    ...Object.keys(processes(model)).filter((id) => shown.has(id) && affiliation(processes(model)[id]) === "environmental").map((id) => `p_${id}`),
  ];
  if (env.length) lines.push(`  class ${env.join(",")} environmental`);
  return ["flowchart LR", ...STYLE, ...lines].join("\n");
}

/** Text for a Markdown table cell: pipes escaped, line breaks kept as <br>. */
export const tableCell = (text: string) => text.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
