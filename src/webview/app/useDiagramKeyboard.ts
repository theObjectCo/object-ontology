import { useEffect, useRef } from "react";
import { processes } from "../../core/model";
import { isEditable } from "./isEditable";
import type { useDiagramActions } from "./useDiagramActions";
import type { useDiagramNodes } from "./useDiagramNodes";
import type { useDiagramState } from "./useDiagramState";
import type { useDiagramView } from "./useDiagramView";
import type { useStoryEditor } from "./useStoryEditor";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "method" | "setMethod" | "setStoryId" | "confirm" | "setConfirm" | "menu" | "setSelection" | "setEdgeSel" |
  "setContext" | "flow" | "selection" | "setDrawer" | "model" | "storyOpen" | "copied"
> & Pick<ReturnType<typeof useStoryEditor>,
  "story"
> & Pick<ReturnType<typeof useDiagramView>,
  "content"
> & Pick<ReturnType<typeof useDiagramNodes>,
  "selectedEdge" | "openZoom"
> & Pick<ReturnType<typeof useDiagramActions>,
  "deleteSelection" | "levelUp" | "zoomProcess" | "addElement" | "selectedObject" | "addState" | "copyText" |
  "paste"
>;

export function useDiagramKeyboard({
  method, setMethod, story, setStoryId, confirm, setConfirm, menu, setSelection, setEdgeSel, setContext,
  content, flow, selection, selectedEdge, deleteSelection, levelUp, setDrawer, model, zoomProcess, openZoom,
  addElement, selectedObject, addState, copyText, paste, storyOpen, copied
}: Input) {


  /* ---------- keyboard and clipboard ---------- */

  const onKey = (e: KeyboardEvent) => {
    if (method) { if (e.key === "Escape" && !isEditable(e.target)) setMethod(null); return; }
    if (story) {
      if ((e.key === "Escape" || e.key === "Backspace") && !isEditable(e.target)) { e.preventDefault(); setStoryId(null); }
      return;
    }
    if (confirm && e.key === "Escape") { setConfirm(null); return; }
    if (isEditable(e.target) || menu || confirm) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (k === "Escape") {
      setSelection([]); setEdgeSel(null); setContext(null);
      return;
    }
    if (ctrl) {
      if (k.toLowerCase() === "a" && content) { e.preventDefault(); setSelection(content.nodes.filter((n) => !n.container).map((n) => n.id)); setEdgeSel(null); }
      else if (k === "0") { e.preventDefault(); void flow.fitView({ padding: 0.15, maxZoom: 1, duration: 200 }); }
      else if (k === "=" || k === "+") { e.preventDefault(); void flow.zoomIn({ duration: 120 }); }
      else if (k === "-") { e.preventDefault(); void flow.zoomOut({ duration: 120 }); }
      return;
    }
    if (e.altKey) return;
    if (k === "Delete" || (k === "Backspace" && (selection.length || selectedEdge))) { e.preventDefault(); deleteSelection(); }
    else if (k === "Backspace") { e.preventDefault(); levelUp(); }
    else if (k === "F2" && selection.length === 1) {
      e.preventDefault();
      setDrawer(true);
      window.setTimeout(() => (document.getElementById("opm-id-field") as HTMLInputElement | null)?.select(), 60);
    } else if (k === "Enter" && selection.length === 1 && model && processes(model)[selection[0]] && selection[0] !== zoomProcess) {
      e.preventDefault(); void openZoom(selection[0]);
    } else if (k === "o" || k === "O") { e.preventDefault(); void addElement("object"); }
    else if (k === "p" || k === "P") { e.preventDefault(); void addElement("process"); }
    else if ((k === "s" || k === "S") && selectedObject) { e.preventDefault(); addState(); }
  };
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  const copyRef = useRef(copyText);
  copyRef.current = copyText;
  const pasteRef = useRef(paste);
  pasteRef.current = paste;
  const deleteRef = useRef(deleteSelection);
  deleteRef.current = deleteSelection;

  useEffect(() => {
    const key = (e: KeyboardEvent) => keyRef.current(e);
    const copy = (e: ClipboardEvent) => {
      if (isEditable(e.target) || storyOpen.current) return;
      const text = copyRef.current();
      if (!text || !e.clipboardData) return;
      copied.current = text;
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
    };
    const cut = (e: ClipboardEvent) => {
      copy(e);
      if (e.defaultPrevented) deleteRef.current();
    };
    const pasteEvent = (e: ClipboardEvent) => {
      if (isEditable(e.target) || storyOpen.current) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text) { e.preventDefault(); void pasteRef.current(text); }
    };
    window.addEventListener("keydown", key);
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cut);
    document.addEventListener("paste", pasteEvent);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cut);
      document.removeEventListener("paste", pasteEvent);
    };
  }, []);
}
