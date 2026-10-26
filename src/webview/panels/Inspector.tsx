import { objects, processes, humanize, label } from "../../core/model";
import { format } from "../../shared/i18n";
import type { InspectorProps } from "./InspectorProps";
import { LinkFields } from "./LinkFields";
import { Section } from "./Section";
import { IdField } from "./IdField";
import { Field } from "./Field";
import { Note } from "./Note";
import { StatePills } from "./StatePills";
import { CapabilitiesSection } from "./CapabilitiesSection";
import { SchemaPicker } from "./SchemaPicker";
import { Classification } from "./Classification";
import { InspectorFrame } from "./InspectorFrame";

export function Inspector(p: InspectorProps) {
  if (p.link) {
    return (
      <InspectorFrame title={p.t.link} onLess={p.onLess} lessLabel={p.t.less}>
        <LinkFields p={p} link={p.link} />
      </InspectorFrame>
    );
  }
  if (p.ids.length > 1) {
    return (
      <InspectorFrame title={format(p.t.elements, { n: p.ids.length })}>
        <div className="opm-actions">
          <button className="opm-button" onClick={p.onDelete}>{p.t.delete}</button>
          <button className="opm-button" onClick={p.onCopy}>{p.t.copy}</button>
          <button className="opm-button" onClick={p.onSaveView}>{p.t.saveAsView}</button>
        </div>
      </InspectorFrame>
    );
  }
  const id = p.ids[0];
  const isObject = !!objects(p.model)[id];
  const def = objects(p.model)[id] ?? processes(p.model)[id];
  if (!def) return null;
  return (
    <InspectorFrame title={label(p.model, id)} onLess={p.onLess} lessLabel={p.t.less}>
      <Section title={p.t.basic}>
        <div className="opm-row"><span>{p.t.id}</span><div className="opm-grow"><IdField id={id} onRename={p.onRename} t={p.t} /></div></div>
        <div className="opm-row"><span>{p.t.label}</span>
          <Field value={def.label ?? humanize(id)} onCommit={(v) => p.onUpdate(id, { label: !v || v === humanize(id) ? null : v })} /></div>
        <div className="opm-row"><span>{p.t.description}</span>
          <Field multiline value={def.description ?? ""} onCommit={(v) => p.onUpdate(id, { description: v || null })} /></div>
      </Section>
      <Section title={p.t.note}>
        <Note value={def.note ?? ""} onCommit={(v) => p.onUpdate(id, { note: v })} onLink={p.onOpenLink} t={p.t} />
      </Section>
      {isObject && <Section title={p.t.states}><StatePills p={p} id={id} editable /></Section>}
      <CapabilitiesSection p={p} id={id} />
      {isObject && <Section title={p.t.jsonSchema}><SchemaPicker p={p} id={id} /></Section>}
      <Classification p={p} id={id} />
      <div className="opm-actions">
        {!isObject && <button className="link" onClick={() => p.onOpenZoom(id)}>{p.t.openZoom}</button>}
        <button className="link" onClick={() => p.onShowJson(id)}>{p.t.showInJson}</button>
      </div>
    </InspectorFrame>
  );
}
