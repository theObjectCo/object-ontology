import { ReactNode, useState } from "react";

export function Section({ title, summary, open: initial = true, children }: { title: string; summary?: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="opm-section">
      <button className="opm-section-head" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title.toUpperCase()}{!open && summary && <span className="opm-dim"> {summary}</span>}
      </button>
      {open && <div className="opm-section-body">{children}</div>}
    </div>
  );
}
