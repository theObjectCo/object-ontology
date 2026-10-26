import { Model, objects, processes } from "../model";
import { EditError } from "./contracts";

export const ID = /^[a-z][A-Za-z0-9]*$/;

export function idFromLabel(label: string): string {
  const words = label.normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, "")).filter(Boolean);
  if (!words.length) return "";
  const id = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join("");
  return /^[a-z]/.test(id) ? id : `x${id}`;
}

export function takenIds(model: Model): Set<string> {
  return new Set([...Object.keys(objects(model)), ...Object.keys(processes(model)), ...Object.keys(model.views ?? {}), "system", "structure"]);
}

export function uniqueId(model: Model, base: string, taken = takenIds(model)): string {
  const root = ID.test(base) ? base : idFromLabel(base) || "thing";
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) if (!taken.has(`${root}${i}`)) return `${root}${i}`;
}

export function groupOf(model: Model, id: string): "objects" | "processes" {
  if (objects(model)[id]) return "objects";
  if (processes(model)[id]) return "processes";
  throw new EditError(`Unknown element "${id}".`);
}

export function checkId(model: Model, id: string, except?: string) {
  if (!ID.test(id)) throw new EditError(`"${id}" is not a valid identifier: use camelCase starting with a lowercase letter.`);
  if (id !== except && takenIds(model).has(id)) throw new EditError(`"${id}" is already used.`);
}
