import { useCallback, useMemo } from "react";
import { uniqueId } from "../../core/edit";
import { essence, objects } from "../../core/model";
import { stories, storyTitle } from "../../core/stories";
import type { useDiagramState } from "./useDiagramState";
import type { useHostMessages } from "./useHostMessages";

type Input = Pick<ReturnType<typeof useDiagramState>,
  "model" | "frozen" | "setMethod" | "setSelection" | "setEdgeSel" | "setStoryId" | "storyId" | "storyOpen" |
  "diagnostics"
> & Pick<ReturnType<typeof useHostMessages>,
  "run"
>;

export function useStoryEditor({
  model, frozen, run, setMethod, setSelection, setEdgeSel, setStoryId, storyId, storyOpen, diagnostics
}: Input) {


  /* ---------- user story ---------- */

  const storyList = useMemo(() => (
    model ? Object.entries(stories(model)).map(([id, s]) => ({ id, title: storyTitle(id, s) })) : []
  ), [model]);

  const createNewStory = useCallback(async () => {
    if (!model || frozen) return;
    const existingPerformers = Object.entries(objects(model))
      .filter(([, o]) => o.role === "module" || essence(o) === "physical")
      .map(([id]) => id);
    const lanes = existingPerformers.length >= 2
      ? existingPerformers.slice(0, 3)
      : existingPerformers.length === 1
        ? [existingPerformers[0], "systemModule"]
        : ["user", "systemModule"];
    const takenStories = new Set(Object.keys(stories(model)));
    const newId = uniqueId(model, "procedure", takenStories);
    const dataObjs = Object.entries(objects(model))
      .filter(([, o]) => o.role !== "module" && essence(o) !== "physical")
      .map(([id]) => id);
    const defaultObj = dataObjs[0] ?? "requestData";
    await run({
      op: "setStory",
      id: newId,
      story: {
        title: `Procedure ${storyList.length + 1}`,
        story: "As a user I want to complete the procedure, so that the result is produced.",
        lanes,
        steps: [
          {
            lane: lanes[0],
            does: "Initiates the request.",
            handsOver: { object: defaultObj, state: "draft", to: lanes[1] ?? lanes[0] },
          },
          {
            lane: lanes[1] ?? lanes[0],
            does: "Processes the request and returns the result.",
            handsOver: { object: defaultObj, state: "ready", to: lanes[0] },
          },
        ],
        doneWhen: ["The procedure finishes without errors."],
      },
    });
    setMethod(null);
    setSelection([]);
    setEdgeSel(null);
    setStoryId(newId);
  }, [model, frozen, run, storyList.length]);

  // a story renamed or deleted in the text leaves the diagram in view
  const story = model && storyId ? stories(model)[storyId] : undefined;
  storyOpen.current = !!story;
  const storyDiagnostics = useMemo(() => diagnostics.filter((d) => d.story === storyId), [diagnostics, storyId]);
  return {
    storyList, createNewStory, story, storyDiagnostics
  };
}
