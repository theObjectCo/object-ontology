import { useEffect, useRef, useState } from "react";
import { idFromLabel, uniqueId } from "../../core/edit";
import { StoryDef, StoryStep, essence, humanize, label, objects, processes } from "../../core/model";
import { ElementDiagnostic } from "../../shared/protocol";
import { getMakigamiLayout } from "./getMakigamiLayout";
import type { MakigamiProps } from "./MakigamiProps";

export function useMakigamiEditor({ t, model, id, story, diagnostics, onBack, onShow, onRun, onDeleteStory }: MakigamiProps) {

  const lanesListed = Array.isArray(story.lanes) ? story.lanes.filter((l) => typeof l === "string") : [];
  const lanes = lanesListed.filter((l, i) => lanesListed.indexOf(l) === i);
  const steps = Array.isArray(story.steps) ? story.steps.filter((s) => s && typeof s === "object") : [];
  const known = (x: string | undefined) => !!x && (!!objects(model)[x] || !!processes(model)[x]);
  const L = (x: string) => label(model, x);
  const severityOf = (items: ElementDiagnostic[]) =>
    items.some((d) => d.severity === "error") ? "error" : items.length ? "warning" : undefined;

  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [pendingInsertion, setPendingInsertion] = useState<{ storyId: string; index: number; count: number } | null>(null);
  const [editingField, setEditingField] = useState<"does" | "waits" | "problem" | "handover" | "process" | null>(null);
  const [dragStep, setDragStep] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ lane: string; col: number } | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLane, setEditingLane] = useState<string | null>(null);
  const [laneLabelDraft, setLaneLabelDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState(story.title ?? humanize(id));
  const [sentenceDraft, setSentenceDraft] = useState(story.story);
  const [addingLane, setAddingLane] = useState(false);
  const [newLaneName, setNewLaneName] = useState("");
  const [newLaneKind, setNewLaneKind] = useState<"module" | "agent">("module");
  const [newCriterion, setNewCriterion] = useState("");
  const [addingCriterion, setAddingCriterion] = useState(false);
  const doesInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setTitleDraft(story.title ?? humanize(id));
    setSentenceDraft(story.story);
  }, [id, story.title, story.story]);

  useEffect(() => {
    if (!pendingInsertion) return;
    if (pendingInsertion.storyId !== id) {
      setPendingInsertion(null);
    } else if (steps.length >= pendingInsertion.count) {
      setSelectedStep(pendingInsertion.index);
      setEditingField("does");
      setPendingInsertion(null);
    }
  }, [id, steps.length, pendingInsertion]);

  useEffect(() => {
    if (selectedStep !== null && selectedStep >= steps.length) {
      setSelectedStep(steps.length ? steps.length - 1 : null);
    }
  }, [steps.length, selectedStep]);

  useEffect(() => {
    if (selectedStep !== null && editingField === "does" && doesInputRef.current) {
      doesInputRef.current.focus();
    }
  }, [selectedStep, editingField]);

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

  const insertStep = async (afterIndex: number, laneId?: string) => {
    if (!onRun) return;
    const prev = steps[afterIndex];
    const defaultLane = laneId ?? prev?.handsOver?.to ?? prev?.lane ?? lanes[0] ?? "user";
    const newStep: StoryStep = {
      lane: defaultLane,
      does: "Performs the next step.",
    };
    const nextSteps = [...steps.slice(0, afterIndex + 1), newStep, ...steps.slice(afterIndex + 1)];
    // A host may acknowledge before publishing the updated model. Wait for both
    // before selecting, so the bounds effect cannot clamp to the old last step.
    const result = await onRun({ op: "setStory", id, story: { ...story, steps: nextSteps } }) as { ok?: boolean } | undefined;
    if (result?.ok === false) return;
    setPendingInsertion({ storyId: id, index: afterIndex + 1, count: nextSteps.length });
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

  const moveStepToCell = (fromIndex: number, targetLane: string, targetCol: number) => {
    if (fromIndex < 0 || fromIndex >= steps.length) return;
    const clampedCol = Math.max(0, Math.min(steps.length - 1, targetCol));
    const nextSteps = [...steps];
    const [item] = nextSteps.splice(fromIndex, 1);
    const updatedItem: StoryStep = { ...item, lane: targetLane };
    nextSteps.splice(clampedCol, 0, updatedItem);
    saveStory({ ...story, steps: nextSteps });
    setSelectedStep(clampedCol);
  };

  const deleteStep = (index: number) => {
    if (steps.length <= 1) return;
    const nextSteps = steps.filter((_, i) => i !== index);
    saveStory({ ...story, steps: nextSteps });
    setSelectedStep(null);
    setEditingField(null);
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

  const commitLaneRename = async (laneId: string) => {
    setEditingLane(null);
    const clean = laneLabelDraft.trim();
    if (!clean || !onRun) return;
    if (objects(model)[laneId]) {
      await onRun({ op: "setLabel", id: laneId, label: clean });
    } else {
      const r = await onRun({ op: "addElement", kind: "object", viewId: "system", label: clean }) as { ok?: boolean; select?: string[] };
      const createdId = r?.select?.[0];
      if (createdId && createdId !== laneId) {
        const nextLanes = lanes.map((l) => (l === laneId ? createdId : l));
        const nextSteps = steps.map((s) => ({
          ...s,
          lane: s.lane === laneId ? createdId : s.lane,
          ...(s.handsOver?.to === laneId ? { handsOver: { ...s.handsOver, to: createdId } } : {}),
        }));
        saveStory({ ...story, lanes: nextLanes, steps: nextSteps });
      }
    }
  };
  const { tops, heights, ADD_LANE_H, height, cardY, width, arrows } = getMakigamiLayout(lanes, steps, story, selectedStep, editingField, onRun);

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
  return {
    selectedStep,
    addingLane,
    editingHeader,
    editingField,
    setEditingField,
    setSelectedStep,
    setAddingLane,
    setEditingHeader,
    onBack,
    t,
    titleDraft,
    setTitleDraft,
    saveStory,
    story,
    id,
    onRun,
    insertStep,
    steps,
    onDeleteStory,
    sentenceDraft,
    setSentenceDraft,
    availablePerformers,
    handleAddLane,
    L,
    model,
    newLaneName,
    setNewLaneName,
    newLaneKind,
    setNewLaneKind,
    activeStep,
    updateStep,
    lanes,
    moveStep,
    deleteStep,
    dataObjects,
    issues,
    width,
    height,
    severityOf,
    laneIssues,
    heights,
    setEditingLane,
    setLaneLabelDraft,
    editingLane,
    laneLabelDraft,
    commitLaneRename,
    thing,
    moveLane,
    removeLane,
    ADD_LANE_H,
    dropTarget,
    tops,
    dragStep,
    setDropTarget,
    moveStepToCell,
    setDragStep,
    cardY,
    arrows,
    stepIssues,
    doesInputRef,
    addingCriterion,
    newCriterion,
    setNewCriterion,
    setAddingCriterion,
  };
}

export type MakigamiEditor = ReturnType<typeof useMakigamiEditor>;
