import { EditorLink } from "./links";
import { Model, essence, label, objects, processes, refIds, refObject } from "./model";
import { laneKind, stories, storyTitle, takesPart, usesObject } from "./stories";
import { listViews, viewContent } from "./viewmodel";
import type { Path, Severity } from "./validate";

const OBJECT_TO_PROCESS = new Set(["agent", "instrument", "consumption", "effect", "condition", "event"]);

/** Which kinds the two ends of a link must be. */
function expectedEnds(l: EditorLink, ownerIsObject: boolean): ["object" | "process", "object" | "process"] {
  if (OBJECT_TO_PROCESS.has(l.kind)) return ["object", "process"];
  if (l.kind === "result") return ["process", "object"];
  if (l.kind === "invocation") return ["process", "process"];
  if (l.kind === "exhibition" || l.kind === "tagged") return ["object", "object"];
  return ownerIsObject ? ["object", "object"] : ["process", "process"];
}

function fieldOf(l: EditorLink): string {
  return String(l.path[2]);
}

/** The key that names the target when the link entry is written as an object, e.g. {"object": ..., "note": ...}. */
function entryKey(model: Model, l: EditorLink): "object" | "process" | undefined {
  const group = l.path[0] === "objects" ? objects(model) : processes(model);
  let v: unknown = (group[l.path[1] as string] as Record<string, unknown>)?.[l.path[2] as string];
  if (l.path.length > 3) v = Array.isArray(v) ? v[l.path[3] as number] : undefined;
  if (!v || typeof v !== "object") return undefined;
  return "process" in v ? "process" : "object";
}

function statePathOf(l: EditorLink, end: "from" | "to"): Path {
  const field = l.path[2];
  if (field === "changes") return [...l.path, end];
  if (field === "conditions" || field === "events" || field === "requires" || field === "consumes" || field === "yields") return [...l.path, "state"];
  return l.path;
}

function elementOf(path: Path): string | undefined {
  return (path[0] === "objects" || path[0] === "processes") && typeof path[1] === "string" ? path[1] : undefined;
}

export type Report = (s: Severity, c: string, m: string, p: Path, e?: string) => void;

/** P28 capability, authority and deployment checks. */
export function checkCapabilities(model: Model, report: Report): void {
  const objs = objects(model);
  const procs = processes(model);
  const L = (id: string) => label(model, id);
  const authorityOwner = new Map<string, string>();

  for (const [id, o] of Object.entries(objs)) {
    const isPerformer = o.role === "module" || essence(o) === "physical";
    if (!isPerformer && (o.capabilities?.length || o.owns?.length || o.deploymentName)) {
      report("warning", "p28-not-performer",
        `${L(id)} declares capabilities, owns or deploymentName, which belong on a module or an agent (physical object).`,
        ["objects", id]);
    }
    (o.owns ?? []).forEach((auth, i) => {
      const earlier = authorityOwner.get(auth);
      if (earlier && earlier !== id) {
        report("warning", "duplicate-authority",
          `Both ${L(earlier)} and ${L(id)} claim authority "${auth}" in owns (Rule 1: one owner per fact).`,
          ["objects", id, "owns", i], id);
      } else {
        authorityOwner.set(auth, id);
      }
    });
  }

  for (const [pid, p] of Object.entries(procs)) {
    if (!p.capability) continue;
    const performers = [
      ...(p.requires ?? []).map(refObject).filter((oid) => objs[oid]?.role === "module"),
      ...refIds(p.handledBy).filter((oid) => objs[oid] && essence(objs[oid]) === "physical"),
    ];
    for (const oid of performers) {
      const o = objs[oid];
      if (o?.capabilities?.length && !o.capabilities.includes(p.capability)) {
        report("warning", "missing-capability",
          `${L(oid)} performs ${L(pid)} (${p.capability}), but its capabilities list does not include "${p.capability}".`,
          ["objects", oid, "capabilities"], oid);
      }
    }
  }
}

/** User stories: lanes are agents or modules of the model, steps name its processes and objects. */
export function checkStories(model: Model, report: Report): void {
  const objs = objects(model);
  const procs = processes(model);
  const L = (id: string) => label(model, id);
  const unknown = (what: "object" | "process", id: string, where: string, path: Path) => {
    const wrong = what === "object" ? id in procs : id in objs;
    if (wrong) report("error", what === "object" ? "not-an-object" : "not-a-process", `"${id}" in ${where} is ${what === "object" ? "a process" : "an object"}; it needs ${what === "object" ? "an object" : "a process"}.`, path);
    else report("error", `unknown-${what}`, `Unknown ${what} "${id}" in ${where}.`, path);
  };
  for (const [sid, s] of Object.entries(stories(model))) {
    const base: Path = ["stories", sid];
    const title = storyTitle(sid, s);
    const lanes = (s.lanes ?? []).filter((l) => typeof l === "string");
    const steps = (s.steps ?? []).filter((st) => st && typeof st === "object");
    lanes.forEach((lane, i) => {
      const path: Path = [...base, "lanes", i];
      if (lanes.indexOf(lane) < i) report("error", "duplicate-lane", `${L(lane)} is listed twice in the lanes of story ${title}.`, path);
      else if (!(lane in objs)) unknown("object", lane, `the lanes of story ${title}`, path);
      else if (!laneKind(model, lane)) report("error", "lane-kind", `${L(lane)} cannot be a lane of story ${title}: a lane is an agent (essence physical) or a module.`, path);
      else if (!steps.some((st) => st.lane === lane)) report("warning", "empty-lane", `${L(lane)} has no step in story ${title}.`, path);
    });
    let handOvers = 0;
    steps.forEach((st, i) => {
      const at: Path = [...base, "steps", i];
      const where = `step ${i + 1} of story ${title}`;
      const laneOk = lanes.includes(st.lane);
      if (!laneOk) report("error", "lane-not-listed", `Lane "${st.lane}" of ${where} is not among the lanes of the story.`, [...at, "lane"]);
      const processOk = typeof st.process === "string" && st.process in procs;
      if (st.process !== undefined && !processOk) unknown("process", st.process, where, [...at, "process"]);
      const kind = laneOk ? laneKind(model, st.lane) : undefined;
      if (kind && processOk && !takesPart(model, st.lane, st.process!)) {
        const field = objs[st.lane].role === "module" && essence(objs[st.lane]) === "physical" ? "handledBy or requires" : kind === "agent" ? "handledBy" : "requires";
        report("warning", "lane-not-in-process",
          `${L(st.lane)} takes no part in ${L(st.process!)} (${where}): it is not in ${field} of the process, its subprocesses or the processes it belongs to.`, [...at, "process"]);
      }
      const h = st.handsOver;
      if (!h) return;
      handOvers++;
      if (!lanes.includes(h.to)) report("error", "lane-not-listed", `"${h.to}" in handsOver of ${where} is not among the lanes of the story.`, [...at, "handsOver", "to"]);
      const o = objs[h.object];
      if (!o) return unknown("object", h.object, `handsOver of ${where}`, [...at, "handsOver", "object"]);
      if (h.state !== undefined) {
        const statePath: Path = [...at, "handsOver", "state"];
        if (!o.states) report("error", "no-states", `${L(h.object)} has no states, so handsOver of ${where} cannot name state "${h.state}".`, statePath);
        else if (!o.states.includes(h.state)) report("error", "unknown-state", `${L(h.object)} has no state "${h.state}". States: ${o.states.join(", ")}.`, statePath);
      }
      if (processOk && !usesObject(model, st.process!, h.object)) {
        report("warning", "object-not-in-process",
          `${where[0].toUpperCase()}${where.slice(1)} hands over ${L(h.object)}, which ${L(st.process!)} does not consume, yield, affect, change, require or have as a condition.`, [...at, "handsOver", "object"]);
      }
    });
    if (steps.length && !handOvers) report("warning", "no-hand-over", `No step of story ${title} hands anything over.`, [...base, "steps"]);
  }
}

export function checkLayout(model: Model, report: (s: Severity, c: string, m: string, p: Path, e?: string) => void): void {
  const known = new Set(listViews(model).map((v) => v.id));
  for (const [viewId, positions] of Object.entries(model.layout ?? {})) {
    if (!known.has(viewId)) {
      report("info", "layout-view", `layout.${viewId}: there is no view "${viewId}".`, ["layout", viewId]);
      continue;
    }
    const content = viewContent(model, viewId)!;
    const nodes = new Set(content.nodes.map((n) => n.id));
    for (const id of Object.keys(positions)) {
      if (!nodes.has(id)) report("info", "layout-stale", `layout.${viewId}: position for "${id}", which is not in this view.`, ["layout", viewId, id], id);
    }
    // subprocesses inside a zoomed process have no position of their own: their order places them
    for (const id of content.nodes.filter((n) => !n.inside).map((n) => n.id)) {
      if (!(id in positions)) report("info", "layout-missing", `layout.${viewId}: no position for "${id}"; it is placed next to the things it is linked to.`, ["layout", viewId], id);
    }
  }
}

export { expectedEnds, fieldOf, entryKey, statePathOf, elementOf };
