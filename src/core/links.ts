import { Model, objects, processes, refNote, refObject, refState } from "./model";

/** Link kinds as the editor presents them; each maps to one field of the model. */
export type EditorLinkKind =
  | "agent" | "instrument" | "consumption" | "result" | "effect"
  | "condition" | "event" | "invocation"
  | "aggregation" | "exhibition" | "generalization" | "tagged";

export type ThingKind = "object" | "process";

export interface EditorLink {
  /** JSON path of the entry, joined with "/"; unique within one version of the file. */
  id: string;
  kind: EditorLinkKind;
  from: string;
  to: string;
  fromState?: string;
  toState?: string;
  tag?: string;
  note?: string;
  path: (string | number)[];
}

/** Allowed link kinds for each ordered pair of thing kinds (specification, section 6). */
export const ALLOWED: Record<`${ThingKind}>${ThingKind}`, EditorLinkKind[]> = {
  "object>process": ["instrument", "consumption", "agent", "condition", "event", "effect"],
  "process>object": ["result", "effect"],
  "object>object": ["aggregation", "exhibition", "generalization", "tagged"],
  "process>process": ["invocation", "aggregation", "generalization"],
};

export const LINK_LABEL: Record<EditorLinkKind, string> = {
  agent: "agent", instrument: "requires", consumption: "consumes", result: "yields", effect: "affects",
  condition: "condition", event: "event", invocation: "invokes",
  aggregation: "consists of", exhibition: "exhibits", generalization: "is a", tagged: "tagged",
};

/** Kinds that can start or end at a state of an object. */
export const STATEFUL: Record<EditorLinkKind, { from?: boolean; to?: boolean }> = {
  agent: {}, instrument: { from: true }, consumption: { from: true }, result: { to: true }, effect: { from: true, to: true },
  condition: { from: true }, event: { from: true }, invocation: {},
  aggregation: {}, exhibition: {}, generalization: {}, tagged: {},
};

export function thingKind(model: Model, id: string): ThingKind | undefined {
  return id in objects(model) ? "object" : id in processes(model) ? "process" : undefined;
}

export function allowedKinds(model: Model, from: string, to: string): EditorLinkKind[] {
  const a = thingKind(model, from);
  const b = thingKind(model, to);
  if (!a || !b || from === to) return [];
  return ALLOWED[`${a}>${b}`];
}

/** Every link of the model, in declaration order. */
export function editorLinks(model: Model): EditorLink[] {
  const out: EditorLink[] = [];
  const add = (l: Omit<EditorLink, "id" | "note">, entry: string | { note?: string }) =>
    out.push({ ...l, id: l.path.join("/"), ...(refNote(entry) ? { note: refNote(entry) } : {}) });
  for (const [id, o] of Object.entries(objects(model))) {
    (o.consistsOf ?? []).forEach((r, i) => add({ kind: "aggregation", from: id, to: refObject(r), path: ["objects", id, "consistsOf", i] }, r));
    (o.exhibits ?? []).forEach((r, i) => add({ kind: "exhibition", from: id, to: refObject(r), path: ["objects", id, "exhibits", i] }, r));
    if (o.isA) add({ kind: "generalization", from: id, to: refObject(o.isA), path: ["objects", id, "isA"] }, o.isA);
    (o.tagged ?? []).forEach((t, i) => add({ kind: "tagged", from: id, to: t.object, tag: t.tag, path: ["objects", id, "tagged", i] }, t));
  }
  for (const [id, p] of Object.entries(processes(model))) {
    const base = ["processes", id];
    (p.handledBy ?? []).forEach((r, i) => add({ kind: "agent", from: refObject(r), to: id, path: [...base, "handledBy", i] }, r));
    (p.requires ?? []).forEach((r, i) => add({ kind: "instrument", from: refObject(r), to: id, fromState: refState(r), path: [...base, "requires", i] }, r));
    (p.consumes ?? []).forEach((r, i) => add({ kind: "consumption", from: refObject(r), to: id, fromState: refState(r), path: [...base, "consumes", i] }, r));
    (p.yields ?? []).forEach((r, i) => add({ kind: "result", from: id, to: refObject(r), toState: refState(r), path: [...base, "yields", i] }, r));
    (p.affects ?? []).forEach((r, i) => add({ kind: "effect", from: refObject(r), to: id, path: [...base, "affects", i] }, r));
    (p.changes ?? []).forEach((c, i) => add({ kind: "effect", from: c.object, to: id, fromState: c.from, toState: c.to, path: [...base, "changes", i] }, c));
    (p.conditions ?? []).forEach((c, i) => add({ kind: "condition", from: c.object, to: id, fromState: c.state, path: [...base, "conditions", i] }, c));
    (p.events ?? []).forEach((c, i) => add({ kind: "event", from: c.object, to: id, fromState: c.state, path: [...base, "events", i] }, c));
    (p.invokes ?? []).forEach((r, i) => add({ kind: "invocation", from: id, to: refObject(r), path: [...base, "invokes", i] }, r));
    (p.consistsOf ?? []).forEach((r, i) => add({ kind: "aggregation", from: id, to: refObject(r), path: [...base, "consistsOf", i] }, r));
    if (p.isA) add({ kind: "generalization", from: id, to: refObject(p.isA), path: [...base, "isA"] }, p.isA);
  }
  return out;
}

/** The object whose states a link's fromState and toState refer to. */
export function stateOwner(link: Pick<EditorLink, "kind" | "from" | "to">): string {
  return link.kind === "result" ? link.to : link.from;
}
