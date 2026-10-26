import { Tool, ToolError } from "./contracts";
import { addThing, edit } from "./editing";
import { AUTHORITY_ID, CAPABILITY_ID, DEPLOYMENT_NAME, ID_ARG, PATH } from "./schemas";

export const creationTools: Tool[] = [


  // ------------------------------------------------------------ edits

  {
    name: "opm_add_object",
    title: "Add an object",
    readOnly: false,
    description: `Adds an object to a model and writes the file. Every edit tool writes a minimal change of the JSON text (the rest of the file keeps its formatting), validates the result and returns the diagnostics.

Parameters:
- path: absolute path of the *.opm.json file.
- id and/or label: the identifier (camelCase, e.g. "priceResult") and the display label. With only a label the id is derived from it; with only an id the label is derived from the id and not written.
- description, note (Markdown, skipped by OPL), states (at least two names), essence ("informatical" default, "physical" for agents and material things), affiliation ("systemic" default, "environmental" for things outside the system), role ("module" for a part of the system that processes require), schema ("file#/json/pointer" relative to the model).
- authority ("owns_<snake_case>", for domain fact objects), capabilities (list of "can_<snake_case>" for modules/agents), owns (list of "owns_<snake_case>" for modules/agents), deploymentName ("<module>_v<major>.<minor>.<patch>" for modules).
- view (optional): a custom view with a "things" list to add the object to.

Returns JSON: changed, ids (the new identifier), summary, "introduced" (diagnostics the edit added), resolved (how many it removed) and all diagnostics after the edit. A new object linked to nothing gets an "unused-object" warning until opm_link connects it.

Example: {"path": "C:/work/model.opm.json", "id": "invoice", "states": ["draft", "sent"], "authority": "owns_invoice"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Identifier, camelCase."),
        label: ID_ARG("Display label."),
        description: { type: "string" },
        note: { type: "string", description: "Markdown note; skipped by the validator and OPL." },
        states: { type: "array", items: { type: "string" }, minItems: 2, description: "State names, at least two." },
        essence: { type: "string", enum: ["informatical", "physical"] },
        affiliation: { type: "string", enum: ["systemic", "environmental"] },
        role: { type: "string", enum: ["module"] },
        schema: { type: "string", description: "JSON Schema definition, file#/json/pointer relative to the model." },
        authority: AUTHORITY_ID,
        capabilities: { type: "array", items: CAPABILITY_ID, uniqueItems: true, description: "Capabilities (can_<snake_case>) this module or agent provides." },
        owns: { type: "array", items: AUTHORITY_ID, uniqueItems: true, description: "Authorities (owns_<snake_case>) this module or agent holds." },
        deploymentName: DEPLOYMENT_NAME,
        view: ID_ARG("Optional custom view (with a things list) to add the object to."),
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const { description, note, states, essence: ess, affiliation, role, schema, authority, capabilities, owns, deploymentName } = args;
      const id = addThing(s, model, "object", args, { description, note, states, essence: ess, affiliation, role, schema, authority, capabilities, owns, deploymentName });
      return { ids: [id] };
    }),
  },

  {
    name: "opm_add_process",
    title: "Add a process",
    readOnly: false,
    description: `Adds a process to a model and writes the file, optionally as a subprocess of another process.

Parameters:
- path: absolute path of the *.opm.json file.
- id and/or label: as in opm_add_object (e.g. id "invoicing").
- parent (optional): the process this one is a subprocess of; it is added to the parent's zoomsInto.
- index (optional, with parent): position in the parent's execution order, 0 = first; at the end when omitted.
- description, note, essence, affiliation: as in opm_add_object.
- capability (optional): capability token "can_<snake_case>" representing this process in P28.
- view (optional): a custom view with a "things" list to add the process to.

Returns the same JSON as every edit tool. A new process has the error "no-transformation" until it consumes, yields, affects or changes an object: link it with opm_link.

Example: {"path": "C:/work/model.opm.json", "id": "discounting", "parent": "pricing", "index": 1, "capability": "can_discount"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Identifier, camelCase."),
        label: ID_ARG("Display label."),
        parent: ID_ARG("Optional parent process (zoomsInto)."),
        index: { type: "integer", minimum: 0, description: "Position among the parent's subprocesses, 0 = first." },
        description: { type: "string" },
        note: { type: "string", description: "Markdown note; skipped by the validator and OPL." },
        essence: { type: "string", enum: ["informatical", "physical"] },
        affiliation: { type: "string", enum: ["systemic", "environmental"] },
        capability: CAPABILITY_ID,
        view: ID_ARG("Optional custom view (with a things list) to add the process to."),
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      if (args.index !== undefined && !args.parent) throw new ToolError("\"index\" needs \"parent\".");
      const { description, note, essence: ess, affiliation, capability } = args;
      const id = addThing(s, model, "process", args, { description, note, essence: ess, affiliation, capability });
      if (typeof args.index === "number") s.apply({ op: "reorderSubprocess", parent: String(args.parent), id, index: args.index });
      return { ids: [id] };
    }),
  }
];
