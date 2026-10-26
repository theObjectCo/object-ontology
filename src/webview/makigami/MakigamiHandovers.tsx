
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor, "arrows" | "selectedStep" | "editingField" | "onRun" | "setSelectedStep" | "setEditingField" | "t" | "updateStep" | "steps" | "lanes" | "L" | "thing">;

export function MakigamiHandovers({ arrows, selectedStep, editingField, onRun, setSelectedStep, setEditingField, t, updateStep, steps, lanes, L, thing }: Props) {
  return (<>
    {arrows.map((a) => {
      const isEditingHandover = selectedStep === a.k && editingField === "handover" && !!onRun;
      return (
        <div
          key={a.k}
          className={`opm-mk-handover${isEditingHandover ? " editing" : ""}`}
          style={{ left: a.x, top: a.y }}
          onClick={(e) => {
            if (!onRun) return;
            e.stopPropagation();
            setSelectedStep(a.k);
            setEditingField(isEditingHandover ? null : "handover");
          }}
        >
          {isEditingHandover ? (
            <div className="opm-mk-handover-pop" onClick={(e) => e.stopPropagation()}>
              <input
                className="opm-input mono"
                style={{ width: 92 }}
                list="opm-mk-objects"
                value={a.object}
                title={t.handedObject}
                onChange={(e) => {
                  const obj = e.target.value.trim();
                  if (obj) updateStep(a.k, { handsOver: { ...steps[a.k].handsOver!, object: obj } });
                }}
              />
              <input
                className="opm-input mono"
                style={{ width: 72 }}
                list="opm-mk-states"
                placeholder={t.handedState}
                value={a.state ?? ""}
                title={t.handedState}
                onChange={(e) => updateStep(a.k, { handsOver: { ...steps[a.k].handsOver!, state: e.target.value.trim() || undefined } })}
              />
              <select
                className="opm-input"
                style={{ width: 100 }}
                value={a.to}
                title={t.handsOverTo}
                onChange={(e) => {
                  const to = e.target.value;
                  if (!to) updateStep(a.k, { handsOver: undefined });
                  else updateStep(a.k, { handsOver: { ...steps[a.k].handsOver!, to } });
                }}
              >
                <option value="">({t.none})</option>
                {lanes.map((l) => <option key={l} value={l}>→ {L(l)}</option>)}
              </select>
              <button type="button" className="opm-button" onClick={() => setEditingField(null)}>✓</button>
            </div>
          ) : (
            <>
              {thing(a.object, "opm-mk-object")}{a.state && <i> [{a.state}]</i>}
            </>
          )}
        </div>
      );
    })}
  </>);
}
