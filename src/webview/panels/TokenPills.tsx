import { useState } from "react";

export function TokenPills({ items, suggestions, addLabel, prefix, onChange }: {
  items: string[];
  suggestions: string[];
  addLabel: string;
  prefix: "can_" | "owns_";
  onChange: (next: string[] | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const normalize = (raw: string) => {
    const s = raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!s) return "";
    return s.startsWith(prefix) ? s : `${prefix}${s}`;
  };
  const add = (val: string) => {
    const token = normalize(val);
    if (!token || token === prefix || items.includes(token)) return;
    onChange([...items, token]);
  };
  const remove = (val: string) => {
    const next = items.filter((x) => x !== val);
    onChange(next.length ? next : null);
  };
  const unused = suggestions.filter((s) => !items.includes(s));
  return (
    <div className="opm-pills">
      {items.map((item) => (
        <span key={item} className="opm-pill mono">
          <span>{item}</span>
          <button className="opm-x" onClick={() => remove(item)} aria-label={`Remove ${item}`}>×</button>
        </span>
      ))}
      {unused.map((s) => (
        <button key={s} className="opm-pill suggestion mono" onClick={() => add(s)}>+ {s}</button>
      ))}
      {adding ? (
        <input
          className="opm-pill-input mono"
          autoFocus
          defaultValue={prefix}
          onBlur={(e) => { setAdding(false); add(e.target.value); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setAdding(false);
          }}
        />
      ) : (
        <button className="opm-pill add mono" onClick={() => setAdding(true)}>{addLabel}</button>
      )}
    </div>
  );
}
