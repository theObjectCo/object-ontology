import { Model, StoryDef, affiliation, label, objects, processes } from "../core/model";
import { handOverTarget, laneKind, storyTitle } from "../core/stories";
import { Messages } from "../shared/i18n";
import { ElementDiagnostic } from "../shared/protocol";

/** Lane headers on the left; then one column per step, in time order. */
const LANE_W = 190;
const COL_W = 240;
const CARD_W = 180;
const CARD_H = 88;
/** The row of step numbers above the lanes. */
const HEAD_H = 28;
const PAD = 14;
/** Two lines of the wait text. */
const WAIT_H = 32;
const PROBLEM_H = 58;
const GAP = 10;
const MIN_LANE_H = 96;

const cardX = (column: number) => column * COL_W + (COL_W - CARD_W) / 2;

export interface MakigamiProps {
  t: Messages;
  model: Model;
  id: string;
  story: StoryDef;
  /** Diagnostics of this story only. */
  diagnostics: ElementDiagnostic[];
  onBack: () => void;
  /** Selects an object or a process in the diagram. */
  onShow: (id: string) => void;
}

/**
 * A user story as a makigami, read-only: a horizontal band per lane, the steps as cards from left to right,
 * an arrow for each hand-over to the next card of the receiving lane, and problems as red cards.
 */
export function Makigami({ t, model, id, story, diagnostics, onBack, onShow }: MakigamiProps) {
  const lanesListed = Array.isArray(story.lanes) ? story.lanes.filter((l) => typeof l === "string") : [];
  const lanes = lanesListed.filter((l, i) => lanesListed.indexOf(l) === i);
  const steps = Array.isArray(story.steps) ? story.steps.filter((s) => s && typeof s === "object") : [];
  const known = (x: string | undefined) => !!x && (!!objects(model)[x] || !!processes(model)[x]);
  const L = (x: string) => label(model, x);
  const severityOf = (items: ElementDiagnostic[]) =>
    items.some((d) => d.severity === "error") ? "error" : items.length ? "warning" : undefined;

  // lane bands: tall enough for a card, a wait line and a red card where any step of the lane has them
  const tops = new Map<string, number>();
  const heights = new Map<string, number>();
  let y = HEAD_H;
  for (const lane of lanes) {
    const own = steps.filter((s) => s.lane === lane);
    const h = Math.max(MIN_LANE_H, PAD + CARD_H + (own.some((s) => s.waits) ? WAIT_H : 0) + (own.some((s) => s.problem) ? GAP + PROBLEM_H : 0) + PAD);
    tops.set(lane, y);
    heights.set(lane, h);
    y += h;
  }
  const height = y;
  const cardY = (lane: string) => tops.get(lane)! + PAD;
  const midY = (lane: string) => cardY(lane) + CARD_H / 2;
  const targets = steps.map((_, k) => handOverTarget({ ...story, steps }, k));
  const columns = Math.max(steps.length, ...targets.map((x) => (x ? x.column + 1 : 0)));
  const width = columns * COL_W;

  const arrows = steps.flatMap((s, k) => {
    const h = s.handsOver;
    const target = targets[k];
    if (!h || !target || !tops.has(s.lane) || !tops.has(h.to)) return [];
    const sx = cardX(k) + CARD_W, sy = midY(s.lane);
    // without a later step in the receiving lane the arrow ends in the band of the next column
    const ex = cardX(target.column) + (target.step === undefined ? 14 : 0), ey = midY(h.to);
    const mx = (k + 1) * COL_W;
    const d = sy === ey ? `M${sx},${sy} H${ex}` : `M${sx},${sy} H${mx} V${ey} H${ex}`;
    return [{ k, d, open: target.step === undefined, x: mx, y: sy === ey ? sy : (sy + ey) / 2, object: h.object, state: h.state }];
  });

  const issues = diagnostics.filter((d) => d.severity !== "info");
  const laneIssues = (lane: string) => issues.filter((d) => d.lane !== undefined && lanesListed[d.lane] === lane);
  const stepIssues = (k: number) => issues.filter((d) => d.step === k);
  const thing = (x: string, className: string) => known(x)
    ? <button className={`link ${className}`} title={t.showInDiagram} onClick={() => onShow(x)}>{L(x)}</button>
    : <span className={className}>{L(x)}</span>;

  return (
    <div className="opm-story">
      <div className="opm-story-head">
        <button className="opm-button" onClick={onBack} title={t.backHint}>‹ {t.diagram}</button>
        <span className="opm-dim">{t.userStory}</span>
        <b className="opm-story-title">{storyTitle(id, story)}</b>
        <span className="opm-id">{id}</span>
      </div>
      <div className="opm-story-sentence">{story.story}</div>
      {issues.length > 0 && (
        <ul className="opm-story-issues">
          {issues.map((d, i) => <li key={i} className={`severity-${d.severity}`}>{d.message}</li>)}
        </ul>
      )}
      <div className="opm-mk-scroll">
        <div className="opm-mk" style={{ width: LANE_W + width, height }}>
          <div className="opm-mk-lanes" style={{ width: LANE_W, height }}>
            <div className="opm-mk-corner" style={{ height: HEAD_H }}>{t.lanes}</div>
            {lanes.map((lane, i) => {
              const kind = laneKind(model, lane);
              const o = objects(model)[lane];
              const severity = severityOf(laneIssues(lane));
              const cls = ["opm-mk-thing", kind, o && affiliation(o) === "environmental" && "environmental", severity && `severity-${severity}`].filter(Boolean).join(" ");
              return (
                <div key={lane} className={`opm-mk-lane-head${i % 2 ? " odd" : ""}`} style={{ height: heights.get(lane) }}>
                  <div className={cls} title={laneIssues(lane).map((d) => d.message).join("\n") || undefined}>{thing(lane, "opm-mk-thing-label")}</div>
                  <div className="opm-mk-kind">{kind === "module" ? t.module : kind === "agent" ? t.agent : ""}</div>
                </div>
              );
            })}
          </div>
          <div className="opm-mk-roll" style={{ width, height }}>
            {lanes.map((lane, i) => (
              <div key={lane} className={`opm-mk-band${i % 2 ? " odd" : ""}`} style={{ top: tops.get(lane), height: heights.get(lane) }} />
            ))}
            {steps.map((_, k) => <div key={k} className="opm-mk-column" style={{ left: k * COL_W, width: COL_W, height: HEAD_H }}>{k + 1}</div>)}
            <svg className="opm-mk-arrows" width={width} height={height}>
              <defs>
                <marker id="opm-mk-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" className="opm-marker" />
                </marker>
              </defs>
              {arrows.map((a) => <path key={a.k} d={a.d} className={`opm-mk-arrow${a.open ? " open" : ""}`} markerEnd="url(#opm-mk-head)" />)}
            </svg>
            {steps.map((s, k) => {
              if (!tops.has(s.lane)) return null;
              const x = cardX(k), top = cardY(s.lane);
              const severity = severityOf(stepIssues(k));
              const problemTop = top + CARD_H + (s.waits ? WAIT_H : 0) + GAP;
              return (
                <div key={k}>
                  <div className={`opm-mk-card${severity ? ` severity-${severity}` : ""}`} style={{ left: x, top, width: CARD_W, height: CARD_H }}
                       title={[s.does, ...stepIssues(k).map((d) => d.message)].join("\n\n")}>
                    <div className="opm-mk-does">{s.does}</div>
                    {s.process && thing(s.process, "opm-mk-process")}
                  </div>
                  {s.waits && (
                    // beside the pin of a red card, when there is one
                    <div className="opm-mk-waits" style={{ left: x + (s.problem ? 30 : 0), top: top + CARD_H + 3, width: CARD_W - (s.problem ? 30 : 0) }}
                         title={s.waits}>{t.waits}: {s.waits}</div>
                  )}
                  {s.problem && (
                    <>
                      <div className="opm-mk-pin" style={{ left: x + 22, top: top + CARD_H, height: problemTop - top - CARD_H }} />
                      <div className="opm-mk-problem" style={{ left: x + 10, top: problemTop, width: CARD_W - 10, height: PROBLEM_H }} title={s.problem}>{s.problem}</div>
                    </>
                  )}
                </div>
              );
            })}
            {arrows.map((a) => (
              <div key={a.k} className="opm-mk-handover" style={{ left: a.x, top: a.y }}>
                {thing(a.object, "opm-mk-object")}{a.state && <i> {a.state}</i>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!!story.doneWhen?.length && (
        <div className="opm-story-done">
          <b>{t.doneWhen}</b>
          <ul>{story.doneWhen.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
