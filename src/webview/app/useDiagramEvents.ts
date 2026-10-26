import { applyNodeChanges, EdgeChange, FinalConnectionState, Node, NodeChange } from "@xyflow/react";
import { useCallback } from "react";
import { thingKind } from "../../core/links";
import { processes } from "../../core/model";
import { Positions, topLevel } from "../layout";
import { MenuState } from "./contracts";
import { linkChoices, linkOperation } from "./linkOperations";
import type { useDiagramState } from "./useDiagramState";
import type { useDiagramView } from "./useDiagramView";
import type { useHostMessages } from "./useHostMessages";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "setNodes" | "setSelection" | "setEdgeSel" | "boxSelecting" | "model" | "frozen" | "setRebuild" |
  "positions" | "setPositions" | "manual" | "viewId" | "setMenu" | "setConnecting" | "connecting" |
  "wrapper"
> & Pick<ReturnType<typeof useDiagramView>,
  "content" | "shapes"
> & Pick<ReturnType<typeof useHostMessages>,
  "run"
>;

export function useDiagramEvents({
  setNodes, setSelection, setEdgeSel, boxSelecting, model, content, shapes, frozen, run, setRebuild,
  positions, setPositions, manual, viewId, setMenu, setConnecting, connecting, wrapper
}: Input) {


  /* ---------- React Flow events ---------- */

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const rest = changes.filter((c) => c.type !== "select" && c.type !== "remove");
    if (rest.length) setNodes((ns) => applyNodeChanges(rest, ns));
    const sel = changes.filter((c): c is Extract<NodeChange, { type: "select" }> => c.type === "select");
    if (!sel.length) return;
    setSelection((prev) => {
      const s = new Set(prev);
      for (const c of sel) (c.selected ? s.add(c.id) : s.delete(c.id));
      const next = [...s];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
    if (sel.some((c) => c.selected)) setEdgeSel(null);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // links stay unselected while a selection rectangle is drawn
    if (boxSelecting.current) return;
    for (const c of changes) {
      if (c.type !== "select") continue;
      if (c.selected) { setEdgeSel(c.id); setSelection([]); }
      else setEdgeSel((cur) => (cur === c.id ? null : cur));
    }
  }, []);

  const onNodeDragStop = useCallback((_e: unknown, _node: Node, dragged: Node[]) => {
    if (!model || !content || !shapes || frozen) return;
    const top = dragged.filter((n) => !n.parentId);
    const subs = dragged.filter((n) => n.parentId);
    if (subs.length === 1 && !top.length) {
      // a vertical drag of a subprocess changes its place in the order of execution
      const n = subs[0];
      const parent = n.parentId!;
      const order = processes(model)[parent]?.zoomsInto ?? [];
      const inner = shapes.container?.shape.inner ?? {};
      const cy = n.position.y + (n.height ?? inner[n.id]?.h ?? 0) / 2;
      const others = order.filter((id) => id !== n.id);
      const index = others.filter((id) => inner[id] && inner[id].y + inner[id].h / 2 < cy).length;
      if (index !== order.indexOf(n.id)) void run({ op: "reorderSubprocess", parent, id: n.id, index });
      setRebuild((x) => x + 1);
      return;
    }
    if (!top.length) { setRebuild((x) => x + 1); return; }
    const moved: Positions = {};
    for (const n of top) {
      const p: [number, number] = [Math.round(n.position.x), Math.round(n.position.y)];
      const before = positions[n.id];
      if (!before || before[0] !== p[0] || before[1] !== p[1]) moved[n.id] = p;
    }
    if (!Object.keys(moved).length) return;
    setPositions((p) => ({ ...p, ...moved }));
    // a view without saved positions saves all of them with its first move
    const all = manual ? undefined : Object.fromEntries(topLevel(content).filter((id) => positions[id]).map((id) => [id, positions[id]]));
    void run({ op: "moveElements", viewId, positions: moved, all });
  }, [model, content, shapes, frozen, positions, manual, viewId, run]);

  const onConnectStart = useCallback((_e: unknown, p: { nodeId: string | null; handleId: string | null }) => {
    if (!p.nodeId || frozen) return;
    setMenu(null);
    setConnecting({ from: p.nodeId, state: p.handleId?.startsWith("state:") ? p.handleId.slice(6) : undefined });
  }, [frozen]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, cs: FinalConnectionState) => {
    const start = connecting;
    setConnecting(null);
    if (!start || !model) return;
    const pt = "changedTouches" in event ? event.changedTouches[0] : event;
    const el = document.elementFromPoint(pt.clientX, pt.clientY);
    const to = el?.closest("[data-thing]")?.getAttribute("data-thing") ?? cs.toNode?.id;
    if (!to || to === start.from) return;
    const handle = el?.closest("[data-handleid]")?.getAttribute("data-handleid");
    const pill = el?.closest("[data-state]")?.getAttribute("data-state");
    const toState = handle?.startsWith("state:") ? handle.slice(6) : pill ?? undefined;
    const choice = linkChoices(model, start.from, to, start.state, thingKind(model, to) === "object" ? toState : undefined);
    if (!choice.kinds.length) return;
    const box = wrapper.current!.getBoundingClientRect();
    const m: MenuState = { x: pt.clientX - box.left, y: pt.clientY - box.top, from: start.from, to, ...choice };
    const items = choice.kinds.flatMap((k) => (k === "effect" && choice.effectTargets?.length ? choice.effectTargets : [k]));
    if (items.length === 1) {
      const kind = choice.kinds[0];
      void run(linkOperation(model, m, kind, kind === "effect" ? choice.effectTargets?.[0] : undefined));
    } else setMenu(m);
  }, [connecting, model, run]);
  return {
    onNodesChange, onEdgesChange, onNodeDragStop, onConnectStart, onConnectEnd
  };
}
