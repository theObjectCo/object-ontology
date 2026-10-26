import { EditorLink, EditorLinkKind, STATEFUL, allowedKinds, editorLinks, thingKind } from "../links";
import { Model, Ref, objects } from "../model";
import { EditError, EditResult, JsonPath, Operation } from "./contracts";
import { Doc } from "./document";
import { byPathDesc } from "./references";

export function linkOperations(doc: Doc, model: Model, op: Extract<Operation, { op: "addLink" | "updateLink" }>): Partial<EditResult> {
  switch (op.op) {

    case "addLink": {
      const kinds = allowedKinds(model, op.from, op.to);
      let { from, to, fromState, toState } = op;
      // an effect drawn from the process is stored on the process, with the states on the object
      if (op.kind === "effect" && thingKind(model, op.from) === "process") [from, to, fromState, toState] = [op.to, op.from, op.toState, op.fromState];
      if (!kinds.includes(op.kind)) throw new EditError(`A ${op.kind} link is not allowed from ${op.from} to ${op.to}.`);
      const { path, value: bare, single } = resolveEntry(model, linkEntry(op.kind, from, to, fromState, effectTo(op.kind, fromState, toState), op.tag));
      const value = op.note?.trim() ? withNote(path, bare, op.note) : bare;
      if (single) doc.set(path, value);
      else if (!linkExists(doc, path, value)) doc.push(path, value);
      return {};
    }

    case "updateLink": {
      const link = editorLinks(model).find((l) => l.id === op.id);
      if (!link) throw new EditError("The link no longer exists.");
      if (op.note !== undefined) {
        doc.set(link.path, withNote(link.path, doc.value(link.path), op.note?.trim() ? op.note : undefined));
        return {};
      }
      let kind = op.kind ?? link.kind;
      let from = link.from, to = link.to;
      if (op.reverse) [from, to] = [to, from];
      const fromState = op.fromState === null ? undefined : op.fromState ?? link.fromState;
      let toState = op.toState === null ? undefined : op.toState ?? link.toState;
      if (!allowedKinds(model, from, to).includes(kind)) throw new EditError(`A ${kind} link is not allowed from ${from} to ${to}.`);
      if (!STATEFUL[kind].from && fromState) throw new EditError(`A ${kind} link cannot start at a state.`);
      toState = STATEFUL[kind].to ? toState : undefined;
      removeLinks(doc, [link]);
      const cur = doc.model;
      const { path, value: bare, single } = resolveEntry(cur, linkEntry(kind, from, to, STATEFUL[kind].from ? fromState : undefined, effectTo(kind, fromState, toState), op.tag ?? link.tag));
      const value = withNote(path, bare, link.note);
      if (single) doc.set(path, value);
      else doc.push(path, value);
      return {};
    }
  }
}

/** Where a new link is stored, and the entry value. */
export function linkEntry(kind: EditorLinkKind, from: string, to: string, fromState?: string, toState?: string, tag?: string): { path: JsonPath; value: unknown; single?: boolean } {
  const ref = (object: string, state?: string): Ref => (state ? { object, state } : object);
  switch (kind) {
    case "agent": return { path: ["processes", to, "handledBy"], value: from };
    case "instrument": return { path: ["processes", to, "requires"], value: ref(from, fromState) };
    case "consumption": return { path: ["processes", to, "consumes"], value: ref(from, fromState) };
    case "condition": return { path: ["processes", to, "conditions"], value: fromState ? { object: from, state: fromState } : { object: from } };
    case "event": return { path: ["processes", to, "events"], value: fromState ? { object: from, state: fromState } : { object: from } };
    case "effect":
      if (toState) return { path: ["processes", to, "changes"], value: fromState ? { object: from, from: fromState, to: toState } : { object: from, to: toState } };
      return { path: ["processes", to, "affects"], value: from };
    case "result": return { path: ["processes", from, "yields"], value: ref(to, toState) };
    case "invocation": return { path: ["processes", from, "invokes"], value: to };
    case "exhibition": return { path: ["objects", from, "exhibits"], value: to };
    case "tagged": return { path: ["objects", from, "tagged"], value: { object: to, tag: tag || "relates to" } };
    case "aggregation": return { path: [fromIsObjectPlaceholder, from, "consistsOf"], value: to };
    case "generalization": return { path: [fromIsObjectPlaceholder, from, "isA"], value: to, single: true };
  }
}

export const fromIsObjectPlaceholder = "?";

/** Fields whose entries may be a bare identifier; the others are always objects. */
export const BARE_FIELDS = new Set(["handledBy", "requires", "consumes", "yields", "affects", "invokes", "consistsOf", "exhibits", "isA"]);

/**
 * A link entry with its note set or removed. A bare identifier takes the object form to carry a note,
 * and an object form left with only its target goes back to the bare identifier where the field allows it.
 */
export function withNote(path: JsonPath, entry: unknown, note: string | undefined): unknown {
  const field = String(path[2]);
  if (typeof entry === "string") {
    if (!note) return entry;
    const key = field === "invokes" || (path[0] === "processes" && (field === "consistsOf" || field === "isA")) ? "process" : "object";
    return { [key]: entry, note };
  }
  const { note: _old, ...rest } = entry as Record<string, unknown>;
  if (note) return { ...rest, note };
  const keys = Object.keys(rest);
  return keys.length === 1 && BARE_FIELDS.has(field) && (keys[0] === "object" || keys[0] === "process") ? rest[keys[0]] : rest;
}

export function effectTo(kind: EditorLinkKind, fromState?: string, toState?: string): string | undefined {
  // an effect with only a starting state has no target state; keep it as a plain effect
  if (kind === "effect" && fromState && !toState) throw new EditError("A state change needs a target state: start the link at one state and end it at another.");
  return toState;
}

export function resolveEntry(model: Model, e: ReturnType<typeof linkEntry>) {
  if (e.path[0] !== fromIsObjectPlaceholder) return e;
  const id = e.path[1] as string;
  return { ...e, path: [objects(model)[id] ? "objects" : "processes", ...e.path.slice(1)] };
}

export function linkExists(doc: Doc, path: JsonPath, value: unknown): boolean {
  const list = doc.value<unknown[]>(path);
  return Array.isArray(list) && list.some((x) => JSON.stringify(x) === JSON.stringify(value));
}

export function removeLinks(doc: Doc, links: EditorLink[]) {
  for (const l of [...links].sort((a, b) => byPathDesc(a.path, b.path))) {
    const listPath = l.path.slice(0, -1);
    doc.remove(l.path);
    const list = doc.value<unknown[]>(listPath);
    if (Array.isArray(list) && !list.length && listPath[2] !== "zoomsInto") doc.remove(listPath);
  }
}
