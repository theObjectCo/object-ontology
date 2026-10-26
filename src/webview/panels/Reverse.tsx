import { EditorLink } from "../../core/links";
import { label } from "../../core/model";
import type { InspectorProps } from "./InspectorProps";

export function Reverse({ p, link, allowed }: { p: InspectorProps; link: EditorLink; allowed: boolean }) {
  return (
    <>
      <div className="opm-row readonly"><span>{p.t.source}</span><span>{label(p.model, link.from)}</span></div>
      <div className="opm-row readonly"><span>{p.t.target}</span><span>{label(p.model, link.to)}</span></div>
      {allowed && <button className="opm-button" onClick={() => p.onUpdateLink(link.id, { reverse: true })}>⇄ {p.t.reverse}</button>}
    </>
  );
}
