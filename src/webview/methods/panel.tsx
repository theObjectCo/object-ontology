import { useMemo, useState } from "react";
import { METHODS, MethodId } from "../../core/methods/common";
import { dsm } from "../../core/methods/dsm";
import { flow } from "../../core/methods/flow";
import { idef0 } from "../../core/methods/idef0";
import { methodProcesses } from "../../core/methods/index";
import { sipoc } from "../../core/methods/sipoc";
import { Model, label } from "../../core/model";
import { FlowView } from "./flow";
import { Idef0View } from "./idef0";
import { methodMessages } from "./messages";
import { DsmView, SipocView } from "./tables";
import "./methods.css";

export interface MethodState {
  id: MethodId;
  process?: string;
}

/**
 * A read-only view of the model drawn by one method, over the diagram. It is computed from the model on
 * every render, so a change of the text redraws it.
 */
export function MethodPanel({ model, state, language, onChange, onClose }: {
  model: Model;
  state: MethodState;
  language: string;
  onChange: (state: MethodState) => void;
  onClose: () => void;
}) {
  const t = methodMessages(language);
  const [withAgents, setWithAgents] = useState(true);
  const options = useMemo(() => methodProcesses(model, state.id), [model, state.id]);
  const process = state.process && options.includes(state.process) ? state.process : options[0];

  const body = useMemo(() => {
    if (state.id === "dsm") {
      const d = dsm(model, { agents: withAgents });
      return d.order.length ? <DsmView model={model} d={d} t={t} /> : <p className="opm-dim">{t.noMatrix}</p>;
    }
    if (!process) return <p className="opm-dim">{state.id === "flow" ? t.noFlow : t.noProcess}</p>;
    if (state.id === "idef0") return <Idef0View model={model} d={idef0(model, process)} t={t} />;
    if (state.id === "sipoc") return <SipocView model={model} s={sipoc(model, process)} t={t} />;
    return <FlowView model={model} f={flow(model, process)} t={t} />;
  }, [model, state.id, process, withAgents, t]);

  const hint = { idef0: t.idef0Hint, sipoc: t.sipocHint, dsm: t.dsmHint, flow: t.flowHint }[state.id];
  return (
    <div className="opm-method">
      <div className="opm-method-head">
        <div className="opm-seg">
          {METHODS.map((m) => (
            <button key={m} className={m === state.id ? "on" : ""} onClick={() => onChange({ id: m, process })}>{t.names[m]}</button>
          ))}
        </div>
        {state.id === "dsm" ? (
          <label className="opm-method-option">
            <input type="checkbox" checked={withAgents} onChange={(e) => setWithAgents(e.target.checked)} /> {t.agents}
          </label>
        ) : options.length > 0 && (
          <label className="opm-method-option">
            {t.process}{" "}
            <select className="opm-input" value={process} onChange={(e) => onChange({ id: state.id, process: e.target.value })}>
              {options.map((p) => <option key={p} value={p}>{label(model, p)}</option>)}
            </select>
          </label>
        )}
        <span className="opm-method-spacer" />
        <button className="opm-button" onClick={onClose} title="Esc">{t.back}</button>
      </div>
      <div className="opm-method-body">
        <p className="opm-dim">{hint} {t.readOnly}</p>
        {body}
      </div>
    </div>
  );
}
