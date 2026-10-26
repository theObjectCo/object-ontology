import { Model, TEXT_FIELDS, objects, processes } from "../model";
import { EditError, EditResult, Fragment, Operation, Positions } from "./contracts";
import { Doc } from "./document";
import { takenIds, uniqueId } from "./identifiers";
import { round } from "./layout";
import { targetKey } from "./references";

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

export function paste(doc: Doc, model: Model, op: Extract<Operation, { op: "paste" }>): Partial<EditResult> {
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

export function clipboardOperations(doc: Doc, model: Model, op: Extract<Operation, { op: "paste" }>): Partial<EditResult> {
  switch (op.op) {

    case "paste":
      return paste(doc, model, op);
  }
}
