import { useEffect } from "react";
import { post } from "../vscode";
import { rectOf } from "./rectOf";
import type { useDiagramState } from "./useDiagramState";
import type { useDiagramView } from "./useDiagramView";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "fitAfterLayout" | "positions" | "flow" | "nodes" | "layingOut" | "settledView" | "viewId" | "needsFit" |
  "viewports" | "centerOn" | "fromHost" | "selection"
> & Pick<ReturnType<typeof useDiagramView>,
  "content" | "shapes"
>;

export function useDiagramViewport({
  fitAfterLayout, positions, flow, nodes, layingOut, settledView, viewId, needsFit, viewports, centerOn,
  content, shapes, fromHost, selection
}: Input) {


  /* ---------- fitting and centering ---------- */

  useEffect(() => {
    const expected = fitAfterLayout.current;
    if (!expected || !Object.entries(expected).every(([id, [x, y]]) => positions[id]?.[0] === x && positions[id]?.[1] === y)) return;
    fitAfterLayout.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => void flow.fitView({ padding: 0.15, maxZoom: 1, duration: 200 })));
  }, [positions, flow]);

  useEffect(() => {
    if (!nodes.length || layingOut || settledView !== viewId) return;
    if (needsFit.current) {
      needsFit.current = false;
      const vp = viewports.current[viewId];
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (vp) void flow.setViewport(vp);
        else void flow.fitView({ padding: 0.15, maxZoom: 1 });
      }));
    }
    if (centerOn.current && content && shapes) {
      const r = rectOf(content, shapes, positions, centerOn.current);
      centerOn.current = null;
      if (r) requestAnimationFrame(() => void flow.setCenter(r.x + r.w / 2, r.y + r.h / 2, { zoom: flow.getZoom(), duration: 200 }));
    }
  }, [nodes, layingOut, settledView, flow, viewId, content, shapes, positions]);

  // the diagram selection moves the cursor in a visible text editor of the same file
  useEffect(() => {
    if (fromHost.current) { fromHost.current = false; return; }
    if (selection.length === 1) post({ type: "revealInText", id: selection[0], open: false });
  }, [selection]);
}
