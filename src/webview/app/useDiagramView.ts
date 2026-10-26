import { useCallback, useEffect, useMemo } from "react";
import { objects, processes } from "../../core/model";
import { ViewContent, viewContent, ViewNode, viewsContaining } from "../../core/viewmodel";
import { autoLayout, layoutKey, manualLayout, shapesOf } from "../layout";
import type { useDiagramState } from "./useDiagramState";
import type { useHostMessages } from "./useHostMessages";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "model" | "view" | "pendingView" | "viewId" | "extra" | "wrapper" | "flow" | "stored" | "setLayingOut" |
  "setPositions" | "setSettledView" | "autoCache" | "storedKey" | "setSelection" | "pendingEdge" |
  "setEdgeSel" | "reveal" | "setReveal" | "views" | "fromHost" | "centerOn"
> & Pick<ReturnType<typeof useHostMessages>,
  "goTo"
>;

export function useDiagramView({
  model, view, pendingView, viewId, goTo, extra, wrapper, flow, stored, setLayingOut, setPositions,
  setSettledView, autoCache, storedKey, setSelection, pendingEdge, setEdgeSel, reveal, setReveal, views,
  fromHost, centerOn
}: Input) {


  /* ---------- the view ---------- */

  // a view that disappeared (deleted process, renamed view) falls back to the system diagram
  useEffect(() => {
    if (!model) return;
    if (view) {
      if (pendingView.current === view.id) pendingView.current = null;
      return;
    }
    if (pendingView.current !== viewId) goTo("system");
  }, [model, view, viewId, goTo]);

  const content = useMemo<ViewContent | undefined>(() => {
    if (!model || !view) return undefined;
    const c = viewContent(model, view.id)!;
    const add = (extra[view.id] ?? []).filter((id) => (objects(model)[id] || processes(model)[id]) && !c.nodes.some((n) => n.id === id));
    if (!add.length) return c;
    return { ...c, nodes: [...c.nodes, ...add.map((id): ViewNode => ({ id, kind: objects(model)[id] ? "object" : "process" }))] };
  }, [model, view, extra]);

  const shapes = useMemo(() => (model && content ? shapesOf(model, content) : undefined), [model, content]);
  const key = content && shapes ? layoutKey(content, shapes) : "";

  const visibleCenter = useCallback((): { x: number; y: number } => {
    const r = wrapper.current?.getBoundingClientRect();
    if (!r) return { x: 40, y: 40 };
    const p = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return { x: Math.round(p.x - 60), y: Math.round(p.y - 25) };
  }, [flow]);

  useEffect(() => {
    if (!content || !shapes) return;
    const vid = content.view.id;
    if (stored) {
      setLayingOut(false);
      setPositions(manualLayout(content, shapes, stored, visibleCenter()));
      setSettledView(vid);
      return;
    }
    const cached = autoCache.current.get(key);
    if (cached) {
      setLayingOut(false);
      setPositions(cached);
      setSettledView(vid);
      return;
    }
    // until ELK answers, things keep their places and new ones get a free spot
    setPositions((prev) => manualLayout(content, shapes, prev, visibleCenter()));
    setLayingOut(true);
    let cancelled = false;
    void autoLayout(content, shapes).then((p) => {
      if (cancelled) return;
      autoCache.current.set(key, p);
      setPositions(p);
      setLayingOut(false);
      setSettledView(vid);
    });
    return () => { cancelled = true; };
    // content and shapes are covered by the layout key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storedKey]);

  // an external change keeps the selection of the things that still exist
  useEffect(() => {
    if (!model || !content) return;
    const shown = new Set(content.nodes.map((n) => n.id));
    setSelection((s) => (s.every((id) => shown.has(id)) ? s : s.filter((id) => shown.has(id))));
    if (pendingEdge.current) {
      const p = pendingEdge.current;
      const e = content.edges.find((x) => x.link.kind === p.kind && ((x.link.from === p.from && x.link.to === p.to) || (x.link.from === p.to && x.link.to === p.from)));
      pendingEdge.current = null;
      setEdgeSel(e?.id ?? null);
    } else setEdgeSel((id) => (id && content.edges.some((e) => e.id === id) ? id : null));
  }, [model, content]);

  /* ---------- reveal from the tree, Problems or the text cursor ---------- */

  useEffect(() => {
    if (!reveal || !model) return;
    setReveal(null);
    if (reveal.viewId && views.some((v) => v.id === reveal.viewId)) {
      if (reveal.viewId !== viewId) goTo(reveal.viewId);
    }
    const id = reveal.elementId;
    if (!id || !(objects(model)[id] || processes(model)[id])) return;
    const target = reveal.viewId ?? viewsContaining(model, id, viewId)[0];
    if (!target) return;
    if (target !== viewId) goTo(target);
    fromHost.current = true;
    setSelection([id]);
    setEdgeSel(null);
    centerOn.current = id;
  }, [reveal, model, views, viewId, goTo]);
  return {
    content, shapes, visibleCenter
  };
}
