import { idFromLabel } from "../../core/edit";
import { StudioPanel } from "../../../vendor/object-kit/components/studio/StudioPanel";
import { objects, processes } from "../../core/model";
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor,
  "activeStep" | "selectedStep" | "onRun" | "t"
  | "updateStep" | "lanes" | "L" | "model"
  | "moveStep" | "steps" | "insertStep" | "deleteStep"
  | "setSelectedStep" | "setEditingField" | "dataObjects"
>;

export function MakigamiStepEditor({
  activeStep, selectedStep, onRun, t, updateStep,
  lanes, L, model, moveStep, steps,
  insertStep, deleteStep, setSelectedStep, setEditingField, dataObjects,
}: Props) {
  return (<>
    {activeStep && selectedStep !== null && onRun && (
      <div className="opm-mk-editor" onKeyDown={(e) => e.stopPropagation()}>
        <StudioPanel variant="floating" testId="opm-story-step" title={<>{t.stepEditor} #{selectedStep + 1}</>}
          actions={<div className="opm-mk-step-btns">
            <button className="opm-button" disabled={selectedStep === 0} onClick={() => moveStep(selectedStep, -1)} title="Move left">←</button>
            <button className="opm-button" disabled={selectedStep >= steps.length - 1} onClick={() => moveStep(selectedStep, 1)} title="Move right">→</button>
            <button className="opm-button" onClick={() => insertStep(selectedStep)} title="Insert step after">+ {t.stepEditor}</button>
            <button className="opm-button" disabled={steps.length <= 1} onClick={() => deleteStep(selectedStep)} title={t.delete}>🗑</button>
            <button className="opm-button" onClick={() => { setSelectedStep(null); setEditingField(null); }}>{t.close}</button>
          </div>}>
        <div className="opm-mk-editor-row">
          <label>
            <span>{t.lanes}:</span>
            <select className="opm-input" value={activeStep.lane} onChange={(e) => updateStep(selectedStep, { lane: e.target.value })}>
              {lanes.map((l) => <option key={l} value={l}>{L(l)}</option>)}
            </select>
          </label>
          <label className="opm-grow">
            <span>{t.whatStepDoes}:</span>
            <input
              className="opm-input"
              value={activeStep.does}
              onChange={(e) => updateStep(selectedStep, { does: e.target.value || "Step" })}
            />
          </label>
          <label>
            <span>{t.process}:</span>
            <input
              className="opm-input mono"
              list="opm-mk-processes"
              placeholder={idFromLabel(activeStep.does) || "processId"}
              value={activeStep.process ?? ""}
              onChange={(e) => updateStep(selectedStep, { process: e.target.value.trim() || undefined })}
            />
            <datalist id="opm-mk-processes">
              {Object.keys(processes(model)).map((pid) => <option key={pid} value={pid}>{L(pid)}</option>)}
            </datalist>
          </label>
        </div>
        <div className="opm-mk-editor-row">
          <label>
            <span>{t.handsOverTo}:</span>
            <select
              className="opm-input"
              value={activeStep.handsOver?.to ?? ""}
              onChange={(e) => {
                const to = e.target.value;
                if (!to) {
                  updateStep(selectedStep, { handsOver: undefined });
                } else {
                  const obj = activeStep.handsOver?.object || dataObjects[0] || "dataObject";
                  updateStep(selectedStep, { handsOver: { ...activeStep.handsOver, to, object: obj } });
                }
              }}
            >
              <option value="">({t.none})</option>
              {lanes.map((l) => <option key={l} value={l}>{L(l)}</option>)}
            </select>
          </label>
          {activeStep.handsOver && (
            <>
              <label>
                <span>{t.handedObject}:</span>
                <input
                  className="opm-input mono"
                  list="opm-mk-objects"
                  value={activeStep.handsOver.object}
                  onChange={(e) => {
                    const obj = e.target.value.trim();
                    if (obj) updateStep(selectedStep, { handsOver: { ...activeStep.handsOver!, object: obj } });
                  }}
                />
                <datalist id="opm-mk-objects">
                  {dataObjects.map((oid) => <option key={oid} value={oid}>{L(oid)}</option>)}
                </datalist>
              </label>
              <label>
                <span>{t.handedState}:</span>
                <input
                  className="opm-input mono"
                  list="opm-mk-states"
                  placeholder={`(${t.none})`}
                  value={activeStep.handsOver.state ?? ""}
                  onChange={(e) => {
                    const st = e.target.value.trim();
                    updateStep(selectedStep, {
                      handsOver: { ...activeStep.handsOver!, state: st || undefined },
                    });
                  }}
                />
                <datalist id="opm-mk-states">
                  {(objects(model)[activeStep.handsOver.object]?.states ?? []).map((st) => <option key={st} value={st} />)}
                </datalist>
              </label>
            </>
          )}
          <label>
            <span>{t.waits}:</span>
            <input
              className="opm-input"
              placeholder="e.g. 2 min"
              value={activeStep.waits ?? ""}
              onChange={(e) => updateStep(selectedStep, { waits: e.target.value || undefined })}
            />
          </label>
          <label className="opm-grow">
            <span>🟥 {t.problemRedCard}:</span>
            <input
              className="opm-input"
              placeholder="Kaizen / bottleneck…"
              value={activeStep.problem ?? ""}
              onChange={(e) => updateStep(selectedStep, { problem: e.target.value || undefined })}
            />
          </label>
        </div>
        </StudioPanel>
      </div>
    )}
  </>);
}
