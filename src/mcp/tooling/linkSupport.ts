import { EditorLink, EditorLinkKind } from "../../core/links";
import { Model } from "../../core/model";
import { thingOrFail } from "./arguments";
import { LinkInfo, ToolError } from "./contracts";

export function linkInfo(l: EditorLink): LinkInfo {
  const owner = String(l.path[1]);
  const kind = String(l.path[2]);
  const out: LinkInfo = { kind, owner, target: l.from === owner ? l.to : l.from };
  if (kind === "changes") {
    if (l.fromState) out.fromState = l.fromState;
    if (l.toState) out.toState = l.toState;
  } else if (l.fromState ?? l.toState) out.state = l.fromState ?? l.toState;
  if (l.tag) out.tag = l.tag;
  if (l.note) out.note = l.note;
  return out;
}

export type End = "object" | "process" | "same";

/** Every link field of the format: who stores it, what it points at, and the editor link kind behind it. */
export const LINK_KINDS: Record<string, { owner: End; target: End; editor?: EditorLinkKind; state?: boolean }> = {
  handledBy: { owner: "process", target: "object", editor: "agent" },
  requires: { owner: "process", target: "object", editor: "instrument", state: true },
  consumes: { owner: "process", target: "object", editor: "consumption", state: true },
  yields: { owner: "process", target: "object", editor: "result", state: true },
  affects: { owner: "process", target: "object", editor: "effect" },
  changes: { owner: "process", target: "object", editor: "effect" },
  conditions: { owner: "process", target: "object", editor: "condition", state: true },
  events: { owner: "process", target: "object", editor: "event", state: true },
  invokes: { owner: "process", target: "process", editor: "invocation" },
  zoomsInto: { owner: "process", target: "process" },
  consistsOf: { owner: "same", target: "same", editor: "aggregation" },
  exhibits: { owner: "object", target: "object", editor: "exhibition" },
  isA: { owner: "same", target: "same", editor: "generalization" },
  tagged: { owner: "object", target: "object", editor: "tagged" },
};

export const LINK_KIND_NAMES = Object.keys(LINK_KINDS);

export function checkEnds(model: Model, kind: string, owner: string, target: string) {
  const spec = LINK_KINDS[kind];
  if (!spec) throw new ToolError(`Unknown link kind "${kind}". Known: ${LINK_KIND_NAMES.join(", ")}.`);
  const ownerKind = thingOrFail(model, owner);
  const targetKind = thingOrFail(model, target);
  if (owner === target) throw new ToolError(`${owner} cannot link to itself.`);
  if (spec.owner !== "same" && ownerKind !== spec.owner) throw new ToolError(`${kind} is stored on a ${spec.owner}, and "${owner}" is ${ownerKind === "object" ? "an object" : "a process"}.`);
  if (spec.target === "same" ? targetKind !== ownerKind : targetKind !== spec.target) {
    const want = spec.target === "same" ? ownerKind : spec.target;
    throw new ToolError(`${kind} of ${owner} points at ${want === "object" ? "an object" : "a process"}, and "${target}" is ${targetKind === "object" ? "an object" : "a process"}.`);
  }
}
