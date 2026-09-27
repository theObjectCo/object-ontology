import * as fs from "fs";
import * as path from "path";
import { Node, ParseError, findNodeAtLocation, parseTree, printParseErrorCode } from "jsonc-parser";
import Ajv2020 from "ajv/dist/2020";
import modelSchema from "../../schema/opm-model.schema.json";
import { Model } from "./model";
import { Diagnostic, Path, validate } from "./validate";

export interface Parsed {
  model?: Model;
  tree?: Node;
  errors: Diagnostic[];
}

export function parse(text: string): Parsed {
  const parseErrors: ParseError[] = [];
  const tree = parseTree(text, parseErrors, { allowTrailingComma: false, disallowComments: true });
  if (parseErrors.length || !tree) {
    return {
      errors: parseErrors.map((e) => ({ severity: "error", code: "json", message: `JSON: ${printParseErrorCode(e.error)} at offset ${e.offset}.`, path: [] })),
    };
  }
  return { model: JSON.parse(text) as Model, tree, errors: [] };
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const checkStructure = ajv.compile(modelSchema);

/** Structural errors against the model format schema, with paths into the model. */
export function structureErrors(model: unknown): Diagnostic[] {
  if (checkStructure(model)) return [];
  const toPath = (pointer: string): Path =>
    pointer.split("/").slice(1).map((s) => (/^\d+$/.test(s) ? Number(s) : s.replace(/~1/g, "/").replace(/~0/g, "~")));
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const e of checkStructure.errors ?? []) {
    if (e.keyword === "oneOf" || e.keyword === "if" || e.keyword === "propertyNames") continue;
    const params = e.params as Record<string, unknown>;
    let path = toPath(e.instancePath);
    let message = `${e.instancePath || "model"} ${e.message ?? "is invalid"}.`;
    if (e.propertyName !== undefined) {
      path = [...path, e.propertyName];
      message = `"${e.propertyName}" is not a valid identifier: use camelCase starting with a lowercase letter, for example priceResult.`;
    } else if (typeof params.additionalProperty === "string") {
      path = [...path, params.additionalProperty];
      message = `Unknown field "${params.additionalProperty}" in ${e.instancePath || "the model"}.`;
    }
    const key = `${path.join("/")}|${message}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ severity: "error", code: "structure", message, path });
    }
  }
  return out;
}

/** Reads schema files relative to the model file, caching each one. */
export function schemaReader(modelFile: string): (file: string) => unknown | undefined {
  const cache = new Map<string, unknown>();
  return (file) => {
    const full = path.resolve(path.dirname(modelFile), file);
    if (!cache.has(full)) {
      try {
        cache.set(full, JSON.parse(fs.readFileSync(full, "utf-8")));
      } catch {
        cache.set(full, undefined);
      }
    }
    return cache.get(full);
  };
}

/** Parse, check the structure and validate the meaning of a model file. */
export function check(modelFile: string, text: string, structure = true): Parsed {
  const parsed = parse(text);
  if (!parsed.model) return parsed;
  const errors = structure ? structureErrors(parsed.model) : [];
  errors.push(...validate(parsed.model, { readSchema: schemaReader(modelFile) }));
  return { ...parsed, errors };
}

/** Offset and length of the value at a JSON path, or of its nearest existing ancestor. */
export function locate(tree: Node | undefined, p: Path): { offset: number; length: number } {
  if (!tree) return { offset: 0, length: 0 };
  for (let n = p.length; n >= 0; n--) {
    const node = findNodeAtLocation(tree, p.slice(0, n));
    if (node) {
      // an object or array value is marked by its property name; a scalar value by itself
      const container = node.type === "object" || node.type === "array";
      const target = container && node.parent?.type === "property" ? node.parent.children![0] : node;
      return { offset: target.offset, length: target.length };
    }
  }
  return { offset: 0, length: 0 };
}

export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
}
