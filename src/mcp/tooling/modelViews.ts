import { Model, label, parents, processes } from "../../core/model";
import { laneKind, stories, storyTitle } from "../../core/stories";
import { ToolError } from "./contracts";

export interface ZoomNode {
  id: string;
  label: string;
  capability?: string;
  subprocesses?: ZoomNode[];
}

export function zoomTree(model: Model): ZoomNode[] {
  const procs = processes(model);
  const parentOf = parents(model);
  const seen = new Set<string>();
  const node = (id: string): ZoomNode => {
    seen.add(id);
    const subs = (procs[id]?.zoomsInto ?? []).filter((s) => procs[s] && !seen.has(s));
    return {
      id,
      label: label(model, id),
      ...(procs[id]?.capability ? { capability: procs[id].capability } : {}),
      ...(subs.length ? { subprocesses: subs.map(node) } : {}),
    };
  };
  const roots = Object.keys(procs).filter((id) => !parentOf.has(id)).map(node);
  // processes in a zoomsInto cycle have a parent each and no root; list them at the top so none is lost
  for (const id of Object.keys(procs)) if (!seen.has(id)) roots.push(node(id));
  return roots;
}

/** Where a thing occurs in the user stories. */
export function storyUses(model: Model, id: string) {
  const out: { story: string; as: string; step?: number; does?: string }[] = [];
  for (const [sid, s] of Object.entries(stories(model))) {
    if ((s.lanes ?? []).includes(id)) out.push({ story: sid, as: "lane" });
    (s.steps ?? []).forEach((st, i) => {
      if (st.lane === id) out.push({ story: sid, as: "step lane", step: i, does: st.does });
      if (st.process === id) out.push({ story: sid, as: "step process", step: i, does: st.does });
      if (st.handsOver?.object === id) out.push({ story: sid, as: "handed over", step: i, does: st.does });
      if (st.handsOver?.to === id) out.push({ story: sid, as: "receiving lane", step: i, does: st.does });
    });
  }
  return out;
}

export function storyLanes(model: Model, sid: string) {
  const s = stories(model)[sid];
  if (!s) throw new ToolError(`No story "${sid}". Stories: ${Object.keys(stories(model)).join(", ") || "none"}.`);
  const steps = s.steps ?? [];
  return {
    story: sid,
    title: storyTitle(sid, s),
    lanes: (s.lanes ?? []).map((lane) => ({
      id: lane,
      label: label(model, lane),
      kind: laneKind(model, lane) ?? "not an agent or a module",
      steps: steps.flatMap((st, i) => (st.lane === lane ? [{ step: i, does: st.does, ...(st.process ? { process: st.process } : {}) }] : [])),
      handsOver: steps.flatMap((st, i) => (st.lane === lane && st.handsOver ? [{ step: i, object: st.handsOver.object, ...(st.handsOver.state ? { state: st.handsOver.state } : {}), to: st.handsOver.to }] : [])),
      receives: steps.flatMap((st, i) => (st.handsOver?.to === lane ? [{ step: i, object: st.handsOver.object, ...(st.handsOver.state ? { state: st.handsOver.state } : {}), from: st.lane }] : [])),
    })),
  };
}
