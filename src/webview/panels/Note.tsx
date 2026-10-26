import { useEffect, useState } from "react";
import { Messages } from "../../shared/i18n";
import { Markdown } from "../markdown";

/** A note in Markdown: shown with clickable links, edited as text after a click on it. */
export function Note({ value, onCommit, onLink, t }: { value: string; onCommit: (v: string | null) => void; onLink: (href: string) => void; t: Messages }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (value && !editing) {
    return (
      <div className="opm-note" title={t.editNote} tabIndex={0}
           onClick={() => setEditing(true)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}>
        <Markdown text={value} onLink={onLink} />
      </div>
    );
  }
  const commit = () => {
    setEditing(false);
    if (v.trim() !== value.trim()) onCommit(v.trim() ? v : null);
  };
  return (
    <textarea className="opm-input opm-note-input" autoFocus={editing} value={v} placeholder={t.notePlaceholder}
              rows={Math.max(3, Math.min(16, v.split("\n").length + 1))}
              onChange={(e) => setV(e.target.value)} onBlur={commit}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { setV(value); setEditing(false); } }} />
  );
}
