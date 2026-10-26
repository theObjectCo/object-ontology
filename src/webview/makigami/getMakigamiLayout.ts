import type { StoryDef, StoryStep } from "../../core/model";
import { handOverTarget } from "../../core/stories";
import { CARD_H, CARD_W, COL_W, GAP, HEAD_H, MIN_LANE_H, PAD, PROBLEM_H, WAIT_H, cardX } from "./dimensions";
import type { MakigamiProps } from "./MakigamiProps";

/** Geometry shared by the lane bands, cards, drag previews and handover arrows. */
export function getMakigamiLayout(
  lanes: string[], steps: StoryStep[], story: StoryDef,
  selectedStep: number | null, editingField: string | null, onRun: MakigamiProps["onRun"],
) {

  // lane bands: tall enough for a card, a wait line and a red card where any step of the lane has them
  const tops = new Map<string, number>();
  const heights = new Map<string, number>();
  let y = HEAD_H;
  for (const lane of lanes) {
    const own = steps.filter((s, idx) => s.lane === lane || (selectedStep === idx && s.lane === lane));
    const hasWait = own.some((s) => s.waits !== undefined) || (selectedStep !== null && steps[selectedStep]?.lane === lane && editingField === "waits");
    const hasProblem = own.some((s) => s.problem !== undefined) || (selectedStep !== null && steps[selectedStep]?.lane === lane && editingField === "problem");
    const h = Math.max(MIN_LANE_H, PAD + CARD_H + (hasWait ? WAIT_H : 0) + (hasProblem ? GAP + PROBLEM_H : 0) + PAD);
    tops.set(lane, y);
    heights.set(lane, h);
    y += h;
  }
  const ADD_LANE_H = onRun ? 44 : 0;
  const height = y + ADD_LANE_H;
  const cardY = (lane: string) => tops.get(lane)! + PAD;
  const midY = (lane: string) => cardY(lane) + CARD_H / 2;
  const targets = steps.map((_, k) => handOverTarget({ ...story, steps }, k));
  const extraGhostCol = onRun ? 1 : 0;
  const columns = Math.max(steps.length + extraGhostCol, ...targets.map((x) => (x ? x.column + 1 : 0)));
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
    return [{ k, d, open: target.step === undefined, x: mx, y: sy === ey ? sy : (sy + ey) / 2, object: h.object, state: h.state, to: h.to }];
  });
  return { tops, heights, ADD_LANE_H, height, cardY, width, arrows };
}
