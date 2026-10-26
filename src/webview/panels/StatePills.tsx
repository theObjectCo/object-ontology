import { useMemo, useState } from "react";
import { objects } from "../../core/model";
import type { InspectorProps } from "./InspectorProps";

export function StatePills({ p, id, editable }: { p: InspectorProps; id: string; editable: boolean }) {
  const o = objects(p.model)[id];
  const states = o?.states ?? [];
  const enums = useMemo(() => {
    if (!o?.schema) return [];
    for (const f of p.schemas) for (const d of f.defs) if (d.ref === o.schema) return d.enums;
    return [];
  }, [o?.schema, p.schemas]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const suggestions = enums.filter((e) => !states.includes(e));
  return (
    <div className="opm-pills">
      {states.map((s, i) => (
        <span key={s} className="opm-pill" draggable={editable}
              onDragStart={() => setDrag(s)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag && drag !== s) p.onMoveState(id, drag, i); setDrag(null); }}>
          {renaming === s
            ? <input className="opm-pill-input" autoFocus defaultValue={s}
                     onBlur={(e) => { setRenaming(null); if (e.target.value && e.target.value !== s) p.onRenameState(id, s, e.target.value); }}
                     onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
            : <span onDoubleClick={() => editable && setRenaming(s)}>{s}</span>}
          {editable && <button className="opm-x" onClick={() => p.onDeleteState(id, s)} aria-label="Delete state">×</button>}
        </span>
      ))}
      {suggestions.map((s) => <button key={s} className="opm-pill suggestion" onClick={() => p.onAddState(id, s)}>+ {s}</button>)}
      <button className="opm-pill add" onClick={() => p.onAddState(id)}>{p.t.addState}</button>
    </div>
  );
}
