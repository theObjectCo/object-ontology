import { ReactElement } from "react";
import { Flow } from "../../core/methods/flow";
import { Model, label } from "../../core/model";
import { MethodMessages } from "./messages";
import { Arrowhead, CHAR, Clipped } from "./svg";

const LANE = 84;
const HEAD = 130;
const W = 146;
const H = 40;

/** Lanes as horizontal bands, activities in columns by their order, the objects passed written on the arrows. */
export function FlowView({ model, f, t }: { model: Model; f: Flow; t: MethodMessages }) {
  const n = f.activities.length;
  // the gap between two activities fits the longest list of objects passed from one to the next
  const longest = Math.max(0, ...f.edges.filter((e) => e.next).map((e) => e.objects.map((o) => label(model, o)).join(", ").length));
  const STEP = W + Math.max(56, Math.min(30, longest) * CHAR + 24);
  const cx = (k: number) => HEAD + 70 + k * STEP + W / 2;
  const cy = (k: number) => f.activities[k].lane * LANE + LANE / 2;
  const width = HEAD + 70 + n * STEP + 40;
  const later = f.edges.filter((e) => !e.next);
  const height = f.lanes.length * LANE + (later.length ? 30 + 18 * later.length : 10);
  const parts: ReactElement[] = [];
  f.lanes.forEach((lane, i) => {
    parts.push(
      <g key={`lane${i}`} className={`opm-m-lane ${lane.kind}`}>
        <rect x={0} y={i * LANE} width={width} height={LANE} />
        <line x1={HEAD} y1={i * LANE} x2={HEAD} y2={(i + 1) * LANE} />
        <Clipped x={10} y={i * LANE + LANE / 2 + 4} anchor="start" max={Math.floor((HEAD - 16) / CHAR)} text={lane.id ? label(model, lane.id) : t.noModule} className="opm-m-title" />
      </g>,
    );
  });
  if (n) {
    const y0 = cy(0);
    const y1 = cy(n - 1);
    parts.push(
      <g key="ends" className="opm-m-flowline">
        <circle className="opm-m-start" cx={HEAD + 26} cy={y0} r={8} />
        <line x1={HEAD + 34} y1={y0} x2={cx(0) - W / 2} y2={y0} /><Arrowhead x={cx(0) - W / 2} y={y0} dir="right" />
        <line x1={cx(n - 1) + W / 2} y1={y1} x2={cx(n - 1) + W / 2 + 34} y2={y1} /><Arrowhead x={cx(n - 1) + W / 2 + 34} y={y1} dir="right" />
        <circle className="opm-m-end" cx={cx(n - 1) + W / 2 + 44} cy={y1} r={9} />
        <circle className="opm-m-start" cx={cx(n - 1) + W / 2 + 44} cy={y1} r={5} />
      </g>,
    );
  }
  for (const e of f.edges.filter((x) => x.next)) {
    const x1 = cx(e.from) + W / 2, y1 = cy(e.from), x2 = cx(e.to) - W / 2, y2 = cy(e.to);
    const mid = (x1 + x2) / 2;
    const text = e.objects.map((o) => label(model, o)).join(", ");
    parts.push(
      <g key={`n${e.from}`} className="opm-m-flowline">
        <path d={y1 === y2 ? `M${x1},${y1} H${x2}` : `M${x1},${y1} H${mid} V${y2} H${x2}`} />
        <Arrowhead x={x2} y={y2} dir="right" />
        {text && <Clipped x={mid} y={y1 - 6} anchor="middle" text={text} />}
      </g>,
    );
  }
  // a hand-over to a later activity runs below the lanes
  later.forEach((e, k) => {
    const base = f.lanes.length * LANE + 16 + 18 * k;
    const x1 = cx(e.from), x2 = cx(e.to);
    const text = e.objects.map((o) => label(model, o)).join(", ");
    parts.push(
      <g key={`l${e.from}-${e.to}`} className="opm-m-flowline later">
        <path d={`M${x1},${cy(e.from) + H / 2} V${base} H${x2} V${cy(e.to) + H / 2}`} />
        <Arrowhead x={x2} y={cy(e.to) + H / 2} dir="up" />
        <Clipped x={(x1 + x2) / 2} y={base - 4} anchor="middle" text={text} />
      </g>,
    );
  });
  f.activities.forEach((a, k) => {
    parts.push(
      <g key={`a${k}`} className="opm-m-activity">
        <rect x={cx(k) - W / 2} y={cy(k) - H / 2} width={W} height={H} rx={H / 2} />
        <Clipped x={cx(k)} y={cy(k) + 4} anchor="middle" max={Math.floor((W - 16) / CHAR)} text={`${k + 1} · ${label(model, a.process)}`} />
      </g>,
    );
  });
  return <svg className="opm-m-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>{parts}</svg>;
}
