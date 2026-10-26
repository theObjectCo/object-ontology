
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor,
  "story" | "onRun" | "t" | "saveStory"
  | "addingCriterion" | "newCriterion" | "setNewCriterion" | "setAddingCriterion"
>;

export function MakigamiDoneCriteria({
  story, onRun, t, saveStory, addingCriterion,
  newCriterion, setNewCriterion, setAddingCriterion,
}: Props) {
  return (<>
    {(!!story.doneWhen?.length || onRun) && (
      <div className="opm-story-done">
        <b>{t.doneWhen}</b>
        {!!story.doneWhen?.length && (
          <ul>
            {story.doneWhen.map((d, i) => (
              <li key={i}>
                <span>{d}</span>
                {onRun && (
                  <button
                    className="link opm-x"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      const next = (story.doneWhen ?? []).filter((_, idx) => idx !== i);
                      saveStory({ ...story, doneWhen: next.length ? next : undefined });
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {onRun && (
          addingCriterion ? (
            <div className="opm-inline-row" style={{ marginTop: 6, maxWidth: 520 }}>
              <input
                className="opm-input"
                autoFocus
                value={newCriterion}
                placeholder={t.doneWhen}
                onChange={(e) => setNewCriterion(e.target.value)}
                onBlur={() => {
                  const c = newCriterion.trim();
                  setAddingCriterion(false);
                  setNewCriterion("");
                  if (c) saveStory({ ...story, doneWhen: [...(story.doneWhen ?? []), c] });
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") { setAddingCriterion(false); setNewCriterion(""); }
                }}
              />
            </div>
          ) : (
            <button className="opm-pill add" style={{ marginTop: 4 }} onClick={() => setAddingCriterion(true)}>
              {t.addCriterion}
            </button>
          )
        )}
      </div>
    )}
  </>);
}
