import { Model, TEXT_FIELDS, objects, processes } from "../model";
import { JsonPath } from "./contracts";
import { Doc } from "./document";
import { groupOf } from "./identifiers";

/** Renames a thing everywhere: references, story steps, its key, and its layout keys. */
export function rename(doc: Doc, model: Model, oldId: string, newId: string) {
  const group = groupOf(model, oldId);
  for (const path of [...referencePaths(model, oldId), ...storyPaths(model, oldId)]) doc.replaceString(path, newId);
  doc.renameKey([group, oldId], newId);
  for (const [vid, positions] of Object.entries(model.layout ?? {})) {
    if (oldId in positions) doc.renameKey(["layout", vid, oldId], newId);
  }
  if (model.layout?.[oldId]) doc.renameKey(["layout", oldId], newId);
}

/** Paths of every string that refers to a thing, for renaming and deleting. */
export function referencePaths(model: Model, id: string): JsonPath[] {
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

/**
 * Paths of the identifiers in user stories that refer to a thing. A rename follows them; a delete leaves
 * them, because a step is text written by a person, and the validator reports the reference.
 */
export function storyPaths(model: Model, id: string): JsonPath[] {
  const out: JsonPath[] = [];
  for (const [sid, s] of Object.entries(model.stories ?? {})) {
    (s.lanes ?? []).forEach((lane, i) => lane === id && out.push(["stories", sid, "lanes", i]));
    (s.steps ?? []).forEach((st, i) => {
      const at = ["stories", sid, "steps", i];
      if (st.lane === id) out.push([...at, "lane"]);
      if (st.process === id) out.push([...at, "process"]);
      if (st.handsOver?.object === id) out.push([...at, "handsOver", "object"]);
      if (st.handsOver?.to === id) out.push([...at, "handsOver", "to"]);
    });
  }
  return out;
}

/** The key that names the target in a link entry written as an object. */
export function targetKey(entry: object): "object" | "process" | undefined {
  return "object" in entry ? "object" : "process" in entry ? "process" : undefined;
}

export const byPathDesc = (a: JsonPath, b: JsonPath) => {
  const ka = a.map((x) => (typeof x === "number" ? String(x).padStart(6, "0") : x)).join("/");
  const kb = b.map((x) => (typeof x === "number" ? String(x).padStart(6, "0") : x)).join("/");
  return ka < kb ? 1 : ka > kb ? -1 : 0;
};

/** Removes a reference to a deleted thing: an array entry, an isA property, or a view pointing at it. */
export function removeReference(doc: Doc, path: JsonPath) {
  if (path[0] === "views" && path[2] === "process") return doc.remove(["views", path[1]]);
  const last = path[path.length - 1];
  const itemPath = last === "object" || last === "process" ? path.slice(0, -1) : path;
  if (typeof itemPath[itemPath.length - 1] !== "number") return doc.remove(itemPath);
  const listPath = itemPath.slice(0, -1);
  doc.remove(itemPath);
  const list = doc.value<unknown[]>(listPath);
  if (Array.isArray(list) && !list.length && listPath[2] !== "zoomsInto") doc.remove(listPath);
}
