import { useEffect, useState } from "react";
import { Operation, idFromLabel, uniqueId } from "../core/edit";
import { Model, StoryDef, StoryStep, affiliation, essence, humanize, label, objects, processes } from "../core/model";
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
  /** Runs an edit operation on the model. */
  onRun?: (op: Operation) => Promise<unknown>;
  /** Deletes this story and returns to the diagram. */
  onDeleteStory?: () => void;
}

/**
 * A user story drawn and edited as a makigami: a horizontal band per lane, the steps as cards from left to right,
 * an arrow for each hand-over to the next card of the receiving lane, problems as red cards, and inline controls
 * to author lanes, steps, hand-overs and generate the underlying OPM model.
 */
export function Makigami({ t, model, id, story, diagnostics, onBack, onShow, onRun, onDeleteStory }: MakigamiProps) {
  const lanesListed = Array.isArray(story.lanes) ? story.lanes.filter((l) => typeof l === "string") : [];
  const lanes = lanesListed.filter((l, i) => lanesListed.indexOf(l) === i);
  const steps = Array.isArray(story.steps) ? story.steps.filter((s) => s && typeof s === "object") : [];
  const known = (x: string | undefined) => !!x && (!!objects(model)[x] || !!processes(model)[x]);
  const L = (x: string) => label(model, x);
  const severityOf = (items: ElementDiagnostic[]) =>
    items.some((d) => d.severity === "error") ? "error" : items.length ? "warning" : undefined;

  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [titleDraft, setTitleDraft] = useState(story.title ?? humanize(id));
  const [sentenceDraft, setSentenceDraft] = useState(story.story);
  const [addingLane, setAddingLane] = useState(false);
  const [newLaneName, setNewLaneName] = useState("");
  const [newLaneKind, setNewLaneKind] = useState<"module" | "agent">("module");
  const [newCriterion, setNewCriterion] = useState("");
  const [addingCriterion, setAddingCriterion] = useState(false);

  useEffect(() => {
    setTitleDraft(story.title ?? humanize(id));
    setSentenceDraft(story.story);
  }, [id, story.title, story.story]);

  useEffect(() => {
    if (selectedStep !== null && selectedStep >= steps.length) {
      setSelectedStep(steps.length ? steps.length - 1 : null);
    }
  }, [steps.length, selectedStep]);

  const saveStory = (next: StoryDef) => {
    if (!onRun) return;
    void onRun({ op: "setStory", id, story: next });
  };

  const updateStep = (index: number, patch: Partial<StoryStep>) => {
    const nextSteps = steps.map((s, i) => {
      if (i !== index) return s;
      const updated: StoryStep = { ...s, ...patch };
      if (!updated.process) delete updated.process;
      if (!updated.handsOver) delete updated.handsOver;
      if (!updated.waits) delete updated.waits;
      if (!updated.problem) delete updated.problem;
      if (!updated.note) delete updated.note;
      return updated;
    });
    saveStory({ ...story, steps: nextSteps });
  };

  const insertStep = (afterIndex: number, laneId?: string) => {
    const prev = steps[afterIndex];
    const defaultLane = laneId ?? prev?.handsOver?.to ?? prev?.lane ?? lanes[0] ?? "user";
    const newStep: StoryStep = {
      lane: defaultLane,
      does: "Performs the next step.",
    };
    const nextSteps = [...steps.slice(0, afterIndex + 1), newStep, ...steps.slice(afterIndex + 1)];
    saveStory({ ...story, steps: nextSteps });
    setSelectedStep(afterIndex + 1);
  };

  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const nextSteps = [...steps];
    const [item] = nextSteps.splice(index, 1);
    nextSteps.splice(target, 0, item);
    saveStory({ ...story, steps: nextSteps });
    setSelectedStep(target);
  };

  const deleteStep = (index: number) => {
    if (steps.length <= 1) return;
    const nextSteps = steps.filter((_, i) => i !== index);
    saveStory({ ...story, steps: nextSteps });
    setSelectedStep(null);
  };

  const moveLane = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= lanes.length) return;
    const nextLanes = [...lanes];
    const [item] = nextLanes.splice(index, 1);
    nextLanes.splice(target, 0, item);
    saveStory({ ...story, lanes: nextLanes });
  };

  const removeLane = (lane: string) => {
    if (lanes.length <= 1) return;
    const fallback = lanes.find((l) => l !== lane)!;
    const nextLanes = lanes.filter((l) => l !== lane);
    const nextSteps = steps.map((s) => ({
      ...s,
      lane: s.lane === lane ? fallback : s.lane,
      ...(s.handsOver?.to === lane ? { handsOver: { ...s.handsOver, to: fallback } } : {}),
    }));
    saveStory({ ...story, lanes: nextLanes, steps: nextSteps });
  };

  const handleAddLane = async (existingId?: string) => {
    if (!onRun) return;
    if (existingId) {
      if (!lanes.includes(existingId)) {
        await onRun({ op: "setStory", id, story: { ...story, lanes: [...lanes, existingId] } });
      }
      setAddingLane(false);
      return;
    }
    const labelText = newLaneName.trim();
    if (!labelText) return;
    const candidate = idFromLabel(labelText) || "participant";
    const laneId = objects(model)[candidate] ? candidate : uniqueId(model, candidate);
    if (!objects(model)[laneId]) {
      const r = await onRun({ op: "addElement", kind: "object", viewId: "system", label: labelText }) as { ok?: boolean; select?: string[] };
      const createdId = r?.select?.[0] ?? laneId;
      await onRun({
        op: "updateElement",
        id: createdId,
        patch: newLaneKind === "module" ? { role: "module" } : { essence: "physical" },
      });
      await onRun({ op: "setStory", id, story: { ...story, lanes: [...lanes, createdId] } });
    } else {
      await onRun({ op: "setStory", id, story: { ...story, lanes: [...lanes, laneId] } });
    }
    setNewLaneName("");
    setAddingLane(false);
  };

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
    ? <button className={`link ${className}`} title={t.showInDiagram} onClick={(e) => { e.stopPropagation(); onShow(x); }}>{L(x)}</button>
    : <span className={className}>{L(x)}</span>;

  const availablePerformers = Object.entries(objects(model))
    .filter(([oid, o]) => !lanes.includes(oid) && (o.role === "module" || essence(o) === "physical"))
    .map(([oid]) => oid);

  const dataObjects = Object.entries(objects(model))
    .filter(([, o]) => o.role !== "module" && essence(o) !== "physical")
    .map(([oid]) => oid);

  const activeStep = selectedStep !== null ? steps[selectedStep] : undefined;

  return (
    <div className="opm-story" onKeyDown={(e) => {
      if (e.key === "Escape" && (selectedStep !== null || addingLane || editingHeader)) {
        e.stopPropagation();
        setSelectedStep(null);
        setAddingLane(false);
        setEditingHeader(false);
      }
    }}>
      <div className="opm-story-head">
        <button className="opm-button" onClick={onBack} title={t.backHint}>‹ {t.diagram}</button>
        <span className="opm-dim">{t.userStory}</span>
        {editingHeader ? (
          <input
            className="opm-input"
            style={{ width: 220 }}
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setEditingHeader(false);
              const clean = titleDraft.trim();
              saveStory({ ...story, title: !clean || clean === humanize(id) ? undefined : clean });
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setTitleDraft(story.title ?? humanize(id)); setEditingHeader(false); }
            }}
          />
        ) : (
          <b className="opm-story-title" onDoubleClick={() => onRun && setEditingHeader(true)} title={onRun ? t.editNote : undefined}>
            {storyTitle(id, story)}
          </b>
        )}
        <span className="opm-id">{id}</span>
        {onRun && (
          <div className="opm-story-actions">
            <button className="opm-button" onClick={() => setAddingLane(!addingLane)}>{t.addLane}</button>
            <button className="opm-button" onClick={() => insertStep(steps.length - 1)}>{t.addStep}</button>
            <button className="opm-button primary opm-mk-sync" title={t.syncStoryHint}
                    onClick={() => void onRun({ op: "syncStory", id })}>{t.syncStory}</button>
            {onDeleteStory && (
              <button className="opm-button" title={t.deleteStory} onClick={onDeleteStory}>×</button>
            )}
          </div>
        )}
      </div>

      {onRun ? (
        <div className="opm-story-sentence">
          <input
            className="opm-input opm-story-sentence-input"
            value={sentenceDraft}
            onChange={(e) => setSentenceDraft(e.target.value)}
            onBlur={() => {
              if (sentenceDraft.trim() && sentenceDraft !== story.story) {
                saveStory({ ...story, story: sentenceDraft.trim() });
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>
      ) : (
        <div className="opm-story-sentence">{story.story}</div>
      )}

      {addingLane && onRun && (
        <div className="opm-mk-bar">
          <b>{t.addLane}:</b>
          {availablePerformers.map((oid) => (
            <button key={oid} className="opm-pill suggestion" onClick={() => void handleAddLane(oid)}>
              + {L(oid)} ({laneKind(model, oid) === "module" ? t.module : t.agent})
            </button>
          ))}
          <input
            className="opm-input"
            style={{ width: 180 }}
            placeholder={t.label}
            value={newLaneName}
            onChange={(e) => setNewLaneName(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") void handleAddLane(); }}
          />
          <select className="opm-input" style={{ width: 120 }} value={newLaneKind} onChange={(e) => setNewLaneKind(e.target.value as "module" | "agent")}>
            <option value="module">{t.module}</option>
            <option value="agent">{t.agent}</option>
          </select>
          <button className="opm-button primary" onClick={() => void handleAddLane()}>+</button>
          <button className="opm-button" onClick={() => setAddingLane(false)}>{t.cancel}</button>
        </div>
      )}

      {activeStep && selectedStep !== null && onRun && (
        <div className="opm-mk-editor" onKeyDown={(e) => e.stopPropagation()}>
          <div className="opm-mk-editor-row">
            <b>{t.stepEditor} #{selectedStep + 1}</b>
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
            <div className="opm-mk-step-btns">
              <button className="opm-button" disabled={selectedStep === 0} onClick={() => moveStep(selectedStep, -1)} title="Move left">←</button>
              <button className="opm-button" disabled={selectedStep >= steps.length - 1} onClick={() => moveStep(selectedStep, 1)} title="Move right">→</button>
              <button className="opm-button" onClick={() => insertStep(selectedStep)} title="Insert step after">+ {t.stepEditor}</button>
              <button className="opm-button" disabled={steps.length <= 1} onClick={() => deleteStep(selectedStep)} title={t.delete}>🗑</button>
              <button className="opm-button" onClick={() => setSelectedStep(null)}>{t.close}</button>
            </div>
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
        </div>
      )}

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
          </div>
          <div className="opm-mk-roll" style={{ width, height }}>
            {lanes.map((lane, i) => (
              <div
                key={lane}
                className={`opm-mk-band${i % 2 ? " odd" : ""}`}
                style={{ top: tops.get(lane), height: heights.get(lane) }}
                onDoubleClick={(e) => {
                  if (!onRun) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const col = Math.floor((e.clientX - rect.left) / COL_W);
                  if (col >= 0 && col < steps.length) {
                    updateStep(col, { lane });
                    setSelectedStep(col);
                  } else {
                    insertStep(steps.length - 1, lane);
                  }
                }}
              />
            ))}
            {steps.map((_, k) => (
              <div
                key={k}
                className={`opm-mk-column${selectedStep === k ? " selected" : ""}`}
                style={{ left: k * COL_W, width: COL_W, height: HEAD_H }}
                onClick={() => onRun && setSelectedStep(selectedStep === k ? null : k)}
              >
                {k + 1}
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
            {steps.map((s, k) => {
              if (!tops.has(s.lane)) return null;
              const x = cardX(k), top = cardY(s.lane);
              const severity = severityOf(stepIssues(k));
              const problemTop = top + CARD_H + (s.waits ? WAIT_H : 0) + GAP;
              return (
                <div key={k}>
                  <div
                    className={`opm-mk-card${severity ? ` severity-${severity}` : ""}${selectedStep === k ? " selected" : ""}`}
                    style={{ left: x, top, width: CARD_W, height: CARD_H }}
                    title={[s.does, ...stepIssues(k).map((d) => d.message)].join("\n\n")}
                    onClick={() => onRun && setSelectedStep(selectedStep === k ? null : k)}
                  >
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
                      <div className="opm-mk-problem" style={{ left: x + 10, top: problemTop, width: CARD_W - 10, height: PROBLEM_H }}
                           title={s.problem} onClick={() => onRun && setSelectedStep(k)}>{s.problem}</div>
                    </>
                  )}
                </div>
              );
            })}
            {arrows.map((a) => (
              <div key={a.k} className="opm-mk-handover" style={{ left: a.x, top: a.y }}
                   onClick={() => onRun && setSelectedStep(a.k)}>
                {thing(a.object, "opm-mk-object")}{a.state && <i> {a.state}</i>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {(!!story.doneWhen?.length || onRun) && (
        <div className="opm-story-done">
          <b>{t.doneWhen}</b>
          {!!story.doneWhen?.length && (
            <ul>
              {story.doneWhen.map((d, i) => (
                <li key={i}>
                  <span>{d}</span>
                  {onRun && (
                    <button
                      className="link opm-x"
                      style={{ marginLeft: 8 }}
                      onClick={() => {
                        const next = (story.doneWhen ?? []).filter((_, idx) => idx !== i);
                        saveStory({ ...story, doneWhen: next.length ? next : undefined });
                      }}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {onRun && (
            addingCriterion ? (
              <div className="opm-inline-row" style={{ marginTop: 6, maxWidth: 520 }}>
                <input
                  className="opm-input"
                  autoFocus
                  value={newCriterion}
                  placeholder={t.doneWhen}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  onBlur={() => {
                    const c = newCriterion.trim();
                    setAddingCriterion(false);
                    setNewCriterion("");
                    if (c) saveStory({ ...story, doneWhen: [...(story.doneWhen ?? []), c] });
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") { setAddingCriterion(false); setNewCriterion(""); }
                  }}
                />
              </div>
            ) : (
              <button className="opm-pill add" style={{ marginTop: 4 }} onClick={() => setAddingCriterion(true)}>
                {t.addCriterion}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
