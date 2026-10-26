import { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useState } from "react";

export function Field({ value, onCommit, mono, placeholder, multiline }: { value: string; onCommit: (v: string) => void; mono?: boolean; placeholder?: string; multiline?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  const props = {
    className: `opm-input${mono ? " mono" : ""}`, value: v, placeholder,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: ReactKeyboardEvent) => { e.stopPropagation(); if (e.key === "Enter" && !multiline) commit(); if (e.key === "Escape") setV(value); },
  };
  return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
}
