import { CanvasToolbar } from "../../../vendor/object-kit/components/studio/CanvasToolbar";
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor, "onRun" | "t" | "setAddingLane" | "addingLane"
  | "insertStep" | "steps" | "id" | "onDeleteStory">;

export function MakigamiActions({ onRun, t, setAddingLane, addingLane, insertStep,
  steps, id, onDeleteStory }: Props) {
  if (!onRun) return null;
  return <div className="opm-story-actions">
    <CanvasToolbar className="opm-story-tools" groups={[[
      { id: "lane", label: t.addLane, active: addingLane, onClick: () => setAddingLane(!addingLane) },
      { id: "step", label: t.addStep, onClick: () => void insertStep(steps.length - 1) },
    ]]} />
    <button className="opm-button primary opm-mk-sync" title={t.syncStoryHint}
      onClick={() => void onRun({ op: "syncStory", id })}>{t.syncStory}</button>
    {onDeleteStory && <button className="opm-button" title={t.deleteStory} onClick={onDeleteStory}>×</button>}
  </div>;
}
