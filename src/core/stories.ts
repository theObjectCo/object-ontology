import { Model, StoryDef, descendants, essence, humanize, objects, parents, processes, refIds, refObject } from "./model";

export function stories(model: Model): Record<string, StoryDef> {
  return model.stories ?? {};
}

export function storyTitle(id: string, s: StoryDef): string {
  return s.title ?? humanize(id);
}

export type LaneKind = "agent" | "module";

/** A lane is a module or an agent (a physical object); anything else cannot be one. */
export function laneKind(model: Model, id: string): LaneKind | undefined {
  const o = objects(model)[id];
  if (!o) return undefined;
  if (o.role === "module") return "module";
  return essence(o) === "physical" ? "agent" : undefined;
}

/**
 * A process with its subprocesses at every depth and the processes it belongs to. The system view carries
 * the links of subprocesses on their parents, so a step may name any of these levels.
 */
export function relatedProcesses(model: Model, id: string): string[] {
  const out = [id, ...descendants(model, id)];
  const seen = new Set(out);
  const parentOf = parents(model);
  for (let p = parentOf.get(id); p !== undefined && !seen.has(p); p = parentOf.get(p)) {
    seen.add(p);
    out.push(p);
  }
  return out;
}

/** True if an agent handles the process or a module is required by it, at any related level. */
export function takesPart(model: Model, lane: string, process: string): boolean {
  const o = objects(model)[lane];
  if (!o) return false;
  const procs = processes(model);
  return relatedProcesses(model, process).some((pid) => {
    const p = procs[pid];
    if (!p) return false;
    if (o.role === "module" && (p.requires ?? []).some((r) => refObject(r) === lane)) return true;
    return essence(o) === "physical" && refIds(p.handledBy).includes(lane);
  });
}

/** True if the process, at any related level, consumes, yields, affects, changes, requires or has as a condition the object. */
export function usesObject(model: Model, process: string, object: string): boolean {
  const procs = processes(model);
  return relatedProcesses(model, process).some((pid) => {
    const p = procs[pid];
    if (!p) return false;
    return [
      ...(p.consumes ?? []).map(refObject), ...(p.yields ?? []).map(refObject), ...refIds(p.affects),
      ...(p.changes ?? []).map((c) => c.object), ...(p.requires ?? []).map(refObject), ...(p.conditions ?? []).map((c) => c.object),
    ].includes(object);
  });
}

/**
 * Where the hand-over of a step lands: the next step in the target lane, or, when that lane has no later
 * step, the target lane in the column after the step. Columns are the steps in time order.
 */
export function handOverTarget(story: StoryDef, index: number): { step?: number; column: number } | undefined {
  const h = story.steps?.[index]?.handsOver;
  if (!h) return undefined;
  const next = story.steps.findIndex((s, k) => k > index && s.lane === h.to);
  return next >= 0 ? { step: next, column: next } : { column: index + 1 };
}

/** The story, step and lane a diagnostic path points into, e.g. ["stories", "x", "steps", 2, "lane"]. */
export function storyPlace(path: (string | number)[]): { story?: string; step?: number; lane?: number } {
  if (path[0] !== "stories" || typeof path[1] !== "string") return {};
  return {
    story: path[1],
    step: path[2] === "steps" && typeof path[3] === "number" ? path[3] : undefined,
    lane: path[2] === "lanes" && typeof path[3] === "number" ? path[3] : undefined,
  };
}
