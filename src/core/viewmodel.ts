import { EditorLink, editorLinks } from "./links";
import { Model, descendants, label, objects, parents, processes } from "./model";

export type ViewKind = "system" | "structure" | "zoom" | "custom";

export interface ViewInfo {
  /** Key of the view, also used in layout: system, structure, a process id or a custom view id. */
  id: string;
  kind: ViewKind;
  /** OPM diagram code: SD, SB, SD1, SD1.2, or the custom view title. */
  code: string;
  title: string;
  process?: string;
  parent?: string;
}

export interface ViewNode {
  id: string;
  kind: "object" | "process";
  /** The in-zoomed process of a zoom view, drawn as a container. */
  container?: boolean;
  /** Subprocess inside the container, with its position in the order of execution. */
  inside?: string;
  order?: number;
}

export interface ViewEdge {
  /** Unique within the view. */
  id: string;
  link: EditorLink;
  /** Drawn ends; a link of a subprocess is drawn on its visible ancestor. */
  source: string;
  target: string;
}

export interface ViewContent {
  view: ViewInfo;
  nodes: ViewNode[];
  edges: ViewEdge[];
}

const STRUCTURAL = new Set(["aggregation", "exhibition", "generalization", "tagged"]);
const PROCEDURAL_FROM_OBJECT = new Set(["agent", "instrument", "consumption", "effect", "condition", "event"]);

/** The process a procedural link belongs to. */
function linkProcess(l: EditorLink): string | undefined {
  if (l.kind === "result" || l.kind === "invocation") return l.from;
  if (PROCEDURAL_FROM_OBJECT.has(l.kind)) return l.to;
  return undefined;
}

/** The object at the other end of a procedural link. */
function linkObject(l: EditorLink): string | undefined {
  if (l.kind === "result") return l.to;
  if (PROCEDURAL_FROM_OBJECT.has(l.kind)) return l.from;
  return undefined;
}

export function listViews(model: Model): ViewInfo[] {
  const out: ViewInfo[] = [{ id: "system", kind: "system", code: "SD", title: "System" }];
  const hasStructure = editorLinks(model).some((l) => STRUCTURAL.has(l.kind));
  if (hasStructure) out.push({ id: "structure", kind: "structure", code: "SB", title: "Structure" });
  const parentOf = parents(model);
  const procs = processes(model);
  const visited = new Set<string>();
  // a cycle in zoomsInto is a validation error; the visited set keeps the list finite
  const zoomed = (ids: string[]) => ids.filter((id) => procs[id]?.zoomsInto !== undefined && !visited.has(id));
  const walk = (ids: string[], prefix: string, parentView: string) => {
    zoomed(ids).forEach((id, i) => {
      visited.add(id);
      const code = `${prefix}${i + 1}`;
      out.push({ id, kind: "zoom", code, title: label(model, id), process: id, parent: parentView });
      walk(procs[id].zoomsInto ?? [], `${code}.`, id);
    });
  };
  walk(Object.keys(procs).filter((id) => !parentOf.has(id)), "SD", "system");
  for (const [id, v] of Object.entries(model.views ?? {})) {
    if (v.process && procs[v.process]) {
      out.push({ id, kind: "custom", code: v.title ?? id, title: v.title ?? label(model, v.process), process: v.process });
    } else {
      out.push({ id, kind: "custom", code: v.title ?? id, title: v.title ?? id });
    }
  }
  return out;
}

export function findView(model: Model, id: string): ViewInfo | undefined {
  return listViews(model).find((v) => v.id === id);
}

/** Maps a thing to what represents it in a view: itself, a visible ancestor, or nothing. */
function visibleAs(model: Model, id: string, shown: Set<string>): string | undefined {
  const parentOf = parents(model);
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur !== undefined && !shown.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return cur !== undefined && shown.has(cur) ? cur : undefined;
}

function dedupe(edges: ViewEdge[]): ViewEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.link.kind}|${e.source}|${e.target}|${e.link.fromState ?? ""}|${e.link.toState ?? ""}|${e.link.tag ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function viewContent(model: Model, viewId: string): ViewContent | undefined {
  const view = findView(model, viewId);
  if (!view) return undefined;
  const links = editorLinks(model);
  const objs = objects(model);
  const procs = processes(model);
  const layoutKeys = new Set(Object.keys(model.layout?.[viewId] ?? {}));

  if (view.kind === "system") {
    const parentOf = parents(model);
    const top = Object.keys(procs).filter((id) => !parentOf.has(id));
    const shown = new Set<string>(top);
    const edges: ViewEdge[] = [];
    for (const l of links) {
      const p = linkProcess(l);
      if (p === undefined) continue;
      const drawn = visibleAs(model, p, shown);
      if (!drawn) continue;
      if (l.kind === "invocation") {
        const target = visibleAs(model, l.to, shown);
        if (target && target !== drawn) edges.push({ id: l.id, link: l, source: drawn, target });
        continue;
      }
      const o = linkObject(l)!;
      shown.add(o);
      edges.push(l.kind === "result" ? { id: l.id, link: l, source: drawn, target: o } : { id: l.id, link: l, source: o, target: drawn });
    }
    // objects linked to nothing, or placed in this view, stay visible so that a new object does not vanish
    const linked = new Set(links.flatMap((l) => [l.from, l.to]));
    for (const id of Object.keys(objs)) if (!linked.has(id) || layoutKeys.has(id)) shown.add(id);
    for (const l of links) {
      if (STRUCTURAL.has(l.kind) && shown.has(l.from) && shown.has(l.to)) edges.push({ id: l.id, link: l, source: l.from, target: l.to });
    }
    return { view, nodes: nodesOf(model, shown), edges: dedupe(edges) };
  }

  if (view.kind === "structure") {
    const shown = new Set<string>();
    const edges: ViewEdge[] = [];
    for (const l of links) {
      if (!STRUCTURAL.has(l.kind)) continue;
      shown.add(l.from).add(l.to);
      edges.push({ id: l.id, link: l, source: l.from, target: l.to });
    }
    return { view, nodes: nodesOf(model, shown), edges };
  }

  if (view.kind === "zoom" || (view.kind === "custom" && view.process)) {
    const pid = view.process!;
    const subs = procs[pid]?.zoomsInto ?? [];
    const inner = new Set(subs);
    const nodes: ViewNode[] = [{ id: pid, kind: "process", container: true }];
    subs.forEach((s, i) => nodes.push({ id: s, kind: "process", inside: pid, order: i }));
    const shown = new Set<string>([pid, ...subs]);
    // a link of a deeper subprocess is drawn on the subprocess of this level that contains it
    const owner = (p: string): string | undefined => {
      if (p === pid || inner.has(p)) return p;
      for (const s of subs) if (descendants(model, s).includes(p)) return s;
      return undefined;
    };
    const edges: ViewEdge[] = [];
    const outside = new Set<string>();
    for (const l of links) {
      const p = linkProcess(l);
      if (p === undefined) continue;
      const drawn = owner(p);
      if (!drawn) continue;
      if (l.kind === "invocation") {
        const target = owner(l.to) ?? l.to;
        if (!owner(l.to)) outside.add(l.to);
        if (target !== drawn) edges.push({ id: l.id, link: l, source: drawn, target });
        continue;
      }
      const o = linkObject(l)!;
      outside.add(o);
      edges.push(l.kind === "result" ? { id: l.id, link: l, source: drawn, target: o } : { id: l.id, link: l, source: o, target: drawn });
    }
    for (const id of layoutKeys) if (objs[id] && !shown.has(id)) outside.add(id);
    for (const id of outside) if (!shown.has(id)) {
      shown.add(id);
      nodes.push({ id, kind: objs[id] ? "object" : "process" });
    }
    for (const l of links) {
      if (STRUCTURAL.has(l.kind) && shown.has(l.from) && shown.has(l.to) && l.from !== pid && l.to !== pid) {
        edges.push({ id: l.id, link: l, source: l.from, target: l.to });
      }
    }
    return { view, nodes, edges: dedupe(edges) };
  }

  // custom view with a list of things
  const things = (model.views?.[viewId]?.things ?? []).filter((id) => objs[id] || procs[id]);
  const shown = new Set(things);
  const edges: ViewEdge[] = [];
  for (const l of links) if (shown.has(l.from) && shown.has(l.to)) edges.push({ id: l.id, link: l, source: l.from, target: l.to });
  return { view, nodes: nodesOf(model, shown), edges };
}

function nodesOf(model: Model, shown: Set<string>): ViewNode[] {
  const nodes: ViewNode[] = [];
  for (const id of Object.keys(objects(model))) if (shown.has(id)) nodes.push({ id, kind: "object" });
  for (const id of Object.keys(processes(model))) if (shown.has(id)) nodes.push({ id, kind: "process" });
  return nodes;
}

/** Views in which a thing appears, the current one first if it is among them. */
export function viewsContaining(model: Model, id: string, current?: string): string[] {
  const out = listViews(model).map((v) => v.id).filter((v) => viewContent(model, v)?.nodes.some((n) => n.id === id));
  return current && out.includes(current) ? [current, ...out.filter((v) => v !== current)] : out;
}
