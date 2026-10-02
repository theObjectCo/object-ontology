import { Node, findNodeAtLocation, getNodeValue, parseTree } from "jsonc-parser";
import { EditorLink, EditorLinkKind, STATEFUL, allowedKinds, editorLinks, stateOwner, thingKind } from "./links";
import { Model, ObjectDef, ProcessDef, Ref, TEXT_FIELDS, humanize, objects, processes, refObject } from "./model";
import { listViews, viewContent } from "./viewmodel";

export type Position = [number, number];
export type Positions = Record<string, Position>;
type JsonPath = (string | number)[];

export interface Fragment {
  objects?: Record<string, ObjectDef>;
  processes?: Record<string, ProcessDef>;
  positions?: Positions;
}

export type Operation =
  | { op: "addElement"; kind: "object" | "process"; viewId: string; label?: string; pos?: Position; parentId?: string }
  | { op: "addState"; object: string; state?: string }
  | { op: "updateElement"; id: string; patch: Record<string, unknown> }
  | { op: "renameId"; oldId: string; newId: string }
  /** Sets the label; with deriveId the identifier follows the label, as for an element that was just created. */
  | { op: "setLabel"; id: string; label: string | null; deriveId?: boolean }
  | { op: "renameState"; object: string; oldState: string; newState: string }
  | { op: "deleteState"; object: string; state: string }
  | { op: "moveState"; object: string; state: string; index: number }
  | { op: "deleteElements"; ids: string[]; links?: string[] }
  | { op: "addLink"; kind: EditorLinkKind; from: string; to: string; fromState?: string; toState?: string; tag?: string }
  | { op: "updateLink"; id: string; kind?: EditorLinkKind; fromState?: string | null; toState?: string | null; tag?: string; reverse?: boolean; note?: string | null }
  | { op: "moveElements"; viewId: string; positions: Positions; all?: Positions }
  | { op: "setLayout"; viewId: string; positions: Positions | null }
  | { op: "reorderSubprocess"; parent: string; id: string; index: number }
  | { op: "openZoom"; process: string }
  | { op: "saveView"; name: string; ids: string[]; positions?: Positions }
  | { op: "paste"; fragment: Fragment; viewId: string; offset?: Position; parentId?: string }
  | { op: "removeStaleLayout" }
  /** Sets the "schema" field of several objects in one edit. */
  | { op: "setSchemas"; schemas: Record<string, string> };

export interface EditResult {
  text: string;
  /** Things to select after the edit, e.g. a new element. */
  select?: string[];
  message?: string;
}

export class EditError extends Error {}

const ID = /^[a-z][A-Za-z0-9]*$/;

/** The indentation unit of a document, e.g. two spaces. */
function indentUnit(text: string): string {
  const m = /\n([ \t]+)"/.exec(text);
  return m ? m[1] : "  ";
}

/** One-line JSON in the style of the example models: { "a": 1 }, ["x", "y"], [40, 290]. */
export function compact(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(compact).join(", ")}]`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}

const MAX_LINE = 120;

/**
 * A JSON document edited in place. Every change touches only the text of the affected entry, so the
 * formatting of the rest of the file stays as it is: an entry written on one line stays on one line,
 * a multi-line object gets new lines with the indentation of its neighbours.
 */
class Doc {
  text: string;
  private unit: string;
  private eol: string;

  constructor(text: string) {
    this.text = text.trim() ? text : "{\n}\n";
    this.unit = indentUnit(this.text);
    this.eol = this.text.includes("\r\n") ? "\r\n" : "\n";
    const tree = parseTree(this.text);
    if (!tree || tree.type !== "object") throw new EditError("The file is not a JSON object; fix it in the text editor first.");
  }

  get model(): Model {
    return JSON.parse(this.text) as Model;
  }

  node(path: JsonPath): Node | undefined {
    const tree = parseTree(this.text)!;
    return path.length ? findNodeAtLocation(tree, path) : tree;
  }

  value<T = unknown>(path: JsonPath): T | undefined {
    const n = this.node(path);
    return n ? (getNodeValue(n) as T) : undefined;
  }

  private replace(offset: number, length: number, s: string) {
    this.text = this.text.slice(0, offset) + s + this.text.slice(offset + length);
  }

  private lineIndent(offset: number): string {
    const start = this.text.lastIndexOf("\n", offset - 1) + 1;
    return /^[ \t]*/.exec(this.text.slice(start))![0];
  }

  private column(offset: number): number {
    return offset - (this.text.lastIndexOf("\n", offset - 1) + 1);
  }

  private isMultiline(n: Node): boolean {
    return this.text.slice(n.offset, n.offset + n.length).includes("\n");
  }

  /** Text of a value that starts at a column: one line if it fits or if forced; otherwise indented JSON. */
  private render(value: unknown, column: number, indent: string, oneLine: boolean): string {
    const flat = compact(value);
    if (oneLine || column + flat.length <= MAX_LINE || typeof value !== "object" || value === null) return flat;
    return JSON.stringify(value, null, this.unit).split("\n").join(this.eol + indent);
  }

  set(path: JsonPath, value: unknown) {
    if (value === undefined) return this.remove(path);
    const oneLine = path[0] === "layout" && path.length >= 2;
    const existing = this.node(path);
    if (existing) {
      const col = this.column(existing.offset);
      return this.replace(existing.offset, existing.length, this.render(value, col, this.lineIndent(existing.offset), oneLine));
    }
    const parentPath = path.slice(0, -1);
    const key = path[path.length - 1];
    if (!this.node(parentPath)) this.set(parentPath, typeof key === "number" ? [] : {});
    const parent = this.node(parentPath)!;
    if (parent.type === "array") return this.insertItem(parent, value, oneLine);
    this.insertProperty(parent, String(key), value, parentPath.length <= 1, oneLine);
  }

  push(path: JsonPath, value: unknown) {
    const list = this.node(path);
    if (list?.type === "array") this.insertItem(list, value, path[0] === "layout");
    else this.set(path, [value]);
  }

  private insertProperty(obj: Node, key: string, value: unknown, multilineWhenEmpty: boolean, oneLine: boolean) {
    const props = obj.children ?? [];
    const k = JSON.stringify(key);
    const entry = (indent: string, col: number) => `${k}: ${this.render(value, col + k.length + 2, indent, oneLine)}`;
    if (!props.length) {
      if (multilineWhenEmpty || this.isMultiline(obj)) {
        const outer = this.lineIndent(obj.offset);
        const indent = outer + this.unit;
        return this.replace(obj.offset, obj.length, `{${this.eol}${indent}${entry(indent, indent.length)}${this.eol}${outer}}`);
      }
      return this.replace(obj.offset, obj.length, `{ ${entry(this.lineIndent(obj.offset), this.column(obj.offset) + 2)} }`);
    }
    const last = props[props.length - 1];
    const end = last.offset + last.length;
    if (this.isMultiline(obj)) {
      const indent = this.lineIndent(last.offset);
      this.replace(end, 0, `,${this.eol}${indent}${entry(indent, indent.length)}`);
    } else {
      this.replace(end, 0, `, ${entry(this.lineIndent(obj.offset), this.column(end) + 2)}`);
    }
  }

  private insertItem(list: Node, value: unknown, oneLine: boolean) {
    const items = list.children ?? [];
    if (!items.length) {
      return this.replace(list.offset, list.length, `[${this.render(value, this.column(list.offset) + 1, this.lineIndent(list.offset), oneLine)}]`);
    }
    const last = items[items.length - 1];
    const end = last.offset + last.length;
    if (this.isMultiline(list)) {
      const indent = this.lineIndent(last.offset);
      this.replace(end, 0, `,${this.eol}${indent}${this.render(value, indent.length, indent, oneLine)}`);
    } else {
      this.replace(end, 0, `, ${this.render(value, this.column(end) + 2, this.lineIndent(list.offset), oneLine)}`);
    }
  }

  /** Removes a property or an array item together with the comma that separates it from a neighbour. */
  remove(path: JsonPath) {
    const n = this.node(path);
    if (!n?.parent) return;
    const target = n.parent.type === "property" ? n.parent : n;
    const container = target.parent!;
    const siblings = container.children!;
    const i = siblings.indexOf(target);
    if (siblings.length === 1) return this.replace(container.offset, container.length, container.type === "array" ? "[]" : "{}");
    if (i < siblings.length - 1) return this.replace(target.offset, siblings[i + 1].offset - target.offset, "");
    const prev = siblings[i - 1];
    this.replace(prev.offset + prev.length, target.offset + target.length - (prev.offset + prev.length), "");
  }

  renameKey(path: JsonPath, newKey: string) {
    const n = this.node(path);
    if (!n?.parent || n.parent.type !== "property") return;
    const key = n.parent.children![0];
    this.replace(key.offset, key.length, JSON.stringify(newKey));
  }

  replaceString(path: JsonPath, s: string) {
    const n = this.node(path);
    if (n?.type === "string") this.replace(n.offset, n.length, JSON.stringify(s));
  }
}

function idFromLabel(label: string): string {
  const words = label.normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, "")).filter(Boolean);
  if (!words.length) return "";
  const id = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("");
  return /^[a-z]/.test(id) ? id : `x${id}`;
}

function takenIds(model: Model): Set<string> {
  return new Set([...Object.keys(objects(model)), ...Object.keys(processes(model)), ...Object.keys(model.views ?? {}), "system", "structure"]);
}

export function uniqueId(model: Model, base: string, taken = takenIds(model)): string {
  const root = ID.test(base) ? base : idFromLabel(base) || "thing";
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) if (!taken.has(`${root}${i}`)) return `${root}${i}`;
}

function groupOf(model: Model, id: string): "objects" | "processes" {
  if (objects(model)[id]) return "objects";
  if (processes(model)[id]) return "processes";
  throw new EditError(`Unknown element "${id}".`);
}

/** Renames a thing everywhere: references, its key, and its layout keys. */
function rename(doc: Doc, model: Model, oldId: string, newId: string) {
  const group = groupOf(model, oldId);
  for (const path of referencePaths(model, oldId)) doc.replaceString(path, newId);
  doc.renameKey([group, oldId], newId);
  for (const [vid, positions] of Object.entries(model.layout ?? {})) {
    if (oldId in positions) doc.renameKey(["layout", vid, oldId], newId);
  }
  if (model.layout?.[oldId]) doc.renameKey(["layout", oldId], newId);
}

function checkId(model: Model, id: string, except?: string) {
  if (!ID.test(id)) throw new EditError(`"${id}" is not a valid identifier: use camelCase starting with a lowercase letter.`);
  if (id !== except && takenIds(model).has(id)) throw new EditError(`"${id}" is already used.`);
}

/** Paths of every string that refers to a thing, for renaming and deleting. */
function referencePaths(model: Model, id: string): JsonPath[] {
  const out: JsonPath[] = [];
  const scan = (base: JsonPath, def: Record<string, unknown>) => {
    for (const [field, v] of Object.entries(def)) {
      if (TEXT_FIELDS.includes(field)) continue;
      const entry = (item: unknown, path: JsonPath) => {
        if (item === id) out.push(path);
        else if (item && typeof item === "object") {
          const key = targetKey(item);
          if (key && (item as Record<string, unknown>)[key] === id) out.push([...path, key]);
        }
      };
      if (Array.isArray(v)) v.forEach((item, i) => entry(item, [...base, field, i]));
      else entry(v, [...base, field]);
    }
  };
  for (const [oid, o] of Object.entries(objects(model))) scan(["objects", oid], o as Record<string, unknown>);
  for (const [pid, p] of Object.entries(processes(model))) scan(["processes", pid], p as Record<string, unknown>);
  for (const [vid, v] of Object.entries(model.views ?? {})) scan(["views", vid], v as Record<string, unknown>);
  return out;
}

/** Where a new link is stored, and the entry value. */
function linkEntry(kind: EditorLinkKind, from: string, to: string, fromState?: string, toState?: string, tag?: string): { path: JsonPath; value: unknown; single?: boolean } {
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
const fromIsObjectPlaceholder = "?";

/** The key that names the target in a link entry written as an object. */
function targetKey(entry: object): "object" | "process" | undefined {
  return "object" in entry ? "object" : "process" in entry ? "process" : undefined;
}

/** Fields whose entries may be a bare identifier; the others are always objects. */
const BARE_FIELDS = new Set(["handledBy", "requires", "consumes", "yields", "affects", "invokes", "consistsOf", "exhibits", "isA"]);

/**
 * A link entry with its note set or removed. A bare identifier takes the object form to carry a note,
 * and an object form left with only its target goes back to the bare identifier where the field allows it.
 */
function withNote(path: JsonPath, entry: unknown, note: string | undefined): unknown {
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

export function applyOperation(text: string, op: Operation): EditResult {
  const doc = new Doc(text);
  const model = doc.model;
  const select = run(doc, model, op);
  return { text: doc.text, ...select };
}

function run(doc: Doc, model: Model, op: Operation): Partial<EditResult> {
  switch (op.op) {
    case "addElement": {
      const group = op.kind === "object" ? "objects" : "processes";
      const label = op.label?.trim() || (op.kind === "object" ? "New Object" : "New Process");
      const id = uniqueId(model, idFromLabel(label));
      if (!doc.node([group])) doc.set([group], {});
      // the label is written only when it differs from the one derived from the identifier
      doc.set([group, id], humanize(id) === label || !op.label ? {} : { label });
      if (op.parentId) {
        if (op.kind !== "process" || !processes(model)[op.parentId]) throw new EditError("Only a process can be added inside a zoomed process.");
        doc.push(["processes", op.parentId, "zoomsInto"], id);
      }
      if (model.views?.[op.viewId]?.things) doc.push(["views", op.viewId, "things"], id);
      if (op.pos && doc.value(["layout", op.viewId])) doc.set(["layout", op.viewId, id], round(op.pos));
      return { select: [id] };
    }
    case "addState": {
      const o = objects(model)[op.object];
      if (!o) throw new EditError(`Unknown object "${op.object}".`);
      const states = o.states ?? [];
      let s = op.state ?? "state";
      if (!op.state) for (let i = 2; states.includes(s); i++) s = `state${i}`;
      if (states.includes(s)) throw new EditError(`${op.object} already has state "${s}".`);
      doc.push(["objects", op.object, "states"], s);
      return {};
    }
    case "updateElement": {
      const group = objects(model)[op.id] ? "objects" : processes(model)[op.id] ? "processes" : undefined;
      if (!group) throw new EditError(`Unknown element "${op.id}".`);
      for (const [field, v] of Object.entries(op.patch)) {
        if (v === null || v === undefined || v === "" || (field === "role" && v === false)) doc.remove([group, op.id, field]);
        else doc.set([group, op.id, field], field === "role" && v === true ? "module" : v);
      }
      return {};
    }
    case "renameId": {
      if (op.oldId === op.newId) return {};
      checkId(model, op.newId);
      rename(doc, model, op.oldId, op.newId);
      return { select: [op.newId] };
    }
    case "setLabel": {
      const group = groupOf(model, op.id);
      const text = op.label?.trim() || null;
      let id = op.id;
      if (op.deriveId && text) {
        const taken = takenIds(model);
        taken.delete(op.id);
        id = uniqueId(model, idFromLabel(text) || op.id, taken);
        if (id !== op.id) rename(doc, model, op.id, id);
      }
      if (!text || text === humanize(id)) doc.remove([group, id, "label"]);
      else doc.set([group, id, "label"], text);
      return { select: [id] };
    }
    case "renameState": {
      const o = objects(model)[op.object];
      const i = o?.states?.indexOf(op.oldState) ?? -1;
      if (i < 0) throw new EditError(`${op.object} has no state "${op.oldState}".`);
      if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(op.newState)) throw new EditError(`"${op.newState}" is not a valid state name.`);
      if (o.states!.includes(op.newState)) throw new EditError(`${op.object} already has state "${op.newState}".`);
      for (const path of statePaths(model, op.object, op.oldState)) doc.replaceString(path, op.newState);
      doc.replaceString(["objects", op.object, "states", i], op.newState);
      return {};
    }
    case "deleteState": {
      const o = objects(model)[op.object];
      const i = o?.states?.indexOf(op.state) ?? -1;
      if (i < 0) throw new EditError(`${op.object} has no state "${op.state}".`);
      clearState(doc, model, op.object, op.state);
      const states = doc.model.objects![op.object].states!.filter((s) => s !== op.state);
      if (states.length) doc.set(["objects", op.object, "states"], states);
      else doc.remove(["objects", op.object, "states"]);
      return {};
    }
    case "moveState": {
      const states = [...(objects(model)[op.object]?.states ?? [])];
      const i = states.indexOf(op.state);
      if (i < 0) throw new EditError(`${op.object} has no state "${op.state}".`);
      states.splice(i, 1);
      states.splice(Math.max(0, Math.min(op.index, states.length)), 0, op.state);
      doc.set(["objects", op.object, "states"], states);
      return {};
    }
    case "deleteElements": {
      const ids = new Set(op.ids);
      const linkIds = new Set(op.links ?? []);
      // links first, by descending index so that paths stay valid
      const links = editorLinks(model).filter((l) => linkIds.has(l.id));
      removeLinks(doc, links);
      let cur = doc.model;
      for (const id of ids) {
        for (const path of referencePaths(cur, id).sort(byPathDesc)) removeReference(doc, path);
        cur = doc.model;
        const group = objects(cur)[id] ? "objects" : processes(cur)[id] ? "processes" : undefined;
        if (group) doc.remove([group, id]);
        for (const [vid, positions] of Object.entries(cur.layout ?? {})) if (id in positions) doc.remove(["layout", vid, id]);
        if (cur.layout?.[id]) doc.remove(["layout", id]);
        cur = doc.model;
      }
      return { select: [] };
    }
    case "addLink": {
      const kinds = allowedKinds(model, op.from, op.to);
      let { from, to, fromState, toState } = op;
      // an effect drawn from the process is stored on the process, with the states on the object
      if (op.kind === "effect" && thingKind(model, op.from) === "process") [from, to, fromState, toState] = [op.to, op.from, op.toState, op.fromState];
      if (!kinds.includes(op.kind)) throw new EditError(`A ${op.kind} link is not allowed from ${op.from} to ${op.to}.`);
      const { path, value, single } = resolveEntry(model, linkEntry(op.kind, from, to, fromState, effectTo(op.kind, fromState, toState), op.tag));
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
    case "moveElements": {
      const existing = model.layout?.[op.viewId];
      if (!existing) {
        doc.set(["layout", op.viewId], roundAll({ ...(op.all ?? {}), ...op.positions }));
        return {};
      }
      for (const [id, p] of Object.entries(op.positions)) doc.set(["layout", op.viewId, id], round(p));
      return {};
    }
    case "setLayout": {
      if (op.positions === null) doc.remove(["layout", op.viewId]);
      else doc.set(["layout", op.viewId], roundAll(op.positions));
      if (op.positions === null && doc.model.layout && !Object.keys(doc.model.layout).length) doc.remove(["layout"]);
      return {};
    }
    case "reorderSubprocess": {
      const subs = [...(processes(model)[op.parent]?.zoomsInto ?? [])];
      const i = subs.indexOf(op.id);
      if (i < 0) throw new EditError(`${op.id} is not a subprocess of ${op.parent}.`);
      subs.splice(i, 1);
      subs.splice(Math.max(0, Math.min(op.index, subs.length)), 0, op.id);
      doc.set(["processes", op.parent, "zoomsInto"], subs);
      return {};
    }
    case "openZoom": {
      if (!processes(model)[op.process]) throw new EditError(`Unknown process "${op.process}".`);
      if (processes(model)[op.process].zoomsInto === undefined) doc.set(["processes", op.process, "zoomsInto"], []);
      return {};
    }
    case "saveView": {
      const id = uniqueId(model, idFromLabel(op.name) || "view");
      if (!doc.node(["views"])) doc.set(["views"], {});
      doc.set(["views", id], { title: op.name, things: op.ids });
      if (op.positions && Object.keys(op.positions).length) doc.set(["layout", id], roundAll(op.positions));
      return { message: `View "${op.name}" saved` };
    }
    case "paste":
      return paste(doc, model, op);
    case "removeStaleLayout":
      return removeStale(doc, model);
    case "setSchemas":
      for (const [id, schema] of Object.entries(op.schemas)) {
        if (!objects(model)[id]) throw new EditError(`Unknown object "${id}".`);
        doc.set(["objects", id, "schema"], schema);
      }
      return {};
  }
}

function effectTo(kind: EditorLinkKind, fromState?: string, toState?: string): string | undefined {
  // an effect with only a starting state has no target state; keep it as a plain effect
  if (kind === "effect" && fromState && !toState) throw new EditError("A state change needs a target state: start the link at one state and end it at another.");
  return toState;
}

function resolveEntry(model: Model, e: ReturnType<typeof linkEntry>) {
  if (e.path[0] !== fromIsObjectPlaceholder) return e;
  const id = e.path[1] as string;
  return { ...e, path: [objects(model)[id] ? "objects" : "processes", ...e.path.slice(1)] };
}

function linkExists(doc: Doc, path: JsonPath, value: unknown): boolean {
  const list = doc.value<unknown[]>(path);
  return Array.isArray(list) && list.some((x) => JSON.stringify(x) === JSON.stringify(value));
}

const byPathDesc = (a: JsonPath, b: JsonPath) => {
  const ka = a.map((x) => (typeof x === "number" ? String(x).padStart(6, "0") : x)).join("/");
  const kb = b.map((x) => (typeof x === "number" ? String(x).padStart(6, "0") : x)).join("/");
  return ka < kb ? 1 : ka > kb ? -1 : 0;
};

function removeLinks(doc: Doc, links: EditorLink[]) {
  for (const l of [...links].sort((a, b) => byPathDesc(a.path, b.path))) {
    const listPath = l.path.slice(0, -1);
    doc.remove(l.path);
    const list = doc.value<unknown[]>(listPath);
    if (Array.isArray(list) && !list.length && listPath[2] !== "zoomsInto") doc.remove(listPath);
  }
}

/** Removes a reference to a deleted thing: an array entry, an isA property, or a view pointing at it. */
function removeReference(doc: Doc, path: JsonPath) {
  if (path[0] === "views" && path[2] === "process") return doc.remove(["views", path[1]]);
  const last = path[path.length - 1];
  const itemPath = last === "object" || last === "process" ? path.slice(0, -1) : path;
  if (typeof itemPath[itemPath.length - 1] !== "number") return doc.remove(itemPath);
  const listPath = itemPath.slice(0, -1);
  doc.remove(itemPath);
  const list = doc.value<unknown[]>(listPath);
  if (Array.isArray(list) && !list.length && listPath[2] !== "zoomsInto") doc.remove(listPath);
}

/** Paths of state names that refer to a state of an object. */
function statePaths(model: Model, object: string, state: string): JsonPath[] {
  const out: JsonPath[] = [];
  for (const l of editorLinks(model)) {
    if (stateOwner(l) !== object) continue;
    const field = l.path[2];
    if (field === "changes") {
      if (l.fromState === state) out.push([...l.path, "from"]);
      if (l.toState === state) out.push([...l.path, "to"]);
    } else if ((l.fromState ?? l.toState) === state) out.push([...l.path, "state"]);
  }
  return out;
}

/** Removes a state from the links that name it: the link stays, without the state. */
function clearState(doc: Doc, model: Model, object: string, state: string) {
  const links = editorLinks(model).filter((l) => stateOwner(l) === object && (l.fromState === state || l.toState === state));
  for (const l of [...links].sort((a, b) => byPathDesc(a.path, b.path))) {
    const field = l.path[2];
    if (field === "changes") {
      if (l.toState === state) {
        // a change without a target state becomes a plain effect
        removeLinks(doc, [l]);
        const cur = doc.model;
        const affects: JsonPath = ["processes", l.to, "affects"];
        if (!(cur.processes?.[l.to]?.affects ?? []).some((r) => refObject(r) === object)) doc.push(affects, withNote(affects, object, l.note));
      } else doc.remove([...l.path, "from"]);
    } else if (field === "conditions" || field === "events") doc.remove([...l.path, "state"]);
    else {
      const { state: _state, ...rest } = doc.value(l.path) as Record<string, unknown>;
      doc.set(l.path, withNote(l.path, rest, l.note));
    }
  }
}

function round(p: Position): Position {
  return [Math.round(p[0]), Math.round(p[1])];
}

function roundAll(ps: Positions): Positions {
  return Object.fromEntries(Object.entries(ps).map(([k, p]) => [k, round(p)]));
}

/** Elements with the links between them, for copying; links to things outside the selection are left out. */
export function fragmentOf(model: Model, ids: string[], positions?: Positions): Fragment {
  const set = new Set(ids);
  const target = (x: unknown): string | undefined =>
    typeof x === "string" ? x : x && typeof x === "object" && targetKey(x) ? String((x as Record<string, unknown>)[targetKey(x)!]) : undefined;
  const keep = (v: unknown): unknown => {
    if (!Array.isArray(v)) return v;
    const kept = v.filter((x) => !target(x) || set.has(target(x)!));
    return kept.length ? kept : undefined;
  };
  const clean = <T extends object>(def: T): T => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(def)) {
      if (TEXT_FIELDS.includes(k)) out[k] = v;
      else if (k === "isA") { if (set.has(target(v)!)) out[k] = v; }
      else { const kv = keep(v); if (kv !== undefined) out[k] = kv; }
    }
    return out as T;
  };
  const frag: Fragment = {};
  for (const id of ids) {
    const o = objects(model)[id];
    const p = processes(model)[id];
    if (o) (frag.objects ??= {})[id] = clean(o);
    if (p) (frag.processes ??= {})[id] = clean(p);
  }
  if (positions) frag.positions = Object.fromEntries(ids.filter((id) => positions[id]).map((id) => [id, positions[id]]));
  return frag;
}

function paste(doc: Doc, model: Model, op: Extract<Operation, { op: "paste" }>): Partial<EditResult> {
  const taken = takenIds(model);
  const newIds = new Map<string, string>();
  const incoming = [...Object.keys(op.fragment.objects ?? {}), ...Object.keys(op.fragment.processes ?? {})];
  if (!incoming.length) throw new EditError("The clipboard does not contain OPM elements.");
  for (const id of incoming) {
    const next = uniqueId(model, id, taken);
    taken.add(next);
    newIds.set(id, next);
  }
  const map = (v: unknown): unknown => {
    if (typeof v === "string") return newIds.get(v) ?? v;
    if (Array.isArray(v)) return v.map(map);
    if (v && typeof v === "object") {
      const o = { ...(v as Record<string, unknown>) };
      if (typeof o.object === "string") o.object = newIds.get(o.object) ?? o.object;
      if (typeof o.process === "string") o.process = newIds.get(o.process) ?? o.process;
      return o;
    }
    return v;
  };
  const translate = (def: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(def).map(([k, v]) => [k, TEXT_FIELDS.includes(k) ? v : map(v)]));
  for (const [group, defs] of [["objects", op.fragment.objects], ["processes", op.fragment.processes]] as const) {
    if (!defs) continue;
    if (!doc.node([group])) doc.set([group], {});
    for (const [id, def] of Object.entries(defs)) doc.set([group, newIds.get(id)!], translate(def as Record<string, unknown>));
  }
  if (op.parentId && processes(model)[op.parentId]) {
    for (const id of Object.keys(op.fragment.processes ?? {})) doc.push(["processes", op.parentId, "zoomsInto"], newIds.get(id)!);
  }
  if (model.views?.[op.viewId]?.things) for (const id of newIds.values()) doc.push(["views", op.viewId, "things"], id);
  if (model.layout?.[op.viewId] && op.fragment.positions) {
    const [dx, dy] = op.offset ?? [24, 24];
    for (const [id, [x, y]] of Object.entries(op.fragment.positions)) doc.set(["layout", op.viewId, newIds.get(id) ?? id], round([x + dx, y + dy]));
  }
  const renamed = [...newIds].filter(([a, b]) => a !== b).map(([a, b]) => `${a} → ${b}`);
  return { select: [...newIds.values()], message: renamed.length ? `Pasted with new identifiers: ${renamed.join(", ")}` : undefined };
}

function removeStale(doc: Doc, model: Model): Partial<EditResult> {
  const known = new Set(listViews(model).map((v) => v.id));
  for (const [vid, positions] of Object.entries(model.layout ?? {})) {
    if (!known.has(vid)) { doc.remove(["layout", vid]); continue; }
    const nodes = new Set(viewContent(model, vid)!.nodes.map((n) => n.id));
    for (const id of Object.keys(positions)) if (!nodes.has(id)) doc.remove(["layout", vid, id]);
  }
  return {};
}

/** The smallest replacement that turns one text into another: [start, end, replacement]. */
export function minimalEdit(before: string, after: string): [number, number, string] | undefined {
  if (before === after) return undefined;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endB = before.length, endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) { endB--; endA--; }
  return [start, endB, after.slice(start, endA)];
}
