import { editorLinks } from "../../core/links";
import { checkState, need, str, thingOrFail } from "./arguments";
import { Tool, ToolError } from "./contracts";
import { plural } from "./diagnostics";
import { edit } from "./editing";
import { LINK_KINDS, LINK_KIND_NAMES, checkEnds, linkInfo } from "./linkSupport";
import { ID_ARG, PATH } from "./schemas";

export const linkTools: Tool[] = [

  {
    name: "opm_link",
    title: "Add a link",
    readOnly: false,
    description: `Adds a link between two things and writes the file. The link is stored in a field of the "owner", exactly as in the JSON format: {"kind": "requires", "owner": "pricing", "target": "snapshot"} writes "snapshot" into processes.pricing.requires.

Parameters:
- path: absolute path of the *.opm.json file.
- kind: the field of the format:
  - stored on a process, pointing at an object: handledBy (agent), requires (instrument), consumes, yields, affects, changes (state change), conditions, events;
  - stored on a process, pointing at a process: invokes, zoomsInto (makes target a subprocess of owner);
  - stored on an object, pointing at an object: exhibits, tagged;
  - stored on an object or a process, pointing at the same kind: consistsOf, isA (isA holds one target and replaces the previous one).
- owner: the thing whose field holds the link (the process, for every procedural link).
- target: the thing the link points at.
- state (optional): a state of the target object, for requires, consumes, yields, conditions and events.
- fromState, toState: for "changes"; toState is required, fromState optional.
- tag: for "tagged", the phrase of the sentence, e.g. "is made for" gives "Price Request is made for Customer."
- note (optional): Markdown note on the link. Given for a link that already exists, it sets the note of that link.
- index (optional): for zoomsInto, position among the subprocesses.

States must exist on the object; unknown ids and wrong ends are refused before anything is written. Adding a link that already exists changes nothing.

Returns the same JSON as every edit tool.

Examples: {"path": "...", "kind": "conditions", "owner": "pricing", "target": "snapshot", "state": "valid"}; {"path": "...", "kind": "changes", "owner": "expiring", "target": "snapshot", "fromState": "valid", "toState": "expired"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        kind: { type: "string", enum: LINK_KIND_NAMES, description: "Field of the format that holds the link." },
        owner: ID_ARG("The thing whose field holds the link."),
        target: ID_ARG("The thing the link points at."),
        state: ID_ARG("State of the target object (requires, consumes, yields, conditions, events)."),
        fromState: ID_ARG("For changes: the state before."),
        toState: ID_ARG("For changes: the state after (required)."),
        tag: ID_ARG("For tagged: the phrase between the two labels."),
        note: { type: "string", description: "Markdown note on the link." },
        index: { type: "integer", minimum: 0, description: "For zoomsInto: position among the subprocesses." },
      },
      required: ["path", "kind", "owner", "target"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const kind = need(args, "kind", "the link field");
      const owner = need(args, "owner", "the thing that stores the link");
      const target = need(args, "target", "the thing the link points at");
      checkEnds(model, kind, owner, target);
      const spec = LINK_KINDS[kind];
      const state = str(args, "state");
      const fromState = str(args, "fromState");
      const toState = str(args, "toState");
      const note = str(args, "note");
      if (state && !spec.state) throw new ToolError(`A ${kind} link has no "state"${kind === "affects" ? "; a link with states is \"changes\", with fromState and toState" : ""}.`);
      if ((fromState || toState) && kind !== "changes") throw new ToolError(`"fromState" and "toState" belong to "changes" links only${spec.state ? `; for ${kind} use "state"` : ""}.`);
      if (str(args, "tag") && kind !== "tagged") throw new ToolError("\"tag\" belongs to \"tagged\" links only.");
      if (args.index !== undefined && kind !== "zoomsInto") throw new ToolError("\"index\" belongs to \"zoomsInto\" links only.");
      if (state) checkState(model, target, state);
      if (kind === "changes") {
        if (!toState) throw new ToolError("A \"changes\" link needs \"toState\" (and optionally \"fromState\"); a change without states is \"affects\".");
        checkState(model, target, toState);
        if (fromState) checkState(model, target, fromState);
      }
      if (kind === "zoomsInto") {
        if (note) throw new ToolError("A zoomsInto entry cannot carry a note; put the note on the subprocess with opm_set.");
        s.apply({ op: "addSubprocess", parent: owner, id: target, index: typeof args.index === "number" ? args.index : undefined });
        return;
      }
      const editor = spec.editor!;
      // the editor's link kinds read from the object to the process for links that a process stores about an object
      const objectFirst = spec.owner === "process" && spec.target === "object" && kind !== "yields";
      const [from, to] = objectFirst ? [target, owner] : [owner, target];
      const existing = editorLinks(model).find((l) => {
        const i = linkInfo(l);
        return i.kind === kind && i.owner === owner && i.target === target && i.state === state && i.fromState === fromState && i.toState === toState && (kind !== "tagged" || i.tag === (str(args, "tag") || "relates to"));
      });
      if (existing) {
        if (note !== undefined && note !== existing.note) {
          s.apply({ op: "updateLink", id: existing.id, note });
          return { message: "The link already existed; its note was set." };
        }
        return { message: "The link already exists; nothing changed." };
      }
      s.apply({
        op: "addLink", kind: editor, from, to,
        fromState: kind === "changes" ? fromState : objectFirst ? state : undefined,
        toState: kind === "changes" ? toState : kind === "yields" ? state : undefined,
        tag: str(args, "tag"),
        note,
      });
    }),
  },

  {
    name: "opm_unlink",
    title: "Remove a link",
    readOnly: false,
    destructive: true,
    description: `Removes a link and writes the file. The link is named the same way as in opm_link: the field (kind), the thing that stores it (owner) and the thing it points at (target).

Parameters:
- path: absolute path of the *.opm.json file.
- kind: handledBy, requires, consumes, yields, affects, changes, conditions, events, invokes, zoomsInto, consistsOf, exhibits, isA or tagged.
- owner, target: identifiers.
- state (optional): when the owner has several links of this kind to the target in different states, removes only the one that names this state (for changes, the fromState or the toState).

Every matching link is removed. For zoomsInto the subprocess leaves its parent but stays in the model. An empty field is removed with its last entry.

Returns the same JSON as every edit tool.

Example: {"path": "...", "kind": "requires", "owner": "pricing", "target": "customer"}`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        kind: { type: "string", enum: LINK_KIND_NAMES },
        owner: ID_ARG("The thing whose field holds the link."),
        target: ID_ARG("The thing the link points at."),
        state: ID_ARG("Optional: only the link that names this state."),
      },
      required: ["path", "kind", "owner", "target"],
      additionalProperties: false,
    },
    handler: (args) => edit(args.path, (s, model) => {
      const kind = need(args, "kind", "the link field");
      const owner = need(args, "owner", "the thing that stores the link");
      const target = need(args, "target", "the thing the link points at");
      if (!LINK_KINDS[kind]) throw new ToolError(`Unknown link kind "${kind}". Known: ${LINK_KIND_NAMES.join(", ")}.`);
      thingOrFail(model, owner);
      if (kind === "zoomsInto") {
        s.apply({ op: "removeSubprocess", parent: owner, id: target });
        return { message: `${target} is no longer a subprocess of ${owner}.` };
      }
      const state = str(args, "state");
      const own = editorLinks(model).filter((l) => String(l.path[1]) === owner);
      const matches = own.filter((l) => {
        const i = linkInfo(l);
        return i.kind === kind && i.target === target && (state === undefined || [i.state, i.fromState, i.toState].includes(state));
      });
      if (!matches.length) {
        const list = own.map(linkInfo).map((i) => `${i.kind} ${i.target}${i.state ? ` (${i.state})` : ""}${i.toState ? ` (${i.fromState ?? ""}->${i.toState})` : ""}`);
        throw new ToolError(`${owner} has no ${kind} link to ${target}${state ? ` in state "${state}"` : ""}. Its links: ${list.join("; ") || "none"}.`);
      }
      s.apply({ op: "deleteElements", ids: [], links: matches.map((l) => l.id) });
      return { message: `Removed ${plural(matches.length, "link")}.` };
    }),
  }
];
