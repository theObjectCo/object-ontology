import { Model, label } from "../model";
import { isModule, performers, quote, steps, unique, zoomed } from "./common";
import { icom } from "./idef0";

/** A swimlane: a module, an agent, or the lane of activities that nothing performs. */
export interface FlowLane {
  id?: string;
  kind: "module" | "agent" | "none";
}

export interface FlowActivity {
  process: string;
  lane: number;
}

/** From one activity to a later one: `next` for the step to the following activity, with the objects passed. */
export interface FlowEdge {
  from: number;
  to: number;
  objects: string[];
  next: boolean;
}

export interface Flow {
  process: string;
  lanes: FlowLane[];
  activities: FlowActivity[];
  edges: FlowEdge[];
}

/**
 * A swimlane activity diagram of a process with subprocesses. Each subprocess is an activity in the lane of
 * the first module it requires, else of the first agent that handles it, else of its nearest ancestor's.
 * Lanes appear in the order of their first activity. The objects on an arrow are those the earlier activity
 * gives and the later one takes, the same as the IDEF0 arrows.
 */
export function flow(model: Model, id: string): Flow {
  const lanes: FlowLane[] = [];
  const laneOf = (owner: string | undefined) => {
    let i = lanes.findIndex((l) => l.id === owner);
    if (i < 0) {
      i = lanes.length;
      lanes.push(owner === undefined ? { kind: "none" } : { id: owner, kind: isModule(model, owner) ? "module" : "agent" });
    }
    return i;
  };
  const subs = steps(model, id);
  const activities = subs.map((s) => ({ process: s, lane: laneOf(performers(model, s)[0]) }));
  const boxes = subs.map((s) => icom(model, s));
  const edges: FlowEdge[] = [];
  boxes.forEach((a, i) => {
    const given = new Set(a.outputs.map((e) => e.object));
    boxes.forEach((b, j) => {
      if (j <= i) return;
      const objects = unique([...b.inputs, ...b.controls].map((e) => e.object)).filter((o) => given.has(o));
      if (j === i + 1 || objects.length) edges.push({ from: i, to: j, objects, next: j === i + 1 });
    });
  });
  return { process: id, lanes, activities, edges };
}

export function laneText(model: Model, lane: FlowLane): string {
  return lane.id ? label(model, lane.id) : "no module";
}

/** Lanes as subgraphs; the arrow to the next activity is solid, a later hand-over dotted. */
export function flowMermaid(model: Model, f: Flow): string {
  const lines = ["flowchart LR", `  start(("start"))`, `  stop((("end")))`];
  f.lanes.forEach((lane, i) => {
    lines.push(`  subgraph lane${i}[${quote(laneText(model, lane))}]`, "    direction LR");
    f.activities.forEach((a, k) => { if (a.lane === i) lines.push(`    a${k}[${quote(label(model, a.process))}]`); });
    lines.push("  end");
  });
  if (f.activities.length) lines.push("  start --> a0");
  for (const e of f.edges) {
    const text = e.objects.map((o) => label(model, o)).join(", ");
    const arrow = e.next ? "-->" : "-.->";
    lines.push(text ? `  a${e.from} ${arrow}|${quote(text)}| a${e.to}` : `  a${e.from} ${arrow} a${e.to}`);
  }
  if (f.activities.length) lines.push(`  a${f.activities.length - 1} --> stop`);
  return lines.join("\n");
}

export function flowMarkdown(model: Model, ids = zoomed(model)): string[] {
  ids = ids.filter((id) => steps(model, id).length);
  if (!ids.length) return [];
  return [
    "## Process flow",
    "",
    "Subprocesses as activities in the lane of the module they require first, or of the agent that handles them. Solid arrows lead to the next activity, dotted ones to a later activity that takes an object.",
    "",
    ...ids.flatMap((id) => [`### ${label(model, id)}`, "", "```mermaid", flowMermaid(model, flow(model, id)), "```", ""]),
  ];
}
