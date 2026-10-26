import { useCallback, useEffect } from "react";
import { Operation } from "../../core/edit";
import { HostMessage, UiDefaults } from "../../shared/protocol";
import { edit, post, saveTabState, settle } from "../vscode";
import { Result, TabState } from "./contracts";
import type { useDiagramState } from "./useDiagramState";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "setLanguage" | "saved" | "setDrawer" | "setOplExpanded" | "setDrawerWidth" | "setOplHeight" |
  "setOplMode" | "setLabelsOn" | "setInitialized" | "setModel" | "setParseError" | "setDiagnostics" |
  "setSchemas" | "setStoryId" | "setMethod" | "setSelection" | "setEdgeSel" | "storyOpen" | "setReveal" |
  "saveViewRef" | "wrapper" | "setSize" | "viewId" | "drawer" | "oplExpanded" | "oplMode" | "labelsOn" |
  "viewports" | "drawerWidth" | "oplHeight" | "storyId" | "initialized" | "showToast" | "setViewId" |
  "setMenu" | "needsFit"
>;

export function useHostMessages({
  setLanguage, saved, setDrawer, setOplExpanded, setDrawerWidth, setOplHeight, setOplMode, setLabelsOn,
  setInitialized, setModel, setParseError, setDiagnostics, setSchemas, setStoryId, setMethod, setSelection,
  setEdgeSel, storyOpen, setReveal, saveViewRef, wrapper, setSize, viewId, drawer, oplExpanded, oplMode,
  labelsOn, viewports, drawerWidth, oplHeight, storyId, initialized, showToast, setViewId, setMenu,
  needsFit
}: Input) {

  useEffect(() => {
    const onMessage = (e: MessageEvent<HostMessage>) => {
      const m = e.data;
      switch (m.type) {
        case "init":
          setLanguage(m.language);
          document.body.dataset.theme = m.theme;
          if (!saved) {
            const d: UiDefaults = m.defaults ?? {};
            if (d.drawerOpen !== undefined) setDrawer(d.drawerOpen);
            if (d.oplExpanded !== undefined) setOplExpanded(d.oplExpanded);
            if (d.drawerWidth) setDrawerWidth(d.drawerWidth);
            if (d.oplHeight) setOplHeight(d.oplHeight);
            if (d.oplMode) setOplMode(d.oplMode);
            if (d.labelsOn !== undefined) setLabelsOn(d.labelsOn);
          }
          setInitialized(true);
          return;
        case "model":
          setModel(m.model);
          setParseError(null);
          return;
        case "parseError":
          setParseError(m.line);
          return;
        case "diagnostics":
          setDiagnostics(m.items);
          return;
        case "schemas":
          setSchemas(m.files);
          return;
        case "reveal":
          if (m.method) { setStoryId(null); setMethod({ id: m.method, process: m.process }); return; }
          // a method view closes like a story, except when the text cursor moved
          if (!m.fromText) setMethod(null);
          if (m.storyId) {
            setStoryId(m.storyId);
            setSelection([]);
            setEdgeSel(null);
            return;
          }
          // the text cursor selects things on the diagram, but does not close a story being read
          if (m.fromText && storyOpen.current) return;
          setStoryId(null);
          setReveal({ elementId: m.elementId, viewId: m.viewId });
          return;
        case "theme":
          document.body.dataset.theme = m.theme;
          return;
        case "result":
          settle(m);
          return;
        case "requestSaveView":
          saveViewRef.current();
          return;
      }
    };
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [saved]);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- tab state and defaults ---------- */

  useEffect(() => {
    saveTabState({ viewId, drawer, oplExpanded, oplMode, labelsOn, viewports: viewports.current, drawerWidth, oplHeight, storyId } satisfies TabState);
  }, [viewId, drawer, oplExpanded, oplMode, labelsOn, drawerWidth, oplHeight, storyId]);

  useEffect(() => {
    if (initialized) post({ type: "defaults", defaults: { drawerOpen: drawer, oplExpanded, oplMode, labelsOn, drawerWidth, oplHeight } });
  }, [drawer, oplExpanded, oplMode, labelsOn, drawerWidth, oplHeight, initialized]);

  /* ---------- edits ---------- */

  const run = useCallback(async (op: Operation, opts: { quiet?: boolean } = {}): Promise<Result> => {
    const r = await edit(op);
    if (!r.ok && !opts.quiet) showToast(r.error ?? "Error", true);
    else if (r.ok && r.message && op.op !== "moveElements") showToast(r.message);
    return r;
  }, [showToast]);

  const goTo = useCallback((id: string) => {
    setViewId(id);
    setSelection([]);
    setEdgeSel(null);
    setMenu(null);
    needsFit.current = true;
  }, []);
  return {
    run, goTo
  };
}
