import { checkNewId, checkState, need, str, thingOrFail } from "./arguments";
import { Tool, ToolError } from "./contracts";
import { plural } from "./diagnostics";
import { edit } from "./editing";
import { AUTHORITY_ID, CAPABILITY_ID, DEPLOYMENT_NAME, ID_ARG, NULLABLE_TEXT, PATH } from "./schemas";

export const elementTools: Tool[] = [

  {
    name: "opm_rename",
    title: "Rename an identifier or a state",
    readOnly: false,
    description: `Renames the identifier of an object or a process, or a state of an object, and writes the file. Every reference follows: links, zoomsInto, custom views, layout keys, and in user stories the lanes, step lanes, step processes, handed-over objects, receiving lanes and handed-over states.

Parameters:
- path: absolute path of the *.opm.json file.
- id: the object or process (for a state rename: the object that has the state).
- newId: the new identifier (camelCase). Give either newId, or state and newState.
- state, newState: rename the state "state" of object "id" to "newState".

The label is not changed: a thing without an explicit label shows the label derived from the new id. To change the label, use opm_set.

Returns the same JSON as every edit tool.

Examples: {"path": "...", "id": "priceResult", "newId": "quote"}; {"path": "...", "id": "snapshot", "state": "valid", "newState": "current"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Object or process identifier."),
        newId: ID_ARG("New identifier, camelCase."),
        state: ID_ARG("State of the object to rename."),
        newState: ID_ARG("New state name."),
      },
      required: ["path", "id"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const id = need(args, "id", "the object or process");
      const newId = str(args, "newId");
      const state = str(args, "state");
      const newState = str(args, "newState");
      if (newId && (state || newState)) throw new ToolError("Give either \"newId\", or \"state\" and \"newState\", not both.");
      if (newId) {
        thingOrFail(model, id);
        if (newId !== id) checkNewId(model, newId);
        s.apply({ op: "renameId", oldId: id, newId });
        return { ids: [newId] };
      }
      if (!state || !newState) throw new ToolError("Give \"newId\" to rename the thing, or \"state\" and \"newState\" to rename a state.");
      thingOrFail(model, id, "object");
      checkState(model, id, state);
      s.apply({ op: "renameState", object: id, oldState: state, newState });
      return { ids: [id] };
    }),
  },

  {
    name: "opm_set",
    title: "Set fields of a thing",
    readOnly: false,
    description: `Sets or removes descriptive fields of an object or a process and writes the file. Only the fields given change; null removes a field.

Parameters:
- path: absolute path of the *.opm.json file.
- id: the object or process.
- label: display label; null (or the label derived from the id) removes the explicit label.
- description: plain text.
- note: Markdown, kept apart from the description; the validator and OPL skip it.
- states: the full list of states of an object (at least two), or null to remove them. Links that name a removed state are left as they are and reported by the validator: to rename a state use opm_rename, which updates the links too.
- role: "module" or null (objects only).
- essence: "informatical", "physical" or null.
- affiliation: "systemic", "environmental" or null.
- schema: "file#/json/pointer" of the JSON Schema definition, or null (objects only).
- authority: "owns_<snake_case>" or null (objects only).
- capabilities: list of "can_<snake_case>" or null (objects only).
- owns: list of "owns_<snake_case>" or null (objects only).
- deploymentName: "<module>_v<major>.<minor>.<patch>" or null (objects only).
- capability: "can_<snake_case>" or null (processes only).

Returns the same JSON as every edit tool.

Example: {"path": "...", "id": "pricingModule", "deploymentName": "pricing_v1.2.0", "capabilities": ["can_price"]}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        id: ID_ARG("Object or process identifier."),
        label: NULLABLE_TEXT("Display label, or null to derive it from the id."),
        description: NULLABLE_TEXT("Description, or null to remove it."),
        note: NULLABLE_TEXT("Markdown note, or null to remove it."),
        states: { type: ["array", "null"], items: { type: "string" }, minItems: 2, description: "All states of the object, or null to remove them." },
        role: { type: ["string", "null"], enum: ["module", null], description: "\"module\" or null." },
        essence: { type: ["string", "null"], enum: ["informatical", "physical", null] },
        affiliation: { type: ["string", "null"], enum: ["systemic", "environmental", null] },
        schema: NULLABLE_TEXT("JSON Schema reference file#/pointer, or null."),
        authority: { type: ["string", "null"], pattern: AUTHORITY_ID.pattern as string, description: "Authority token (owns_<snake_case>), or null." },
        capabilities: { type: ["array", "null"], items: CAPABILITY_ID, uniqueItems: true, description: "Capabilities (can_<snake_case>) this module or agent provides, or null." },
        owns: { type: ["array", "null"], items: AUTHORITY_ID, uniqueItems: true, description: "Authorities (owns_<snake_case>) this module or agent holds, or null." },
        deploymentName: { type: ["string", "null"], pattern: DEPLOYMENT_NAME.pattern as string, description: "Deployment package name (<module>_v<major>.<minor>.<patch>), or null." },
        capability: { type: ["string", "null"], pattern: CAPABILITY_ID.pattern as string, description: "Capability token (can_<snake_case>) of a process, or null." },
      },
      required: ["path", "id"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const id = need(args, "id", "the object or process");
      const kind = thingOrFail(model, id);
      const allFields = ["label", "description", "note", "states", "role", "essence", "affiliation", "schema", "authority", "capabilities", "owns", "deploymentName", "capability"];
      const fields = allFields.filter((f) => f in args);
      if (!fields.length) throw new ToolError(`Nothing to set: give at least one of ${allFields.join(", ")}.`);
      if (kind === "process") {
        const bad = fields.filter((f) => f === "states" || f === "role" || f === "schema" || f === "authority" || f === "capabilities" || f === "owns" || f === "deploymentName");
        if (bad.length) throw new ToolError(`A process has no ${bad.join(", ")}; these fields belong to objects.`);
      } else {
        const bad = fields.filter((f) => f === "capability");
        if (bad.length) throw new ToolError(`An object has no ${bad.join(", ")}; this field belongs to processes.`);
      }
      if ("label" in args) s.apply({ op: "setLabel", id, label: (args.label as string | null) ?? null });
      const patch = Object.fromEntries(fields.filter((f) => f !== "label").map((f) => [f, args[f] ?? null]));
      if (Object.keys(patch).length) s.apply({ op: "updateElement", id, patch });
      return { ids: [id] };
    }),
  },

  {
    name: "opm_delete",
    title: "Delete things or states",
    readOnly: false,
    destructive: true,
    description: `Deletes objects, processes or states and writes the file.

Parameters:
- path: absolute path of the *.opm.json file.
- ids (optional): objects and processes to delete. Each goes with every link that points at it, its zoomsInto entries, custom views built on it and its layout positions. User stories are left as they are, because steps are written by people: the validator then reports the steps that name a deleted thing, and they appear in "introduced".
- states (optional): [{"object": "...", "state": "..."}] states to delete. Links that name the state stay without it; a change whose target state is deleted becomes "affects".

Returns the same JSON as every edit tool.

Example: {"path": "...", "ids": ["hash"], "states": [{"object": "priceResult", "state": "partial"}]}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        ids: { type: "array", items: { type: "string" }, description: "Objects and processes to delete." },
        states: {
          type: "array",
          items: { type: "object", properties: { object: { type: "string" }, state: { type: "string" } }, required: ["object", "state"], additionalProperties: false },
          description: "States to delete.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const ids = (args.ids as string[] | undefined) ?? [];
      const states = (args.states as { object: string; state: string }[] | undefined) ?? [];
      if (!ids.length && !states.length) throw new ToolError("Nothing to delete: give \"ids\", \"states\" or both.");
      for (const id of ids) thingOrFail(model, id);
      for (const st of states) {
        thingOrFail(model, st.object, "object");
        checkState(model, st.object, st.state);
      }
      for (const st of states) if (!ids.includes(st.object)) s.apply({ op: "deleteState", object: st.object, state: st.state });
      if (ids.length) s.apply({ op: "deleteElements", ids });
      return { message: `Deleted ${[ids.length ? plural(ids.length, "thing") : "", states.length ? plural(states.length, "state") : ""].filter(Boolean).join(" and ")}.` };
    }),
  }
];
