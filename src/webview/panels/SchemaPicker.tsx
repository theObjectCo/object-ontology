import { useState } from "react";
import { objects } from "../../core/model";
import type { InspectorProps } from "./InspectorProps";

export function SchemaPicker({ p, id }: { p: InspectorProps; id: string }) {
  const [q, setQ] = useState("");
  const current = objects(p.model)[id]?.schema;
  const files = p.schemas
    .map((f) => ({ ...f, defs: f.defs.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.ref.toLowerCase().includes(q.toLowerCase())) }))
    .filter((f) => f.defs.length);
  return (
    <div className="opm-schema">
      <input className="opm-input" placeholder={p.t.searchSchema} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="opm-schema-list">
        <button className={!current ? "on" : ""} onClick={() => p.onUpdate(id, { schema: null })}>{p.t.noSchema}</button>
        {files.map((f) => (
          <div key={f.file}>
            <div className="opm-schema-file">{f.file}</div>
            {f.defs.map((d) => (
              <button key={d.ref} className={d.ref === current ? "on" : ""} onClick={() => p.onUpdate(id, { schema: d.ref })} title={d.ref}>
                {d.name}{d.enums.length ? <span className="opm-dim"> · {d.enums.join(", ")}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
