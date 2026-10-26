import { idFromLabel } from "../../core/edit";
import { CARD_H, CARD_W, cardX, GAP, PROBLEM_H, WAIT_H } from "./dimensions";
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor,
  "steps" | "tops" | "cardY" | "selectedStep"
  | "severityOf" | "stepIssues" | "editingField" | "dragStep"
  | "onRun" | "setDragStep" | "setDropTarget" | "setSelectedStep"
  | "setEditingField" | "doesInputRef" | "updateStep" | "thing"
  | "t" | "lanes" | "dataObjects"
>;

export function MakigamiStepCards({
  steps, tops, cardY, selectedStep, severityOf,
  stepIssues, editingField, dragStep, onRun, setDragStep,
  setDropTarget, setSelectedStep, setEditingField, doesInputRef, updateStep,
  thing, t, lanes, dataObjects,
}: Props) {
  return (<>
    {steps.map((s, k) => {
      if (!tops.has(s.lane)) return null;
      const x = cardX(k), top = cardY(s.lane);
      const isSelected = selectedStep === k;
      const severity = severityOf(stepIssues(k));
      const showWaitRow = !!s.waits || (isSelected && editingField === "waits");
      const showProblemRow = !!s.problem || (isSelected && editingField === "problem");
      const problemTop = top + CARD_H + (showWaitRow ? WAIT_H : 0) + GAP;
      return (
        <div key={k}>
          <div
            className={`opm-mk-card${severity ? ` severity-${severity}` : ""}${isSelected ? " selected" : ""}${dragStep === k ? " dragging" : ""}`}
            style={{ left: x, top, width: CARD_W, height: CARD_H }}
            title={[s.does, ...stepIssues(k).map((d) => d.message)].join("\n\n")}
            draggable={!!onRun && !(isSelected && editingField !== null)}
            onDragStart={(e) => {
              if (!onRun) return;
              setDragStep(k);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(k));
            }}
            onDragEnd={() => {
              setDragStep(null);
              setDropTarget(null);
            }}
            onClick={(e) => {
              if (!onRun) return;
              e.stopPropagation();
              setSelectedStep(k);
              if (editingField === null) setEditingField("does");
            }}
          >
            {isSelected && onRun && editingField === "does" ? (
              <textarea
                ref={doesInputRef}
                className="opm-mk-inline-does"
                value={s.does}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateStep(k, { does: e.target.value || "Step" })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    setEditingField(null);
                  }
                }}
              />
            ) : (
              <div
                className="opm-mk-does"
                onDoubleClick={(e) => {
                  if (!onRun) return;
                  e.stopPropagation();
                  setSelectedStep(k);
                  setEditingField("does");
                }}
              >
                {s.does}
              </div>
            )}

            <div className="opm-mk-card-foot" onClick={(e) => e.stopPropagation()}>
              {s.process ? (
                thing(s.process, "opm-mk-process")
              ) : onRun && isSelected ? (
                <button
                  type="button"
                  className="link opm-mk-mini-btn"
                  title={t.process}
                  onClick={() => updateStep(k, { process: idFromLabel(s.does) || "stepProcess" })}
                >
                  + {t.process}
                </button>
              ) : <span />}

              {onRun && (
                <span className="opm-mk-card-quick">
                  <button
                    type="button"
                    className={`link opm-mk-mini-btn${s.waits ? " active" : ""}`}
                    title={t.waits}
                    onClick={() => {
                      setSelectedStep(k);
                      if (!s.waits) updateStep(k, { waits: "5m" });
                      setEditingField("waits");
                    }}
                  >
                    ⏱
                  </button>
                  <button
                    type="button"
                    className={`link opm-mk-mini-btn${s.problem ? " active" : ""}`}
                    title={t.problemRedCard}
                    onClick={() => {
                      setSelectedStep(k);
                      if (!s.problem) updateStep(k, { problem: "Bottleneck / issue…" });
                      setEditingField("problem");
                    }}
                  >
                    🟥
                  </button>
                  <button
                    type="button"
                    className={`link opm-mk-mini-btn${s.handsOver ? " active" : ""}`}
                    title={t.handsOverTo}
                    onClick={() => {
                      setSelectedStep(k);
                      if (!s.handsOver) {
                        const nextLane = lanes.find((l) => l !== s.lane) ?? s.lane;
                        const obj = dataObjects[0] ?? "document";
                        updateStep(k, { handsOver: { object: obj, state: "ready", to: nextLane } });
                      }
                      setEditingField("handover");
                    }}
                  >
                    ↪
                  </button>
                </span>
              )}
            </div>
          </div>

          {showWaitRow && (
            <div
              className="opm-mk-waits"
              style={{ left: x + (showProblemRow ? 26 : 0), top: top + CARD_H + 3, width: CARD_W - (showProblemRow ? 26 : 0) }}
              title={s.waits}
              onClick={(e) => {
                if (!onRun) return;
                e.stopPropagation();
                setSelectedStep(k);
                setEditingField("waits");
              }}
            >
              {isSelected && onRun && editingField === "waits" ? (
                <input
                  className="opm-input opm-mk-inline-input"
                  autoFocus
                  placeholder="e.g. 15 min / 2h"
                  value={s.waits ?? ""}
                  onChange={(e) => updateStep(k, { waits: e.target.value || undefined })}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" || e.key === "Escape") setEditingField(null);
                  }}
                />
              ) : (
                <span>⏱ {t.waits}: {s.waits}</span>
              )}
            </div>
          )}

          {showProblemRow && (
            <>
              <div className="opm-mk-pin" style={{ left: x + 18, top: top + CARD_H, height: problemTop - top - CARD_H }} />
              <div
                className="opm-mk-problem"
                style={{ left: x + 6, top: problemTop, width: CARD_W - 6, height: PROBLEM_H }}
                title={s.problem}
                onClick={(e) => {
                  if (!onRun) return;
                  e.stopPropagation();
                  setSelectedStep(k);
                  setEditingField("problem");
                }}
              >
                {isSelected && onRun && editingField === "problem" ? (
                  <textarea
                    className="opm-mk-inline-problem"
                    autoFocus
                    value={s.problem ?? ""}
                    placeholder="Kaizen / bottleneck…"
                    onChange={(e) => updateStep(k, { problem: e.target.value || undefined })}
                    onBlur={() => setEditingField(null)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                        e.preventDefault();
                        setEditingField(null);
                      }
                    }}
                  />
                ) : (
                  s.problem
                )}
              </div>
            </>
          )}
        </div>
      );
    })}
  </>);
}
