import { EditorLink, EditorLinkKind, STATEFUL, allowedKinds } from "../../core/links";
import { LINK_WORDS } from "../../shared/i18n";
import { objects } from "../../core/model";
import type { InspectorProps } from "./InspectorProps";
import { Field } from "./Field";
import { Reverse } from "./Reverse";
import { Note } from "./Note";

export function LinkFields({ p, link }: { p: InspectorProps; link: EditorLink }) {
  const words = LINK_WORDS[p.language.toLowerCase().startsWith("pl") ? "pl" : "en"];
  const kinds = allowedKinds(p.model, link.from, link.to);
  const owner = link.kind === "result" ? link.to : link.from;
  const states = objects(p.model)[owner]?.states ?? [];
  const canFrom = STATEFUL[link.kind].from && states.length > 0;
  const canTo = STATEFUL[link.kind].to && states.length > 0;
  const reverseAllowed = allowedKinds(p.model, link.to, link.from).includes(link.kind);
  return (
    <>
      <div className="opm-row"><span>{p.t.kind}</span>
        <select className="opm-input" value={link.kind} onChange={(e) => p.onUpdateLink(link.id, { kind: e.target.value as EditorLinkKind })}>
          {kinds.map((k) => <option key={k} value={k}>{words[k] ?? k}</option>)}
        </select>
      </div>
      {canFrom && (
        <div className="opm-row"><span>{p.t.from}</span>
          <select className="opm-input" value={link.fromState ?? ""} onChange={(e) => p.onUpdateLink(link.id, { fromState: e.target.value || null })}>
            <option value="">{p.t.none}</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      {canTo && (
        <div className="opm-row"><span>{p.t.to}</span>
          <select className="opm-input" value={link.toState ?? ""} onChange={(e) => p.onUpdateLink(link.id, { toState: e.target.value || null })}>
            <option value="">{p.t.none}</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      {link.kind === "tagged" && (
        <div className="opm-row"><span>{p.t.tag}</span><Field value={link.tag ?? ""} onCommit={(v) => p.onUpdateLink(link.id, { tag: v })} /></div>
      )}
      <Reverse p={p} link={link} allowed={reverseAllowed} />
      <div className="opm-note-head">{p.t.note}</div>
      <Note value={link.note ?? ""} onCommit={(v) => p.onUpdateLink(link.id, { note: v })} onLink={p.onOpenLink} t={p.t} />
    </>
  );
}
