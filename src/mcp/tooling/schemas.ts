import modelSchema from "../../../schema/opm-model.schema.json";
import { Json } from "./contracts";

// ---------------------------------------------------------------- schemas of the arguments

export const PATH = { type: "string", description: "Absolute path of the *.opm.json model file." };

export const ID_ARG = (what: string) => ({ type: "string", description: what });

export const NULLABLE_TEXT = (what: string) => ({ type: ["string", "null"], description: what });

/** A definition of the model format schema with its $refs replaced by the definitions they point to. */
export function inlineDef(name: string): Json {
  const defs = (modelSchema as unknown as { $defs: Record<string, Json> }).$defs;
  const inline = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(inline);
    if (!v || typeof v !== "object") return v;
    const o = v as Json;
    if (typeof o.$ref === "string" && o.$ref.startsWith("#/$defs/")) {
      const { $ref, ...rest } = o;
      return { ...(inline(defs[$ref.slice(8)]) as Json), ...(inline(rest) as Json) };
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, inline(x)]));
  };
  return inline(defs[name]) as Json;
}

export const STORY_SCHEMA = inlineDef("story");

export const CAPABILITY_ID = inlineDef("capabilityId");

export const AUTHORITY_ID = inlineDef("authorityId");

export const DEPLOYMENT_NAME = inlineDef("deploymentName");

export const READ = { readOnly: true };
