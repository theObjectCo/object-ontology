import { laneKind } from "../../core/stories";
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor,
  "t" | "saveStory" | "story" | "onRun" | "setAddingLane" | "addingLane" | "sentenceDraft"
  | "setSentenceDraft" | "availablePerformers" | "handleAddLane" | "L"
  | "model" | "newLaneName" | "setNewLaneName" | "newLaneKind"
  | "setNewLaneKind"
>;

export function MakigamiDetails({
  t, saveStory, story, onRun, setAddingLane, addingLane,
  sentenceDraft, setSentenceDraft, availablePerformers, handleAddLane, L,
  model, newLaneName, setNewLaneName, newLaneKind, setNewLaneKind,
}: Props) {
  return (<>
    {onRun ? (
      <div className="opm-story-sentence">
        <input
          className="opm-input opm-story-sentence-input"
          value={sentenceDraft}
          onChange={(e) => setSentenceDraft(e.target.value)}
          onBlur={() => {
            if (sentenceDraft.trim() && sentenceDraft !== story.story) {
              saveStory({ ...story, story: sentenceDraft.trim() });
            }
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
    ) : (
      <div className="opm-story-sentence">{story.story}</div>
    )}

    {addingLane && onRun && (
      <div className="opm-mk-bar">
        <b>{t.addLane}:</b>
        {availablePerformers.map((oid) => (
          <button key={oid} className="opm-pill suggestion" onClick={() => void handleAddLane(oid)}>
            + {L(oid)} ({laneKind(model, oid) === "module" ? t.module : t.agent})
          </button>
        ))}
        <input
          className="opm-input"
          style={{ width: 180 }}
          placeholder={t.label}
          value={newLaneName}
          onChange={(e) => setNewLaneName(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") void handleAddLane(); }}
        />
        <select className="opm-input" style={{ width: 120 }} value={newLaneKind} onChange={(e) => setNewLaneKind(e.target.value as "module" | "agent")}>
          <option value="module">{t.module}</option>
          <option value="agent">{t.agent}</option>
        </select>
        <button className="opm-button primary" onClick={() => void handleAddLane()}>+</button>
        <button className="opm-button" onClick={() => setAddingLane(false)}>{t.cancel}</button>
      </div>
    )}
  </>);
}
