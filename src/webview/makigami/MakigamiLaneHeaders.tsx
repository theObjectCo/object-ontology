import { affiliation, objects } from "../../core/model";
import { laneKind } from "../../core/stories";
import { HEAD_H, LANE_W } from "./dimensions";
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor, "height" | "t" | "lanes" | "model" | "severityOf" | "laneIssues" | "heights" | "onRun" | "setEditingLane" | "setLaneLabelDraft" | "L" | "editingLane" | "laneLabelDraft" | "commitLaneRename" | "thing" | "moveLane" | "insertStep" | "steps" | "removeLane" | "ADD_LANE_H" | "setAddingLane">;

export function MakigamiLaneHeaders({ height, t, lanes, model, severityOf, laneIssues, heights, onRun, setEditingLane, setLaneLabelDraft, L, editingLane, laneLabelDraft, commitLaneRename, thing, moveLane, insertStep, steps, removeLane, ADD_LANE_H, setAddingLane }: Props) {
  return (<>
    <div className="opm-mk-lanes" style={{ width: LANE_W, height }}>
      <div className="opm-mk-corner" style={{ height: HEAD_H }}>{t.lanes}</div>
      {lanes.map((lane, i) => {
        const kind = laneKind(model, lane);
        const o = objects(model)[lane];
        const severity = severityOf(laneIssues(lane));
        const cls = ["opm-mk-thing", kind, o && affiliation(o) === "environmental" && "environmental", severity && `severity-${severity}`].filter(Boolean).join(" ");
        return (
          <div key={lane} className={`opm-mk-lane-head${i % 2 ? " odd" : ""}`} style={{ height: heights.get(lane) }}>
            <div
              className={cls}
              title={laneIssues(lane).map((d) => d.message).join("\n") || (onRun ? "Double-click to rename lane" : undefined)}
              onDoubleClick={(e) => {
                if (!onRun) return;
                e.stopPropagation();
                setEditingLane(lane);
                setLaneLabelDraft(L(lane));
              }}
            >
              {editingLane === lane ? (
                <input
                  className="opm-input"
                  autoFocus
                  value={laneLabelDraft}
                  onChange={(e) => setLaneLabelDraft(e.target.value)}
                  onBlur={() => void commitLaneRename(lane)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") void commitLaneRename(lane);
                    if (e.key === "Escape") setEditingLane(null);
                  }}
                />
              ) : (
                thing(lane, "opm-mk-thing-label")
              )}
            </div>
            <div className="opm-mk-kind">
              <span>{kind === "module" ? t.module : kind === "agent" ? t.agent : ""}</span>
              {onRun && (
                <span className="opm-mk-lane-tools">
                  {i > 0 && <button className="link" onClick={() => moveLane(i, -1)} title="Move lane up">↑</button>}
                  {i < lanes.length - 1 && <button className="link" onClick={() => moveLane(i, 1)} title="Move lane down">↓</button>}
                  <button className="link" onClick={() => insertStep(steps.length - 1, lane)} title={t.addStep}>+</button>
                  {lanes.length > 1 && <button className="link" onClick={() => removeLane(lane)} title={t.delete}>×</button>}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {onRun && (
        <div className="opm-mk-add-lane-row" style={{ height: ADD_LANE_H }}>
          <button className="opm-pill add" onClick={() => setAddingLane(true)}>
            {t.addLane}
          </button>
        </div>
      )}
    </div>
  </>);
}
