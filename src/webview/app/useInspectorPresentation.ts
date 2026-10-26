import { useCallback, useMemo } from "react";
import { editorLinks, stateOwner } from "../../core/links";
import { objects, processes } from "../../core/model";
import { oplSentences } from "../../core/opl";
import { ViewInfo } from "../../core/viewmodel";
import { format } from "../../shared/i18n";
import { InspectorProps } from "../panels";
import { post } from "../vscode";
import type { useDiagramActions } from "./useDiagramActions";
import type { useDiagramNodes } from "./useDiagramNodes";
import type { useDiagramState } from "./useDiagramState";
import type { useDiagramView } from "./useDiagramView";
import type { useHostMessages } from "./useHostMessages";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "model" | "selection" | "oplExpanded" | "oplMode" | "setConfirm" | "t" | "language" | "schemas" |
  "setDrawer" | "fresh" | "setSelection" | "pendingEdge" | "view" | "views"
> & Pick<ReturnType<typeof useDiagramView>,
  "content"
> & Pick<ReturnType<typeof useDiagramNodes>,
  "selectedEdge" | "openZoom"
> & Pick<ReturnType<typeof useHostMessages>,
  "run"
> & Pick<ReturnType<typeof useDiagramActions>,
  "addState" | "deleteSelection" | "copyText" | "saveView"
>;

export function useInspectorPresentation({
  model, content, selection, selectedEdge, oplExpanded, oplMode, run, setConfirm, t, language, schemas,
  setDrawer, openZoom, fresh, setSelection, addState, pendingEdge, deleteSelection, copyText, saveView,
  view, views
}: Input) {


  /* ---------- OPL ---------- */

  const sentences = useMemo(() => (model ? oplSentences(model) : []), [model]);
  const shownIds = useMemo(() => new Set(content?.nodes.map((n) => n.id) ?? []), [content]);
  const focus = useMemo(() => {
    if (selection.length) return new Set(selection);
    if (selectedEdge) return new Set([selectedEdge.link.from, selectedEdge.link.to]);
    return new Set<string>();
  }, [selection, selectedEdge]);
  const viewSentences = useMemo(() => sentences.filter((s) => s.refs.length && s.refs.every((r) => shownIds.has(r))), [sentences, shownIds]);
  const focusSentences = useMemo(() => {
    if (selectedEdge && !selection.length) return sentences.filter((s) => focus.size && [...focus].every((id) => s.refs.includes(id)));
    return sentences.filter((s) => s.refs.some((r) => focus.has(r)));
  }, [sentences, focus, selectedEdge, selection]);
  const useFocus = focus.size > 0 && (!oplExpanded || oplMode === "selection");

  /* ---------- inspector ---------- */

  const confirmDeleteState = useCallback((object: string, state: string) => {
    if (!model) return;
    const used = editorLinks(model).filter((l) => stateOwner(l) === object && (l.fromState === state || l.toState === state)).length;
    const del = () => void run({ op: "deleteState", object, state });
    if (!used) return del();
    setConfirm({ text: format(t.confirmDeleteState, { state, n: used }), action: t.delete, run: del });
  }, [model, run, t]);

  const inspectorProps: InspectorProps | undefined = model ? {
    t, language, model, schemas,
    ids: selection,
    link: selection.length ? undefined : selectedEdge?.link,
    onLess: () => setDrawer(false),
    onShowJson: (id) => post({ type: "revealInText", id, open: true }),
    onOpenZoom: (id) => void openZoom(id),
    onUpdate: (id, patch) => void run({ op: "updateElement", id, patch }),
    onRename: async (oldId, newId) => {
      const r = await run({ op: "renameId", oldId, newId }, { quiet: true });
      if (!r.ok) return r.error;
      fresh.current.delete(oldId);
      setSelection([newId]);
      return undefined;
    },
    onAddState: (id, state) => addState(id, state),
    onRenameState: (id, oldState, newState) => void run({ op: "renameState", object: id, oldState, newState }),
    onDeleteState: confirmDeleteState,
    onMoveState: (id, state, index) => void run({ op: "moveState", object: id, state, index }),
    onUpdateLink: (id, patch) => {
      const l = selectedEdge?.link;
      if (l) pendingEdge.current = { kind: patch.kind ?? l.kind, from: l.from, to: l.to };
      void run({ op: "updateLink", id, ...patch });
    },
    onOpenLink: (href) => post({ type: "openLink", href }),
    onDelete: deleteSelection,
    onCopy: () => { const text = copyText(); if (text) void navigator.clipboard?.writeText(text); },
    onSaveView: saveView,
  } : undefined;

  const hasSelection = selection.length > 0 || !!selectedEdge;

  const trail = useMemo(() => {
    if (!view) return [];
    const out: ViewInfo[] = [view];
    let cur = view;
    for (let i = 0; i < 20 && cur.kind === "zoom" && cur.parent; i++) {
      const parent = views.find((v) => v.id === cur.parent);
      if (!parent) break;
      out.unshift(parent);
      cur = parent;
    }
    if (out[0].kind !== "system") out.unshift(views[0]);
    return out;
  }, [view, views]);

  const empty = !!model && !Object.keys(objects(model)).length && !Object.keys(processes(model)).length;
  return {
    shownIds, focus, viewSentences, focusSentences, useFocus, inspectorProps, hasSelection, trail, empty
  };
}
