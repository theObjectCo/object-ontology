import { humanize } from "../../core/model";
import { storyTitle } from "../../core/stories";
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor, "onBack" | "t" | "editingHeader" | "titleDraft"
  | "setTitleDraft" | "setEditingHeader" | "saveStory" | "story" | "id" | "onRun">;

export function MakigamiTitle({ onBack, t, editingHeader, titleDraft, setTitleDraft,
  setEditingHeader, saveStory, story, id, onRun }: Props) {
  return <span className="opm-story-title-block">
    <button className="opm-button" onClick={onBack} title={t.backHint}>‹ {t.diagram}</button>
    <span className="opm-dim">{t.userStory}</span>
    {editingHeader ? <input className="opm-input" style={{ width: 220 }} autoFocus
      value={titleDraft} onChange={event => setTitleDraft(event.target.value)}
      onBlur={() => {
        setEditingHeader(false);
        const clean = titleDraft.trim();
        saveStory({ ...story, title: !clean || clean === humanize(id) ? undefined : clean });
      }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        if (event.key === "Escape") { setTitleDraft(story.title ?? humanize(id)); setEditingHeader(false); }
      }}
    /> : <b className="opm-story-title" onDoubleClick={() => onRun && setEditingHeader(true)}
      title={onRun ? t.editNote : undefined}>{storyTitle(id, story)}</b>}
    <span className="opm-id">{id}</span>
  </span>;
}
