import { applyEdits, modify, parse } from "jsonc-parser";
import { Model, ObjectDef, essence, objects, refIds, refObject } from "./model";

export interface SchemaDraft {
  /** The schema file text, the existing one with definitions inserted or a new one. */
  text: string;
  /** Objects that get a definition written now. */
  added: string[];
  /** Object -> value of its "schema" field, for every object to link to the file. */
  links: Record<string, string>;
}

/** Objects that hold data: informatical, not modules, without a schema of their own. */
export function dataObjects(model: Model): string[] {
  return Object.entries(objects(model))
    .filter(([, o]) => essence(o) === "informatical" && o.role !== "module" && !o.schema)
    .map(([id]) => id);
}

/** The schema file for a model: the one its objects already use, or <model>.schema.json next to it. */
export function schemaFileFor(model: Model, modelFile: string): string {
  const used = new Set(Object.values(objects(model)).map((o) => o.schema?.split("#")[0]).filter((f): f is string => !!f));
  if (used.size === 1) return [...used][0];
  return modelFile.replace(/^.*[\\/]/, "").replace(/\.opm\.json$/i, "") + ".schema.json";
}

/**
 * Definitions for the data objects of a model. States become an enum in a "state" property, parts and
 * attributes become properties that refer to their definitions, and a generalization becomes an allOf.
 * Definitions already in the file are kept as they are; the objects are linked to them all the same.
 */
export function draftSchema(model: Model, file: string, existing?: string): SchemaDraft {
  const ids = dataObjects(model);
  const present = new Set(Object.keys((existing ? (parse(existing) as { $defs?: object })?.$defs : undefined) ?? {}));
  const defined = new Set([...ids, ...present]);
  const ref = (id: string) => (defined.has(id) ? { $ref: `#/$defs/${id}` } : {});
  const definition = (o: ObjectDef) => {
    const properties: Record<string, unknown> = {};
    if (o.states?.length) properties.state = { enum: o.states };
    for (const part of [...refIds(o.consistsOf), ...refIds(o.exhibits)]) properties[part] = ref(part);
    return {
      ...(o.description ? { description: o.description } : {}),
      type: "object",
      ...(o.states?.length ? { required: ["state"] } : {}),
      properties,
      ...(o.isA && defined.has(refObject(o.isA)) ? { allOf: [ref(refObject(o.isA))] } : {}),
    };
  };
  const added = ids.filter((id) => !present.has(id));
  let text = existing ?? JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `Data definitions for ${model.name ?? "the model"}`,
    $defs: {},
  }, null, 2) + "\n";
  for (const id of added) {
    text = applyEdits(text, modify(text, ["$defs", id], definition(objects(model)[id]), { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
  }
  return { text, added, links: Object.fromEntries(ids.map((id) => [id, `${file}#/$defs/${id}`])) };
}
