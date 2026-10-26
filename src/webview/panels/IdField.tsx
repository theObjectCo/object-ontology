import { useEffect, useState } from "react";
import { Messages } from "../../shared/i18n";

export function IdField({ id, onRename, t }: { id: string; onRename: (o: string, n: string) => Promise<string | undefined>; t: Messages }) {
  const [v, setV] = useState(id);
  const [error, setError] = useState<string>();
  useEffect(() => { setV(id); setError(undefined); }, [id]);
  const valid = /^[a-z][A-Za-z0-9]*$/.test(v);
  const commit = async () => {
    if (v === id) return;
    if (!valid) return setError("camelCase, a–z first");
    setError(await onRename(id, v));
  };
  return (
    <>
      <input id="opm-id-field" className={`opm-input mono${error || !valid ? " invalid" : ""}`} value={v}
             onChange={(e) => { setV(e.target.value); setError(undefined); }} onBlur={commit}
             onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") void commit(); if (e.key === "Escape") setV(id); }} />
      {(error || !valid) && <div className="opm-field-error">{error ?? "camelCase, a–z first"}</div>}
    </>
  );
}
