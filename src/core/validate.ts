import { Model, ObjectDef, essence, label, linksOf, objects, processes } from "./model";

export type Severity = "error" | "warning" | "info";
export type Path = (string | number)[];

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  /** JSON path of the offending value inside the model file. */
  path: Path;
}

export interface ValidateOptions {
  /** Returns the parsed JSON of a schema file referenced by an object, or undefined if it cannot be read. */
  readSchema?: (file: string) => unknown | undefined;
}

export function validate(model: Model, options: ValidateOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const report = (severity: Severity, code: string, message: string, path: Path) =>
    out.push({ severity, code, message, path });
  const objs = objects(model);
  const procs = processes(model);
  const isObject = (id: string) => id in objs;
  const isProcess = (id: string) => id in procs;
  const used = new Set<string>();

  for (const id of Object.keys(objs)) {
    if (isProcess(id)) report("error", "duplicate-id", `"${id}" is both an object and a process.`, ["processes", id]);
  }

  // objects: structural links; an object with its own structural links counts as used
  for (const [id, o] of Object.entries(objs)) {
    if (o.consistsOf?.length || o.exhibits?.length || o.isA) used.add(id);
    for (const field of ["consistsOf", "exhibits"] as const) {
      (o[field] ?? []).forEach((ref, i) => {
        used.add(ref);
        if (ref === id) report("error", "self-reference", `${label(model, id)} cannot refer to itself in ${field}.`, ["objects", id, field, i]);
        else if (!isObject(ref)) report("error", "unknown-object", `Unknown object "${ref}" in ${field} of ${label(model, id)}.`, ["objects", id, field, i]);
      });
    }
    if (o.isA !== undefined) {
      used.add(o.isA);
      if (o.isA === id) report("error", "self-reference", `${label(model, id)} cannot be a specialization of itself.`, ["objects", id, "isA"]);
      else if (!isObject(o.isA)) report("error", "unknown-object", `Unknown object "${o.isA}" in isA of ${label(model, id)}.`, ["objects", id, "isA"]);
    }
  }
  for (const field of ["consistsOf", "isA"] as const) {
    for (const cycle of findCycles(Object.keys(objs), (id) => {
      const v = objs[id][field];
      return (Array.isArray(v) ? v : v ? [v] : []).filter(isObject);
    })) {
      report("error", "cycle", `Cycle in ${field}: ${cycle.map((c) => label(model, c)).join(" → ")}.`, ["objects", cycle[0], field]);
    }
  }

  // processes: procedural links
  const parentOf = new Map<string, string>();
  for (const [id, p] of Object.entries(procs)) {
    const base: Path = ["processes", id];
    for (const field of ["handledBy", "requires", "consumes", "yields", "affects"] as const) {
      (p[field] ?? []).forEach((ref, i) => {
        used.add(ref);
        if (!isObject(ref)) {
          report("error", isProcess(ref) ? "not-an-object" : "unknown-object",
            isProcess(ref) ? `"${ref}" in ${field} is a process; ${field} links point to objects.` : `Unknown object "${ref}" in ${field} of ${label(model, id)}.`,
            [...base, field, i]);
        }
      });
    }
    const stateLinks: [string, { object: string; state?: string; from?: string; to?: string }[] | undefined][] =
      [["changes", p.changes], ["conditions", p.conditions], ["events", p.events]];
    for (const [field, refs] of stateLinks) {
      (refs ?? []).forEach((ref, i) => {
        used.add(ref.object);
        const path: Path = [...base, field, i];
        const o = objs[ref.object];
        if (!o) {
          report("error", "unknown-object", `Unknown object "${ref.object}" in ${field} of ${label(model, id)}.`, [...path, "object"]);
          return;
        }
        for (const key of ["state", "from", "to"] as const) {
          const s = ref[key];
          if (s === undefined) continue;
          if (!o.states) report("error", "no-states", `${label(model, ref.object)} has no states, so ${field} cannot name state "${s}".`, [...path, key]);
          else if (!o.states.includes(s)) report("error", "unknown-state", `${label(model, ref.object)} has no state "${s}". States: ${o.states.join(", ")}.`, [...path, key]);
        }
        if (field === "changes" && ref.from !== undefined && ref.from === ref.to) {
          report("error", "no-state-change", `${label(model, id)} changes ${label(model, ref.object)} from "${ref.from}" to the same state.`, path);
        }
      });
    }
    for (const field of ["zoomsInto", "invokes"] as const) {
      (p[field] ?? []).forEach((ref, i) => {
        if (ref === id) report("error", "self-reference", `${label(model, id)} cannot refer to itself in ${field}.`, [...base, field, i]);
        else if (!isProcess(ref)) {
          report("error", isObject(ref) ? "not-a-process" : "unknown-process",
            isObject(ref) ? `"${ref}" in ${field} is an object; ${field} points to processes.` : `Unknown process "${ref}" in ${field} of ${label(model, id)}.`,
            [...base, field, i]);
        } else if (field === "zoomsInto") {
          const earlier = parentOf.get(ref);
          if (earlier && earlier !== id) {
            report("error", "two-parents", `${label(model, ref)} is a subprocess of both ${label(model, earlier)} and ${label(model, id)}.`, [...base, field, i]);
          } else parentOf.set(ref, id);
        }
      });
    }

    // OPM: a process transforms at least one object, directly or through its subprocesses
    const transforms = (p.consumes?.length ?? 0) + (p.yields?.length ?? 0) + (p.affects?.length ?? 0) + (p.changes?.length ?? 0);
    if (!transforms && !p.zoomsInto?.length) {
      report("error", "no-transformation", `${label(model, id)} does not transform any object. Add consumes, yields, affects or changes.`, base);
    }

    // an instrument or agent is not transformed by the same process
    const transformed = new Set([...(p.consumes ?? []), ...(p.yields ?? []), ...(p.affects ?? []), ...(p.changes ?? []).map((c) => c.object)]);
    for (const field of ["requires", "handledBy"] as const) {
      (p[field] ?? []).forEach((ref, i) => {
        if (transformed.has(ref)) {
          report("error", "enabler-transformed", `${label(model, ref)} is both an enabler (${field}) and transformed by ${label(model, id)}.`, [...base, field, i]);
        }
      });
    }
    (p.consumes ?? []).forEach((ref, i) => {
      if (p.yields?.includes(ref)) {
        report("warning", "consume-and-yield", `${label(model, id)} consumes and yields ${label(model, ref)}; use affects or changes instead.`, [...base, "consumes", i]);
      }
    });
    (p.handledBy ?? []).forEach((ref, i) => {
      const o = objs[ref];
      if (o && essence(o) !== "physical") {
        report("warning", "agent-not-physical", `${label(model, ref)} handles ${label(model, id)}, but an agent is a human and should have essence physical. Use requires for systems.`, [...base, "handledBy", i]);
      }
    });
    for (const link of linksOf(id, p)) {
      if (["consumes", "yields", "affects", "changes"].includes(link.kind) && objs[link.target]?.role === "module") {
        report("warning", "module-transformed", `${label(model, id)} transforms the module ${label(model, link.target)}. Modules are normally instruments (requires).`, base);
      }
    }
  }
  for (const cycle of findCycles(Object.keys(procs), (id) => (procs[id].zoomsInto ?? []).filter(isProcess))) {
    report("error", "cycle", `Cycle in zoomsInto: ${cycle.map((c) => label(model, c)).join(" → ")}.`, ["processes", cycle[0], "zoomsInto"]);
  }

  // views
  for (const [id, v] of Object.entries(model.views ?? {})) {
    if (v.process !== undefined && !isProcess(v.process)) report("error", "unknown-process", `Unknown process "${v.process}" in view ${id}.`, ["views", id, "process"]);
    (v.things ?? []).forEach((ref, i) => {
      if (!isObject(ref) && !isProcess(ref)) report("error", "unknown-thing", `Unknown object or process "${ref}" in view ${id}.`, ["views", id, "things", i]);
    });
  }

  // unused objects
  for (const id of Object.keys(objs)) {
    if (!used.has(id)) report("warning", "unused-object", `${label(model, id)} is not linked to any process or object.`, ["objects", id]);
  }

  // data definitions in JSON Schema
  for (const [id, o] of Object.entries(objs)) checkSchema(model, id, o, options, report);
  return out;
}

function checkSchema(model: Model, id: string, o: ObjectDef, options: ValidateOptions,
                     report: (s: Severity, c: string, m: string, p: Path) => void): void {
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
