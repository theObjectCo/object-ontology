import { CARD_H, CARD_W, cardX, COL_W, HEAD_H, PAD } from "./dimensions";
import type { MakigamiEditor } from "./useMakigamiEditor";

type Props = Pick<MakigamiEditor, "lanes" | "dropTarget" | "tops" | "heights" | "onRun" | "dragStep" | "steps" | "setDropTarget" | "moveStepToCell" | "setDragStep" | "updateStep" | "setSelectedStep" | "setEditingField" | "insertStep" | "t" | "L" | "cardY" | "selectedStep" | "width" | "height" | "arrows">;

export function MakigamiGrid({ lanes, dropTarget, tops, heights, onRun, dragStep, steps, setDropTarget, moveStepToCell, setDragStep, updateStep, setSelectedStep, setEditingField, insertStep, t, L, cardY, selectedStep, width, height, arrows }: Props) {
  return (<>
    {lanes.map((lane, i) => (
      <div
        key={lane}
        className={`opm-mk-band${i % 2 ? " odd" : ""}${dropTarget?.lane === lane ? " drop-lane" : ""}`}
        style={{ top: tops.get(lane), height: heights.get(lane) }}
        onDragOver={(e) => {
          if (!onRun || dragStep === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          const col = Math.max(0, Math.min(steps.length - 1, Math.floor((e.clientX - rect.left) / COL_W)));
          if (dropTarget?.lane !== lane || dropTarget?.col !== col) {
            setDropTarget({ lane, col });
          }
        }}
        onDragLeave={() => {
          if (dropTarget?.lane === lane) setDropTarget(null);
        }}
        onDrop={(e) => {
          if (!onRun || dragStep === null) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const col = Math.max(0, Math.min(steps.length - 1, Math.floor((e.clientX - rect.left) / COL_W)));
          moveStepToCell(dragStep, lane, col);
          setDragStep(null);
          setDropTarget(null);
        }}
        onDoubleClick={(e) => {
          if (!onRun) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const col = Math.floor((e.clientX - rect.left) / COL_W);
          if (col >= 0 && col < steps.length) {
            updateStep(col, { lane });
            setSelectedStep(col);
            setEditingField("does");
          } else {
            insertStep(steps.length - 1, lane);
          }
        }}
      >
        {/* Ghost "+ Step" card in the new column on the right edge of every swimlane */}
        {onRun && (
          <button
            type="button"
            className="opm-mk-ghost-card"
            style={{ left: cardX(steps.length), top: PAD, width: CARD_W, height: CARD_H - 18 }}
            title={`${t.addStep} (${L(lane)})`}
            onClick={(e) => {
              e.stopPropagation();
              insertStep(steps.length - 1, lane);
            }}
          >
            <span>+ {t.stepEditor}</span>
            <small>{L(lane)}</small>
          </button>
        )}
      </div>
    ))}
    {dropTarget && (
      <div
        className="opm-mk-drop-preview"
        style={{
          left: cardX(dropTarget.col),
          top: cardY(dropTarget.lane),
          width: CARD_W,
          height: CARD_H,
        }}
      />
    )}
    {steps.map((_, k) => (
      <div
        key={k}
        className={`opm-mk-column${selectedStep === k ? " selected" : ""}`}
        style={{ left: k * COL_W, width: COL_W, height: HEAD_H }}
        onClick={() => onRun && setSelectedStep(selectedStep === k ? null : k)}
      >
        <span>{k + 1}</span>
        {onRun && (
          <button
            type="button"
            className="opm-mk-col-insert"
            title="Insert step after this column"
            onClick={(e) => {
              e.stopPropagation();
              insertStep(k);
            }}
          >
            +
          </button>
        )}
      </div>
    ))}
    <svg className="opm-mk-arrows" width={width} height={height}>
      <defs>
        <marker id="opm-mk-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" className="opm-marker" />
        </marker>
      </defs>
      {arrows.map((a) => <path key={a.k} d={a.d} className={`opm-mk-arrow${a.open ? " open" : ""}`} markerEnd="url(#opm-mk-head)" />)}
    </svg>
  </>);
}
