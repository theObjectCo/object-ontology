import { useContextActions } from "./useContextActions";
import { useDiagramActions } from "./useDiagramActions";
import { useDiagramEvents } from "./useDiagramEvents";
import { useDiagramKeyboard } from "./useDiagramKeyboard";
import { useDiagramNodes } from "./useDiagramNodes";
import { useDiagramState } from "./useDiagramState";
import { useDiagramView } from "./useDiagramView";
import { useDiagramViewport } from "./useDiagramViewport";
import { useHostMessages } from "./useHostMessages";
import { useInspectorPresentation } from "./useInspectorPresentation";
import { useStoryEditor } from "./useStoryEditor";

/** Compose editor responsibilities in stable hook order, keeping all state in one App instance. */
export function useDiagramEditor() {
  const state = useDiagramState();
  const host = { ...state, ...useHostMessages(state) };
  const view = { ...host, ...useDiagramView(host) };
  const diagram = { ...view, ...useDiagramNodes(view) };
  useDiagramViewport(diagram);
  const events = { ...diagram, ...useDiagramEvents(diagram) };
  const actions = { ...events, ...useDiagramActions(events) };
  const stories = { ...actions, ...useStoryEditor(actions) };
  useDiagramKeyboard(stories);
  const presentation = { ...stories, ...useInspectorPresentation(stories) };
  const editor = { ...presentation, ...useContextActions(presentation) };
  return editor;
}
