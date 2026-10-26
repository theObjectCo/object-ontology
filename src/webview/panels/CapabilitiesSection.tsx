import { objects, processes, deriveCapabilityId, deriveAuthorityId, essence, refObject, refIds } from "../../core/model";
import type { InspectorProps } from "./InspectorProps";
import { Section } from "./Section";
import { Field } from "./Field";
import { TokenPills } from "./TokenPills";

export function CapabilitiesSection({ p, id }: { p: InspectorProps; id: string }) {
  const objs = objects(p.model);
  const procs = processes(p.model);
  const o = objs[id];
  const proc = procs[id];

  if (proc) {
    const derived = deriveCapabilityId(id);
    const summary = proc.capability ?? "";
    return (
      <Section title={p.t.capabilitiesSection} summary={summary} open={!!proc.capability}>
        <div className="opm-row">
          <span>{p.t.capability}</span>
          <div className="opm-grow opm-inline-row">
            <Field mono value={proc.capability ?? ""} placeholder={derived}
                   onCommit={(v) => p.onUpdate(id, { capability: v.trim() || null })} />
            {proc.capability !== derived && (
              <button className="opm-button" onClick={() => p.onUpdate(id, { capability: derived })}>{p.t.derive}</button>
            )}
          </div>
        </div>
      </Section>
    );
  }

  if (!o) return null;
  const isPerformer = o.role === "module" || essence(o) === "physical";
  if (!isPerformer) {
    const derived = deriveAuthorityId(id);
    return (
      <Section title={p.t.capabilitiesSection} summary={o.authority ?? ""} open={!!o.authority}>
        <div className="opm-row">
          <span>{p.t.authority}</span>
          <div className="opm-grow opm-inline-row">
            <Field mono value={o.authority ?? ""} placeholder={derived}
                   onCommit={(v) => p.onUpdate(id, { authority: v.trim() || null })} />
            {o.authority !== derived && (
              <button className="opm-button" onClick={() => p.onUpdate(id, { authority: derived })}>{p.t.derive}</button>
            )}
          </div>
        </div>
      </Section>
    );
  }

  // Suggestions for a module or agent based on the processes it performs and the objects those processes yield/change
  const performedProcs = Object.keys(procs).filter((pid) =>
    o.role === "module"
      ? (procs[pid].requires ?? []).some((r) => refObject(r) === id)
      : refIds(procs[pid].handledBy).includes(id),
  );
  const capSuggestions = [...new Set(performedProcs.map((pid) => procs[pid].capability ?? deriveCapabilityId(pid)))];
  const touchedObjs = [...new Set(performedProcs.flatMap((pid) => [
    ...(procs[pid].yields ?? []).map(refObject),
    ...refIds(procs[pid].affects),
    ...(procs[pid].changes ?? []).map((c) => c.object),
  ]))].filter((oid) => oid !== id && objs[oid]?.role !== "module");
  const authSuggestions = [...new Set(touchedObjs.map((oid) => objs[oid]?.authority ?? deriveAuthorityId(oid)))];
  const hasAny = Boolean(o.deploymentName || o.capabilities?.length || o.owns?.length);
  const summary = [
    o.deploymentName,
    o.capabilities?.length ? `${o.capabilities.length} can_*` : "",
    o.owns?.length ? `${o.owns.length} owns_*` : "",
  ].filter(Boolean).join(" · ");

  return (
    <Section title={p.t.capabilitiesSection} summary={summary} open={hasAny}>
      <div className="opm-row">
        <span>{p.t.deploymentName}</span>
        <Field mono value={o.deploymentName ?? ""} placeholder={`${id}_v1.0.0`}
               onCommit={(v) => p.onUpdate(id, { deploymentName: v.trim() || null })} />
      </div>
      <div className="opm-row">
        <span>{p.t.capabilities}</span>
        <div className="opm-grow">
          <TokenPills
            items={o.capabilities ?? []}
            suggestions={capSuggestions}
            addLabel={p.t.addCapability}
            prefix="can_"
            onChange={(next) => p.onUpdate(id, { capabilities: next })}
          />
        </div>
      </div>
      <div className="opm-row">
        <span>{p.t.owns}</span>
        <div className="opm-grow">
          <TokenPills
            items={o.owns ?? []}
            suggestions={authSuggestions}
            addLabel={p.t.addAuthority}
            prefix="owns_"
            onChange={(next) => p.onUpdate(id, { owns: next })}
          />
        </div>
      </div>
    </Section>
  );
}
