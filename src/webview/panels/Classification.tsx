import { objects, processes, essence, affiliation } from "../../core/model";
import type { InspectorProps } from "./InspectorProps";
import { Section } from "./Section";

export function Classification({ p, id }: { p: InspectorProps; id: string }) {
  const isObject = !!objects(p.model)[id];
  const def = (objects(p.model)[id] ?? processes(p.model)[id])!;
  const ess = essence(def), aff = affiliation(def);
  const summary = [ess === "physical" ? p.t.physical : p.t.informatical, aff === "environmental" ? p.t.environmental : p.t.systemic,
    isObject ? `${p.t.module.toLowerCase()}: ${objects(p.model)[id].role === "module" ? p.t.yes : p.t.no}` : ""].filter(Boolean).join(" · ");
  const radio = (name: string, value: string, current: string, text: string, onPick: () => void) => (
    <label className="opm-radio"><input type="radio" name={`${id}-${name}`} checked={current === value} onChange={onPick} /> {text}</label>
  );
  return (
    <Section title={p.t.classification} summary={summary} open={false}>
      {isObject && (
        <div className="opm-row"><span>{p.t.module}</span>
          <div className="opm-choices">
            <label className="opm-radio"><input type="checkbox" checked={objects(p.model)[id].role === "module"} onChange={(e) => p.onUpdate(id, { role: e.target.checked })} /> {p.t.yes}</label>
          </div>
        </div>
      )}
      <div className="opm-row"><span>{p.t.essence}</span>
        <div className="opm-choices">
          {radio("essence", "informatical", ess, p.t.informatical, () => p.onUpdate(id, { essence: null }))}
          {radio("essence", "physical", ess, p.t.physical, () => p.onUpdate(id, { essence: "physical" }))}
        </div>
      </div>
      <div className="opm-row"><span>{p.t.affiliation}</span>
        <div className="opm-choices">
          {radio("aff", "systemic", aff, p.t.systemic, () => p.onUpdate(id, { affiliation: null }))}
          {radio("aff", "environmental", aff, p.t.environmental, () => p.onUpdate(id, { affiliation: "environmental" }))}
        </div>
      </div>
    </Section>
  );
}
