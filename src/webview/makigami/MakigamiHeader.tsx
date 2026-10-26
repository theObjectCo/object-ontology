import { humanize } from "../../core/model";
import { laneKind, storyTitle } from "../../core/stories";
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor, "onBack" | "t" | "editingHeader" | "titleDraft" | "setTitleDraft" | "setEditingHeader" | "saveStory" | "story" | "id" | "onRun" | "setAddingLane" | "addingLane" | "insertStep" | "steps" | "onDeleteStory" | "sentenceDraft" | "setSentenceDraft" | "availablePerformers" | "handleAddLane" | "L" | "model" | "newLaneName" | "setNewLaneName" | "newLaneKind" | "setNewLaneKind">;

export function MakigamiHeader({ onBack, t, editingHeader, titleDraft, setTitleDraft, setEditingHeader, saveStory, story, id, onRun, setAddingLane, addingLane, insertStep, steps, onDeleteStory, sentenceDraft, setSentenceDraft, availablePerformers, handleAddLane, L, model, newLaneName, setNewLaneName, newLaneKind, setNewLaneKind }: Props) {
  return (<>
    <div className="opm-story-head">
      <button className="opm-button" onClick={onBack} title={t.backHint}>‹ {t.diagram}</button>
      <span className="opm-dim">{t.userStory}</span>
      {editingHeader ? (
        <input
          className="opm-input"
          style={{ width: 220 }}
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            setEditingHeader(false);
            const clean = titleDraft.trim();
            saveStory({ ...story, title: !clean || clean === humanize(id) ? undefined : clean });
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setTitleDraft(story.title ?? humanize(id)); setEditingHeader(false); }
          }}
        />
      ) : (
        <b className="opm-story-title" onDoubleClick={() => onRun && setEditingHeader(true)} title={onRun ? t.editNote : undefined}>
          {storyTitle(id, story)}
        </b>
      )}
      <span className="opm-id">{id}</span>
      {onRun && (
        <div className="opm-story-actions">
          <button className="opm-button" onClick={() => setAddingLane(!addingLane)}>{t.addLane}</button>
          <button className="opm-button" onClick={() => insertStep(steps.length - 1)}>{t.addStep}</button>
          <button className="opm-button primary opm-mk-sync" title={t.syncStoryHint}
            onClick={() => void onRun({ op: "syncStory", id })}>{t.syncStory}</button>
          {onDeleteStory && (
            <button className="opm-button" title={t.deleteStory} onClick={onDeleteStory}>×</button>
          )}
        </div>
      )}
    </div>

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
