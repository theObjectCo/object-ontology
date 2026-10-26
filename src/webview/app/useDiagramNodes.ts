import { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useMemo } from "react";
import { thingKind } from "../../core/links";
import { affiliation, essence, label, objects, processes } from "../../core/model";
import { ViewEdge } from "../../core/viewmodel";
import { EdgeData } from "../edges";
import { NodeData } from "../nodes";
import { LINKS_Z, THINGS_Z } from "./constants";
import { linkChoices } from "./linkOperations";
import type { useDiagramState } from "./useDiagramState";
import type { useDiagramView } from "./useDiagramView";
import type { useHostMessages } from "./useHostMessages";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "diagnostics" | "edgeSel" | "exporting" | "selection" | "model" | "connecting" | "editingRef" |
  "setEditing" | "fresh" | "setSelection" | "frozen" | "pendingView" | "editing" | "setDrawer" |
  "positions" | "t" | "setNodes" | "rebuild" | "words" | "labelsOn"
> & Pick<ReturnType<typeof useDiagramView>,
  "content" | "shapes"
> & Pick<ReturnType<typeof useHostMessages>,
  "run" | "goTo"
>;

export function useDiagramNodes({
  diagnostics, content, edgeSel, exporting, selection, model, connecting, editingRef, setEditing, fresh,
  run, setSelection, frozen, pendingView, goTo, shapes, editing, setDrawer, positions, t, setNodes, rebuild,
  words, labelsOn
}: Input) {


  /* ---------- nodes and edges ---------- */

  const diagBy = useMemo(() => {
    const out = new Map<string, { severity: "error" | "warning"; messages: string[] }>();
    for (const d of diagnostics) {
      if (!d.element || d.severity === "info") continue;
      const cur = out.get(d.element);
      if (!cur) out.set(d.element, { severity: d.severity, messages: [d.message] });
      else {
        cur.messages.push(d.message);
        if (d.severity === "error") cur.severity = "error";
      }
    }
    return out;
  }, [diagnostics]);

  const selectedEdge: ViewEdge | undefined = content?.edges.find((e) => e.id === edgeSel);

  const related = useMemo(() => {
    if (!content || exporting || (!selection.length && !selectedEdge)) return null;
    const set = new Set(selection);
    for (const e of content.edges) {
      if (selection.includes(e.source) || selection.includes(e.target) || e.id === edgeSel) set.add(e.source).add(e.target);
    }
    return set;
  }, [content, selection, selectedEdge, edgeSel, exporting]);

  const canLink = useCallback((id: string): boolean => {
    if (!model || !connecting || id === connecting.from) return false;
    return linkChoices(model, connecting.from, id, connecting.state).kinds.length > 0;
  }, [model, connecting]);

  const onLabel = useCallback((id: string, value: string | null) => {
    if (editingRef.current !== id) return;
    editingRef.current = null;
    setEditing(null);
    if (!model) return;
    const isFresh = fresh.current.has(id);
    fresh.current.delete(id);
    if (value === null || (value === label(model, id) && !isFresh)) return;
    void run({ op: "setLabel", id, label: value, deriveId: isFresh }).then((r) => {
      if (r.ok && r.select?.length) setSelection(r.select);
    });
  }, [model, run]);

  const startEdit = useCallback((id: string) => {
    if (frozen) return;
    editingRef.current = id;
    setEditing(id);
  }, [frozen]);

  const openZoom = useCallback(async (id: string) => {
    if (!model || !processes(model)[id]) return;
    if (processes(model)[id].zoomsInto === undefined) {
      if (frozen) return;
      pendingView.current = id;
      const r = await run({ op: "openZoom", process: id });
      if (!r.ok) { pendingView.current = null; return; }
    }
    goTo(id);
  }, [model, frozen, run, goTo]);

  const toggleRole = useCallback((id: string) => {
    if (frozen || !model || !objects(model)[id]) return;
    const cur = objects(model)[id].role;
    void run({ op: "updateElement", id, patch: { role: cur === "module" ? undefined : "module" } });
  }, [frozen, model, run]);

  const togglePhysical = useCallback((id: string) => {
    if (frozen || !model) return;
    const def = objects(model)[id] ?? processes(model)[id];
    if (!def) return;
    const isPhys = essence(def) === "physical";
    void run({ op: "updateElement", id, patch: { essence: isPhys ? "informational" : "physical" } });
  }, [frozen, model, run]);

  const toggleEnv = useCallback((id: string) => {
    if (frozen || !model) return;
    const def = objects(model)[id] ?? processes(model)[id];
    if (!def) return;
    const isEnv = affiliation(def) === "environmental";
    void run({ op: "updateElement", id, patch: { affiliation: isEnv ? "systemic" : "environmental" } });
  }, [frozen, model, run]);

  const baseNodes = useMemo<Node[]>(() => {
    if (!model || !content || !shapes) return [];
    const out: Node[] = [];
    const ordered = [...content.nodes].sort((a, b) => Number(!!b.container) - Number(!!a.container));
    for (const n of ordered) {
      const def = objects(model)[n.id] ?? processes(model)[n.id];
      if (!def) continue;
      const diag = diagBy.get(n.id);
      const selected = selection.includes(n.id);
      const data: NodeData = {
        id: n.id,
        label: label(model, n.id),
        w: 0, h: 0,
        environmental: affiliation(def) === "environmental",
        physical: essence(def) === "physical",
        severity: diag?.severity,
        tooltip: diag?.messages.join("\n"),
        dimmed: !!related && !n.container && !related.has(n.id),
        target: connecting && n.id !== connecting.from ? canLink(n.id) : undefined,
        editing: editing === n.id,
        singleSelected: selected && selection.length === 1 && !frozen && !exporting && !n.container,
        onLabel,
        onStartEdit: startEdit,
        onOpenZoom: (id: string) => void openZoom(id),
        onAddState: (id: string) => void run({ op: "addState", object: id }),
        onRenameState: (id: string, oldState: string, newState: string) => void run({ op: "renameState", object: id, oldState, newState }),
        onDeleteState: (id: string, state: string) => void run({ op: "deleteState", object: id, state }),
        onToggleRole: toggleRole,
        onTogglePhysical: togglePhysical,
        onToggleEnv: toggleEnv,
        onOpenInspector: (id: string) => { setSelection([id]); setDrawer(true); },
        onDeleteNode: (id: string) => {
          void run({ op: "deleteElements", ids: [id], links: [] });
          setSelection((prev) => prev.filter((x) => x !== id));
        },
      };
      const common = { id: n.id, selected, draggable: !frozen, connectable: !frozen };
      if (n.kind === "object") {
        const s = shapes.objects[n.id];
        const p = positions[n.id] ?? [40, 40];
        data.w = s.w; data.h = s.h;
        data.module = objects(model)[n.id].role === "module";
        data.states = objects(model)[n.id].states ?? [];
        data.stateRects = s.states;
        if (connecting && canLink(n.id) && thingKind(model, connecting.from) === "process") data.highlightStates = data.states;
        out.push({ ...common, type: "object", position: { x: p[0], y: p[1] }, width: s.w, height: s.h, data, zIndex: THINGS_Z });
      } else if (n.container) {
        const s = shapes.container!.shape;
        const p = positions[n.id] ?? [40, 40];
        data.w = s.w; data.h = s.h;
        data.empty = !(processes(model)[n.id].zoomsInto ?? []).length;
        data.emptyHint = t.subprocessesHint;
        out.push({ ...common, type: "container", position: { x: p[0], y: p[1] }, width: s.w, height: s.h, data, zIndex: 0 });
      } else if (n.inside) {
        const r = shapes.container!.shape.inner[n.id];
        data.w = r.w; data.h = r.h;
        data.hasZoom = processes(model)[n.id].zoomsInto !== undefined;
        out.push({ ...common, type: "process", parentId: n.inside, position: { x: r.x, y: r.y }, width: r.w, height: r.h, data });
      } else {
        const s = shapes.processes[n.id];
        const p = positions[n.id] ?? [40, 40];
        data.w = s.w; data.h = s.h;
        data.hasZoom = processes(model)[n.id].zoomsInto !== undefined;
        out.push({ ...common, type: "process", position: { x: p[0], y: p[1] }, width: s.w, height: s.h, data, zIndex: THINGS_Z });
      }
    }
    return out;
  }, [model, content, shapes, positions, diagBy, related, connecting, canLink, editing, selection, frozen, exporting, onLabel, startEdit, openZoom, run, toggleRole, togglePhysical, toggleEnv, t]);

  useEffect(() => setNodes(baseNodes), [baseNodes, rebuild]);

  const edges = useMemo<Edge[]>(() => {
    if (!content || !model) return [];
    const groups = new Map<string, ViewEdge[]>();
    const pair = (e: ViewEdge) => [e.source, e.target].sort().join("|");
    for (const e of content.edges) groups.set(pair(e), [...(groups.get(pair(e)) ?? []), e]);
    return content.edges.map((e) => {
      const g = groups.get(pair(e))!;
      const i = g.indexOf(e);
      let offset = (i - (g.length - 1) / 2) * 16;
      // the offset is perpendicular to the drawn direction, so opposite directions flip it
      if (e.source > e.target) offset = -offset;
      const touches = !related || selection.includes(e.source) || selection.includes(e.target) || e.id === edgeSel;
      const data: EdgeData = {
        kind: e.link.kind,
        fromState: e.link.fromState,
        toState: e.link.toState,
        stateEnd: e.link.kind === "result" ? "target" : "source",
        word: words[e.link.kind] ?? e.link.kind,
        tag: e.link.tag,
        labelsOn,
        dimmed: !touches,
        offset,
      };
      const zIndex = LINKS_Z;
      return { id: e.id, source: e.source, target: e.target, type: "opm", selected: e.id === edgeSel, data, zIndex, selectable: true, focusable: false };
    });
  }, [content, model, related, selection, edgeSel, labelsOn, words]);
  return {
    selectedEdge, startEdit, openZoom, edges
  };
}
