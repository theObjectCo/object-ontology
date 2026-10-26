import { MouseEvent as ReactMouseEvent, useCallback } from "react";
import { allowedKinds } from "../../core/links";
import { label, processes } from "../../core/model";
import { format } from "../../shared/i18n";
import { ContextItem } from "../panels";
import { post } from "../vscode";
import { isEditable } from "./isEditable";
import type { useDiagramActions } from "./useDiagramActions";
import type { useDiagramNodes } from "./useDiagramNodes";
import type { useDiagramState } from "./useDiagramState";
import type { useHostMessages } from "./useHostMessages";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "rightDown" | "selection" | "setSelection" | "setEdgeSel" | "frozen" | "wrapper" | "flow" | "setContext" |
  "context" | "model" | "t" | "setDrawer" | "words"
> & Pick<ReturnType<typeof useDiagramActions>,
  "pasteFromMenu" | "addElement" | "copySelection" | "deleteSelection" | "saveView" | "zoomProcess" |
  "addState"
> & Pick<ReturnType<typeof useDiagramNodes>,
  "openZoom" | "startEdit" | "selectedEdge"
> & Pick<ReturnType<typeof useHostMessages>,
  "run"
>;

export function useContextActions({
  rightDown, selection, setSelection, setEdgeSel, frozen, wrapper, flow, setContext, context, model, t,
  setDrawer, pasteFromMenu, addElement, copySelection, deleteSelection, saveView, zoomProcess, openZoom,
  addState, startEdit, selectedEdge, words, run
}: Input) {


  /* ---------- context menu ---------- */

  // one menu for the right button: on a thing or a link it acts on the selection, on the pane it adds things
  const openContext = (e: ReactMouseEvent) => {
    const el = e.target as HTMLElement;
    if (isEditable(el)) return;
    e.preventDefault();
    const down = rightDown.current;
    rightDown.current = null;
    if (el.closest(".opm-context") || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4)) return;
    const nodeId = el.closest(".react-flow__node")?.getAttribute("data-id");
    const edgeId = el.closest("[data-edge]")?.getAttribute("data-edge");
    let on: "pane" | "selection";
    if (nodeId) {
      if (!selection.includes(nodeId)) { setSelection([nodeId]); setEdgeSel(null); }
      on = "selection";
    } else if (edgeId) {
      setEdgeSel(edgeId); setSelection([]);
      on = "selection";
    } else if (el.classList.contains("react-flow__pane")) {
      if (frozen) return;
      on = "pane";
    } else return;
    const box = wrapper.current!.getBoundingClientRect();
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setContext({ x: e.clientX - box.left, y: e.clientY - box.top, pos: [Math.round(p.x), Math.round(p.y)], on });
  };
  const closeContext = useCallback(() => setContext(null), []);

  const contextMenu = ((): { title?: string; subtitle?: string; items: ContextItem[] } | undefined => {
    if (!context || !model) return undefined;
    const properties: ContextItem = { label: t.properties, keys: "F2", action: () => setDrawer(true) };
    const paste: ContextItem = { label: t.paste, keys: "Ctrl+V", action: () => void pasteFromMenu(context.on === "pane" ? context.pos : undefined), disabled: frozen };
    if (context.on === "pane") {
      return {
        items: [
          { label: `▭ ${t.object}`, keys: "O", action: () => void addElement("object", context.pos) },
          { label: `◯ ${t.process}`, keys: "P", action: () => void addElement("process", context.pos) },
          { label: `▣ ${t.module} (IT)`, action: () => void addElement("object", context.pos, "module") },
          { label: `👤 ${t.agent} (Physical)`, action: () => void addElement("object", context.pos, "actor") },
          "-", paste,
        ]
      };
    }
    const edit: ContextItem[] = [
      { label: t.cut, keys: "Ctrl+X", action: () => { copySelection(); deleteSelection(); }, disabled: frozen || !selection.length },
      { label: t.copy, keys: "Ctrl+C", action: copySelection, disabled: !selection.length },
      paste,
      { label: t.delete, keys: "Del", action: deleteSelection, disabled: frozen },
    ];
    if (selection.length > 1) {
      return { title: format(t.elements, { n: selection.length }), items: [...edit, "-", { label: t.saveAsView, action: saveView }] };
    }
    if (selection.length === 1) {
      const id = selection[0];
      const isProcess = !!processes(model)[id];
      return {
        title: label(model, id), subtitle: id, items: [
          ...(isProcess && id !== zoomProcess ? [{ label: t.openZoom, keys: "Enter", action: () => void openZoom(id) }] : []),
          ...(isProcess ? [] : [{ label: t.newState, keys: "S", action: () => addState(id), disabled: frozen }]),
          { label: t.rename, action: () => startEdit(id), disabled: frozen },
          "-", ...edit,
          "-", { label: t.showInJson, action: () => post({ type: "revealInText", id, open: true }) }, properties,
        ]
      };
    }
    const l = selectedEdge?.link;
    if (!l) return undefined;
    const canReverse = allowedKinds(model, l.to, l.from).includes(l.kind);
    return {
      title: words[l.kind] ?? l.kind, subtitle: `${label(model, l.from)} → ${label(model, l.to)}`, items: [
        ...(canReverse ? [{ label: `⇄ ${t.reverse}`, action: () => void run({ op: "updateLink", id: l.id, reverse: true }), disabled: frozen }] : []),
        { label: t.delete, keys: "Del", action: deleteSelection, disabled: frozen },
        "-", { label: t.properties, action: () => setDrawer(true) },
      ]
    };
  })();
  return {
    openContext, closeContext, contextMenu
  };
}
