import { EditorLink, editorLinks, stateOwner } from "./links";
import { Model, ObjectDef, essence, label, objects, processes, refIds, refObject } from "./model";
import { listViews, viewContent } from "./viewmodel";

export type Severity = "error" | "warning" | "info";
export type Path = (string | number)[];

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  /** JSON path of the offending value inside the model file. */
  path: Path;
  /** The object or process the diagnostic is about, for marking it on the diagram. */
  element?: string;
}

export interface ValidateOptions {
  /** Returns the parsed JSON of a schema file referenced by an object, or undefined if it cannot be read. */
  readSchema?: (file: string) => unknown | undefined;
}

const OBJECT_TO_PROCESS = new Set(["agent", "instrument", "consumption", "effect", "condition", "event"]);

export function validate(model: Model, options: ValidateOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const report = (severity: Severity, code: string, message: string, path: Path, element?: string) =>
    out.push({ severity, code, message, path, element: element ?? elementOf(path) });
  const objs = objects(model);
  const procs = processes(model);
  const isObject = (id: string) => id in objs;
  const isProcess = (id: string) => id in procs;
  const L = (id: string) => label(model, id);
  const links = editorLinks(model);

  for (const id of Object.keys(objs)) {
    if (isProcess(id)) report("error", "duplicate-id", `"${id}" is both an object and a process.`, ["processes", id]);
  }

  // every link: ends of the right kind, states that exist
  for (const l of links) {
    const owner = l.path[1] as string;
    const ownerIsObject = l.path[0] === "objects";
    const [expectFrom, expectTo] = expectedEnds(l, ownerIsObject);
    const other = l.from === owner ? l.to : l.from;
    const otherExpected = l.from === owner ? expectTo : expectFrom;
    const key = entryKey(model, l);
    const refPath = key ? [...l.path, key] : l.path;
    if (other === owner) {
      report("error", "self-reference", `${L(owner)} cannot link to itself (${fieldOf(l)}).`, l.path);
      continue;
    }
    const exists = otherExpected === "object" ? isObject(other) : isProcess(other);
    if (!exists) {
      const wrong = otherExpected === "object" ? isProcess(other) : isObject(other);
      report("error", wrong ? (otherExpected === "object" ? "not-an-object" : "not-a-process") : (otherExpected === "object" ? "unknown-object" : "unknown-process"),
        wrong ? `"${other}" in ${fieldOf(l)} of ${L(owner)} is ${otherExpected === "object" ? "a process" : "an object"}; this link needs ${otherExpected === "object" ? "an object" : "a process"}.`
          : `Unknown ${otherExpected} "${other}" in ${fieldOf(l)} of ${L(owner)}.`,
        refPath, owner);
      continue;
    }
    const holder = stateOwner(l);
    const o = objs[holder];
    for (const [key, s] of [["from", l.fromState], ["to", l.toState]] as const) {
      if (s === undefined || !o) continue;
      const statePath = statePathOf(l, key);
      if (!o.states) report("error", "no-states", `${L(holder)} has no states, so ${fieldOf(l)} of ${L(owner)} cannot name state "${s}".`, statePath, owner);
      else if (!o.states.includes(s)) report("error", "unknown-state", `${L(holder)} has no state "${s}". States: ${o.states.join(", ")}.`, statePath, owner);
    }
    if (l.path[2] === "changes" && l.fromState !== undefined && l.fromState === l.toState) {
      report("error", "no-state-change", `${L(owner)} changes ${L(l.from)} from "${l.fromState}" to the same state.`, l.path, owner);
    }
  }

  // in-zooming
  const parentOf = new Map<string, string>();
  for (const [id, p] of Object.entries(procs)) {
    (p.zoomsInto ?? []).forEach((ref, i) => {
      const path: Path = ["processes", id, "zoomsInto", i];
      if (ref === id) report("error", "self-reference", `${L(id)} cannot zoom into itself.`, path);
      else if (!isProcess(ref)) report("error", isObject(ref) ? "not-a-process" : "unknown-process",
        isObject(ref) ? `"${ref}" in zoomsInto is an object; zoomsInto points to processes.` : `Unknown process "${ref}" in zoomsInto of ${L(id)}.`, path);
      else {
        const earlier = parentOf.get(ref);
        if (earlier && earlier !== id) report("error", "two-parents", `${L(ref)} is a subprocess of both ${L(earlier)} and ${L(id)}.`, path);
        else parentOf.set(ref, id);
      }
    });
  }
  const cycles: [string, Record<string, object>, (id: string) => string[]][] = [
    ["zoomsInto", procs, (id) => (procs[id].zoomsInto ?? []).filter(isProcess)],
    ["consistsOf", objs, (id) => refIds(objs[id].consistsOf).filter(isObject)],
    ["isA", objs, (id) => (objs[id].isA ? [refObject(objs[id].isA!)].filter(isObject) : [])],
    ["consistsOf", procs, (id) => refIds(procs[id].consistsOf).filter(isProcess)],
    ["isA", procs, (id) => (procs[id].isA ? [refObject(procs[id].isA!)].filter(isProcess) : [])],
  ];
  for (const [field, group, next] of cycles) {
    for (const cycle of findCycles(Object.keys(group), next)) {
      report("error", "cycle", `Cycle in ${field}: ${cycle.map(L).join(" → ")}.`, [group === objs ? "objects" : "processes", cycle[0], field]);
    }
  }

  // OPM rules for processes
  for (const [id, p] of Object.entries(procs)) {
    const base: Path = ["processes", id];
    const transforms = (p.consumes?.length ?? 0) + (p.yields?.length ?? 0) + (p.affects?.length ?? 0) + (p.changes?.length ?? 0);
    if (!transforms && !p.zoomsInto?.length) {
      report("error", "no-transformation", `${L(id)} does not transform any object. Add consumes, yields, affects or changes.`, base);
    }
    const transformed = new Set([
      ...(p.consumes ?? []).map(refObject), ...(p.yields ?? []).map(refObject), ...refIds(p.affects), ...(p.changes ?? []).map((c) => c.object),
    ]);
    for (const field of ["requires", "handledBy"] as const) {
      (p[field] ?? []).forEach((r, i) => {
        const ref = refObject(r);
        if (transformed.has(ref)) report("error", "enabler-transformed", `${L(ref)} is both an enabler (${field}) and transformed by ${L(id)}.`, [...base, field, i]);
      });
    }
    (p.consumes ?? []).forEach((r, i) => {
      if ((p.yields ?? []).some((y) => refObject(y) === refObject(r))) {
        report("warning", "consume-and-yield", `${L(id)} consumes and yields ${L(refObject(r))}; use affects or changes instead.`, [...base, "consumes", i]);
      }
    });
    refIds(p.handledBy).forEach((ref, i) => {
      const o = objs[ref];
      if (o && essence(o) !== "physical") {
        report("warning", "agent-not-physical", `${L(ref)} handles ${L(id)}, but an agent is a human and should have essence physical. Use requires for systems.`, [...base, "handledBy", i]);
      }
    });
    for (const ref of transformed) {
      if (objs[ref]?.role === "module") {
        report("warning", "module-transformed", `${L(id)} transforms the module ${L(ref)}. Modules are normally instruments (requires).`, base);
      }
    }
  }

  // views
  const reserved = new Set(["system", "structure"]);
  for (const [id, v] of Object.entries(model.views ?? {})) {
    if (reserved.has(id) || isProcess(id)) {
      report("error", "view-id", `View "${id}" has the same key as ${reserved.has(id) ? "a generated view" : "the zoom view of a process"}; choose another key.`, ["views", id]);
    }
    if (v.process !== undefined && !isProcess(v.process)) report("error", "unknown-process", `Unknown process "${v.process}" in view ${id}.`, ["views", id, "process"]);
    (v.things ?? []).forEach((ref, i) => {
      if (!isObject(ref) && !isProcess(ref)) report("error", "unknown-thing", `Unknown object or process "${ref}" in view ${id}.`, ["views", id, "things", i]);
    });
  }

  // objects linked to nothing
  const linked = new Set(links.flatMap((l) => [l.from, l.to]));
  for (const id of Object.keys(objs)) {
    if (!linked.has(id)) report("warning", "unused-object", `${L(id)} is not linked to any process or object.`, ["objects", id]);
  }

  for (const [id, o] of Object.entries(objs)) checkSchema(model, id, o, options, report);
  checkLayout(model, report);
  return out;
}

/** Which kinds the two ends of a link must be. */
function expectedEnds(l: EditorLink, ownerIsObject: boolean): ["object" | "process", "object" | "process"] {
  if (OBJECT_TO_PROCESS.has(l.kind)) return ["object", "process"];
  if (l.kind === "result") return ["process", "object"];
  if (l.kind === "invocation") return ["process", "process"];
  if (l.kind === "exhibition" || l.kind === "tagged") return ["object", "object"];
  return ownerIsObject ? ["object", "object"] : ["process", "process"];
}

function fieldOf(l: EditorLink): string {
  return String(l.path[2]);
}

/** The key that names the target when the link entry is written as an object, e.g. {"object": ..., "note": ...}. */
function entryKey(model: Model, l: EditorLink): "object" | "process" | undefined {
  const group = l.path[0] === "objects" ? objects(model) : processes(model);
  let v: unknown = (group[l.path[1] as string] as Record<string, unknown>)?.[l.path[2] as string];
  if (l.path.length > 3) v = Array.isArray(v) ? v[l.path[3] as number] : undefined;
  if (!v || typeof v !== "object") return undefined;
  return "process" in v ? "process" : "object";
}

function statePathOf(l: EditorLink, end: "from" | "to"): Path {
  const field = l.path[2];
  if (field === "changes") return [...l.path, end];
  if (field === "conditions" || field === "events" || field === "requires" || field === "consumes" || field === "yields") return [...l.path, "state"];
  return l.path;
}

function elementOf(path: Path): string | undefined {
  return (path[0] === "objects" || path[0] === "processes") && typeof path[1] === "string" ? path[1] : undefined;
}

function checkLayout(model: Model, report: (s: Severity, c: string, m: string, p: Path, e?: string) => void): void {
  const known = new Set(listViews(model).map((v) => v.id));
  for (const [viewId, positions] of Object.entries(model.layout ?? {})) {
    if (!known.has(viewId)) {
      report("info", "layout-view", `layout.${viewId}: there is no view "${viewId}".`, ["layout", viewId]);
      continue;
    }
    const content = viewContent(model, viewId)!;
    const nodes = new Set(content.nodes.map((n) => n.id));
    for (const id of Object.keys(positions)) {
      if (!nodes.has(id)) report("info", "layout-stale", `layout.${viewId}: position for "${id}", which is not in this view.`, ["layout", viewId, id], id);
    }
    // subprocesses inside a zoomed process have no position of their own: their order places them
    for (const id of content.nodes.filter((n) => !n.inside).map((n) => n.id)) {
      if (!(id in positions)) report("info", "layout-missing", `layout.${viewId}: no position for "${id}"; it is placed next to the things it is linked to.`, ["layout", viewId], id);
    }
  }
}

function checkSchema(model: Model, id: string, o: ObjectDef, options: ValidateOptions,
                     report: (s: Severity, c: string, m: string, p: Path, e?: string) => void): void {
  if (!o.schema || !options.readSchema) return;
  const path: Path = ["objects", id, "schema"];
  const [file, pointer] = o.schema.split("#", 2);
  const doc = options.readSchema(file);
  if (doc === undefined) {
    report("error", "schema-file", `Cannot read the schema file "${file}" of ${label(model, id)}.`, path);
    return;
  }
  const node = resolvePointer(doc, pointer);
  if (node === undefined) {
    report("error", "schema-pointer", `"${o.schema}" does not exist: no definition at #${pointer}.`, path);
    return;
  }
  if (!o.states) return;
  const values = collectEnumValues(doc, node);
  if (!values.size) {
    report("info", "states-unchecked", `${label(model, id)} has states, but its schema definition has no enums to check them against.`, ["objects", id, "states"]);
    return;
  }
  o.states.forEach((s, i) => {
    if (!values.has(s)) report("warning", "state-not-in-schema", `State "${s}" of ${label(model, id)} does not occur in any enum of ${o.schema}.`, ["objects", id, "states", i]);
  });
}

/** RFC 6901 JSON pointer, e.g. /$defs/priceResult. */
export function resolvePointer(doc: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return doc;
  let node: unknown = doc;
  for (const raw of pointer.replace(/^\//, "").split("/")) {
    const key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object" || !(key in (node as Record<string, unknown>))) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Values of every enum and const inside a schema node, following local $refs. */
export function collectEnumValues(doc: unknown, node: unknown, seen = new Set<unknown>()): Set<string> {
  const out = new Set<string>();
  const walk = (n: unknown) => {
    if (n === null || typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) return n.forEach(walk);
    const o = n as Record<string, unknown>;
    if (Array.isArray(o.enum)) o.enum.forEach((v) => typeof v === "string" && out.add(v));
    if (typeof o.const === "string") out.add(o.const);
    if (typeof o.$ref === "string" && o.$ref.startsWith("#")) walk(resolvePointer(doc, o.$ref.slice(1)));
    Object.entries(o).forEach(([k, v]) => k !== "enum" && k !== "const" && walk(v));
  };
  walk(node);
  return out;
}

/** Cycles in a directed graph, each reported once, starting at its first node. */
function findCycles(nodes: string[], next: (id: string) => string[]): string[][] {
  const cycles: string[][] = [];
  const reported = new Set<string>();
  const stack: string[] = [];
  const state = new Map<string, "open" | "done">();
  const visit = (id: string) => {
    state.set(id, "open");
    stack.push(id);
    for (const n of next(id)) {
      if (state.get(n) === "open") {
        const cycle = stack.slice(stack.indexOf(n));
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          cycles.push([...cycle, n]);
        }
      } else if (!state.has(n)) visit(n);
    }
    stack.pop();
    state.set(id, "done");
  };
  nodes.forEach((id) => state.has(id) || visit(id));
  return cycles;
}
