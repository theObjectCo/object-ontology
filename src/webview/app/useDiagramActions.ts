import { getNodesBounds } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { useCallback } from "react";
import { fragmentOf } from "../../core/edit";
import { MethodId } from "../../core/methods/common";
import { objects, processes } from "../../core/model";
import { Rect } from "../geometry";
import { LayoutAlgorithm, autoLayout, topLevel } from "../layout";
import { post } from "../vscode";
import { rectOf } from "./rectOf";
import type { useDiagramNodes } from "./useDiagramNodes";
import type { useDiagramState } from "./useDiagramState";
import type { useDiagramView } from "./useDiagramView";
import type { useHostMessages } from "./useHostMessages";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "view" | "positions" | "frozen" | "model" | "manual" | "viewId" | "fresh" | "setExtra" | "setSelection" |
  "setEdgeSel" | "editingRef" | "setEditing" | "selection" | "saveViewRef" | "copied" | "setLayingOut" |
  "fitAfterLayout" | "wrapper" | "nodes" | "setExporting" | "flow" | "showToast" | "setContext" |
  "setStoryId" | "setMethod"
> & Pick<ReturnType<typeof useDiagramView>,
  "visibleCenter" | "content" | "shapes"
> & Pick<ReturnType<typeof useHostMessages>,
  "run" | "goTo"
> & Pick<ReturnType<typeof useDiagramNodes>,
  "selectedEdge"
>;

export function useDiagramActions({
  view, visibleCenter, content, shapes, positions, frozen, model, manual, run, viewId, fresh, setExtra,
  setSelection, setEdgeSel, editingRef, setEditing, selection, selectedEdge, goTo, saveViewRef, copied,
  setLayingOut, fitAfterLayout, wrapper, nodes, setExporting, flow, showToast, setContext, setStoryId,
  setMethod
}: Input) {


  /* ---------- actions ---------- */

  const zoomProcess = view && (view.kind === "zoom" || (view.kind === "custom" && view.process)) ? view.process : undefined;

  const freeSpot = useCallback((w: number, h: number, at?: [number, number]): [number, number] => {
    const c = at ? { x: at[0], y: at[1] } : visibleCenter();
    const rects = content && shapes ? topLevel(content).map((id) => rectOf(content, shapes, positions, id)).filter((r): r is Rect => !!r) : [];
    let x = c.x, y = c.y;
    const overlaps = () => rects.some((r) => x < r.x + r.w + 20 && x + w + 20 > r.x && y < r.y + r.h + 20 && y + h + 20 > r.y);
    for (let i = 0; i < 200 && overlaps(); i++) y += 30;
    return [Math.round(x), Math.round(y)];
  }, [content, shapes, positions, visibleCenter]);

  const addElement = useCallback(async (kind: "object" | "process", at?: [number, number], preset?: "module" | "actor") => {
    if (frozen || !model) return;
    const parentId = kind === "process" ? zoomProcess : undefined;
    const pos = manual && !parentId ? freeSpot(kind === "object" ? 120 : 220, kind === "object" ? 50 : 84, at) : undefined;
    const r = await run({ op: "addElement", kind, viewId, pos, parentId });
    const id = r.ok ? r.select?.[0] : undefined;
    if (!id) return;
    if (preset === "module") {
      await run({ op: "updateElement", id, patch: { role: "module" } }, { quiet: true });
    } else if (preset === "actor") {
      await run({ op: "updateElement", id, patch: { essence: "physical" } }, { quiet: true });
    }
    fresh.current.add(id);
    if (zoomProcess && !parentId) setExtra((x) => ({ ...x, [viewId]: [...(x[viewId] ?? []), id] }));
    setSelection([id]);
    setEdgeSel(null);
    editingRef.current = id;
    setEditing(id);
  }, [frozen, model, zoomProcess, manual, freeSpot, run, viewId]);

  const selectedObject = selection.length === 1 && model && objects(model)[selection[0]] ? selection[0] : undefined;

  const addState = useCallback((object?: string, state?: string) => {
    const id = object ?? selectedObject;
    if (!id || frozen) return;
    void run({ op: "addState", object: id, state });
  }, [selectedObject, frozen, run]);

  const deleteSelection = useCallback(() => {
    if (frozen || (!selection.length && !selectedEdge)) return;
    void run({ op: "deleteElements", ids: selection, links: selectedEdge ? [selectedEdge.link.id] : [] });
    setSelection([]);
    setEdgeSel(null);
  }, [frozen, selection, selectedEdge, run]);

  const levelUp = useCallback(() => {
    if (!view || view.kind === "system") return;
    goTo(view.kind === "zoom" ? view.parent ?? "system" : "system");
  }, [view, goTo]);

  const copyText = useCallback((): string | undefined => {
    if (!model || !selection.length) return undefined;
    return JSON.stringify(fragmentOf(model, selection, positions), null, 2);
  }, [model, selection, positions]);

  /** Pastes a copied fragment; with `at`, its top-left corner lands there. */
  const paste = useCallback(async (text: string, at?: [number, number]) => {
    if (frozen) return;
    let fragment: unknown;
    try { fragment = JSON.parse(text); } catch { return; }
    if (!fragment || typeof fragment !== "object") return;
    const f = fragment as { objects?: unknown; processes?: unknown; positions?: Record<string, [number, number]> };
    if (!f.objects && !f.processes) return;
    const corners = Object.values(f.positions ?? {});
    const offset: [number, number] | undefined = at && corners.length
      ? [at[0] - Math.min(...corners.map((c) => c[0])), at[1] - Math.min(...corners.map((c) => c[1]))] : undefined;
    const r = await run({ op: "paste", fragment: { objects: f.objects as never, processes: f.processes as never, positions: f.positions as never }, viewId, parentId: zoomProcess, offset });
    if (r.ok && r.select?.length) {
      if (zoomProcess) setExtra((x) => ({ ...x, [viewId]: [...(x[viewId] ?? []), ...r.select!] }));
      setSelection(r.select);
    }
  }, [frozen, run, viewId, zoomProcess]);

  const saveView = useCallback(() => {
    if (!selection.length) return;
    const pos = manual ? Object.fromEntries(selection.filter((id) => positions[id]).map((id) => [id, positions[id]])) : undefined;
    post({ type: "saveViewFromSelection", ids: selection, positions: pos });
  }, [selection, manual, positions]);
  saveViewRef.current = saveView;

  // the menu writes and reads the clipboard itself; the keyboard goes through the copy, cut and paste events
  const copySelection = useCallback(() => {
    const text = copyText();
    if (!text) return;
    copied.current = text;
    void navigator.clipboard?.writeText(text);
  }, [copyText]);
  const pasteFromMenu = useCallback(async (at?: [number, number]) => {
    const text = await navigator.clipboard?.readText().catch(() => undefined);
    await paste(text || copied.current || "", at);
  }, [paste]);

  const arrange = useCallback(async (algorithm: LayoutAlgorithm) => {
    if (!content || !shapes || frozen) return;
    setLayingOut(true);
    const p = await autoLayout(content, shapes, algorithm);
    setLayingOut(false);
    // the new arrangement can be larger or elsewhere: it is shown whole once its positions arrive
    fitAfterLayout.current = p;
    const r = await run({ op: "setLayout", viewId, positions: p });
    if (!r.ok) fitAfterLayout.current = null;
  }, [content, shapes, frozen, run, viewId]);

  const exportImage = useCallback(async (kind: "png" | "svg") => {
    const el = wrapper.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el || !nodes.length) return;
    setExporting(true);
    setEditing(null);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const b = getNodesBounds(flow.getNodes());
      const pad = 40;
      const width = Math.ceil(b.width + 2 * pad), height = Math.ceil(b.height + 2 * pad);
      const style = { width: `${width}px`, height: `${height}px`, transform: `translate(${pad - b.x}px, ${pad - b.y}px) scale(1)` };
      const backgroundColor = getComputedStyle(document.body).getPropertyValue("--vscode-editor-background").trim() || undefined;
      const filter = (n: HTMLElement) => !n.classList?.contains("opm-selection") && !n.classList?.contains("react-flow__handle");
      const options = { width, height, style, backgroundColor, filter, skipFonts: true };
      if (kind === "png") post({ type: "export", format: "png", viewId, data: await toPng(el, { ...options, pixelRatio: 2 }) });
      else {
        const url = await toSvg(el, options);
        post({ type: "export", format: "svg", viewId, data: decodeURIComponent(url.slice(url.indexOf(",") + 1)) });
      }
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setExporting(false);
    }
  }, [nodes, flow, viewId, showToast]);

  /** Opens a method view for the selected process, else for the process of the zoom on screen. */
  const openMethod = (id: MethodId) => {
    const picked = selection.length === 1 && model && processes(model)[selection[0]] ? selection[0] : undefined;
    setSelection([]);
    setEdgeSel(null);
    setContext(null);
    setStoryId(null);
    setMethod({ id, process: picked ?? zoomProcess });
  };
  return {
    zoomProcess, addElement, selectedObject, addState, deleteSelection, levelUp, copyText, paste, saveView,
    copySelection, pasteFromMenu, arrange, exportImage, openMethod
  };
}
