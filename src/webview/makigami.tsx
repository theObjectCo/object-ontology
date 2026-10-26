import { MakigamiDoneCriteria } from "./makigami/MakigamiDoneCriteria";
import { MakigamiGrid } from "./makigami/MakigamiGrid";
import { MakigamiHandovers } from "./makigami/MakigamiHandovers";
import { MakigamiHeader } from "./makigami/MakigamiHeader";
import { MakigamiLaneHeaders } from "./makigami/MakigamiLaneHeaders";
import type { MakigamiProps } from "./makigami/MakigamiProps";
import { MakigamiStepCards } from "./makigami/MakigamiStepCards";
import { MakigamiStepEditor } from "./makigami/MakigamiStepEditor";
import { LANE_W } from "./makigami/dimensions";
import { useMakigamiEditor } from "./makigami/useMakigamiEditor";

export type { MakigamiProps } from "./makigami/MakigamiProps";

/** Editable swimlane story with shared state and focused presentation components. */
export function Makigami(props: MakigamiProps) {
  const editor = useMakigamiEditor(props);
  const { selectedStep, addingLane, editingHeader, editingField, setEditingField, setSelectedStep, setAddingLane, setEditingHeader, issues, width, height } = editor;
  return (<div className="opm-story" onKeyDown={(e) => {
    if (e.key === "Escape" && (selectedStep !== null || addingLane || editingHeader || editingField !== null)) {
      e.stopPropagation();
      setEditingField(null);
      setSelectedStep(null);
      setAddingLane(false);
      setEditingHeader(false);
    }
  }}>
    <MakigamiHeader {...editor} />

    <MakigamiStepEditor {...editor} />

    {issues.length > 0 && (
      <ul className="opm-story-issues">
        {issues.map((d, i) => <li key={i} className={`severity-${d.severity}`}>{d.message}</li>)}
      </ul>
    )}
    <div className="opm-mk-scroll">
      <div className="opm-mk" style={{ width: LANE_W + width, height }}>
        <MakigamiLaneHeaders {...editor} />
        <div className="opm-mk-roll" style={{ width, height }}>
          <MakigamiGrid {...editor} />
          <MakigamiStepCards {...editor} />
          <MakigamiHandovers {...editor} />
        </div>
      </div>
    </div>
    <MakigamiDoneCriteria {...editor} />
  </div>);
}
