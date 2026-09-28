/** Sizes of the OPM shapes, from the specification (section 5), and border intersections for links. */

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export const OBJECT_MIN = { w: 120, h: 50 };
export const PROCESS_MIN = { w: 220, h: 84 };
export const STATE = { h: 34, radius: 10, gap: 10, perRow: 4, padX: 12 };
const LABEL_TOP = 32;
const BOTTOM = 12;

let canvas: CanvasRenderingContext2D | null = null;

export function textWidth(text: string, size: number, weight = 400): number {
  if (typeof document === "undefined") return text.length * size * 0.55;
  canvas ??= document.createElement("canvas").getContext("2d");
  if (!canvas) return text.length * size * 0.55;
  const family = getComputedStyle(document.body).getPropertyValue("--vscode-font-family") || "sans-serif";
  canvas.font = `${weight} ${size}px ${family}`;
  return canvas.measureText(text).width;
}

export interface ObjectShape {
  w: number;
  h: number;
  /** State boxes relative to the object's top-left corner. */
  states: Record<string, Rect>;
}

export function objectShape(label: string, states: string[] = []): ObjectShape {
  const labelW = textWidth(label, 13, 600) + 32;
  if (!states.length) return { w: Math.max(OBJECT_MIN.w, labelW), h: OBJECT_MIN.h, states: {} };
  const pills = states.map((s) => Math.max(56, textWidth(s, 12) + 2 * STATE.padX));
  const rows: number[][] = [];
  pills.forEach((_, i) => {
    if (i % STATE.perRow === 0) rows.push([]);
    rows[rows.length - 1].push(i);
  });
  const rowWidth = (row: number[]) => row.reduce((sum, i) => sum + pills[i], 0) + (row.length - 1) * STATE.gap;
  const w = Math.max(OBJECT_MIN.w, labelW, ...rows.map((r) => rowWidth(r) + 2 * STATE.gap));
  const rects: Record<string, Rect> = {};
  rows.forEach((row, r) => {
    let x = (w - rowWidth(row)) / 2;
    const y = LABEL_TOP + r * (STATE.h + STATE.gap);
    for (const i of row) {
      rects[states[i]] = { x, y, w: pills[i], h: STATE.h };
      x += pills[i] + STATE.gap;
    }
  });
  return { w, h: LABEL_TOP + rows.length * STATE.h + (rows.length - 1) * STATE.gap + BOTTOM, states: rects };
}

export function processShape(label: string): { w: number; h: number } {
  return { w: Math.max(PROCESS_MIN.w, textWidth(label, 13, 600) + 96), h: PROCESS_MIN.h };
}

export interface ContainerShape {
  w: number;
  h: number;
  /** Subprocess boxes relative to the container's top-left corner, in order. */
  inner: Record<string, Rect>;
}

const SUB_GAP = 28;

/** A zoomed process: a large ellipse with its subprocesses stacked from the top. */
export function containerShape(label: string, subs: { id: string; w: number; h: number }[]): ContainerShape {
  const stackH = subs.reduce((s, x) => s + x.h, 0) + Math.max(0, subs.length - 1) * SUB_GAP;
  const maxW = Math.max(0, ...subs.map((s) => s.w));
  // an ellipse around a centered stack: the corners of the stack must stay inside the curve
  const w = Math.max(380, textWidth(label, 13, 600) + 120, maxW * 1.5 + 60);
  const h = Math.max(200, stackH * 1.45 + 110);
  const inner: Record<string, Rect> = {};
  let y = (h - stackH) / 2 + 14;
  for (const s of subs) {
    inner[s.id] = { x: (w - s.w) / 2, y, w: s.w, h: s.h };
    y += s.h + SUB_GAP;
  }
  return { w, h, inner };
}

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Where the segment from the center of a rectangle towards a point leaves the rectangle. */
export function rectBorder(r: Rect, toward: Point): Point {
  const c = center(r);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? (r.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (r.h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** Where the segment from the center of an ellipse towards a point leaves the ellipse. */
export function ellipseBorder(r: Rect, toward: Point): Point {
  const c = center(r);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const a = r.w / 2, b = r.h / 2;
  const s = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export function border(shape: { rect: Rect; ellipse: boolean }, toward: Point): Point {
  return shape.ellipse ? ellipseBorder(shape.rect, toward) : rectBorder(shape.rect, toward);
}

function inside(shape: { rect: Rect; ellipse: boolean }, p: Point): boolean {
  const r = shape.rect;
  if (!shape.ellipse) return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
  const c = center(r);
  return ((p.x - c.x) / (r.w / 2)) ** 2 + ((p.y - c.y) / (r.h / 2)) ** 2 < 1;
}

/**
 * Where a ray from a point inside a shape, in a direction, leaves the shape. Parallel links start at
 * points beside the center, so that they stay apart all the way to the border.
 */
export function borderFrom(shape: { rect: Rect; ellipse: boolean }, from: Point, dir: Point): Point {
  if (!inside(shape, from) || (!dir.x && !dir.y)) return border(shape, { x: from.x + dir.x, y: from.y + dir.y });
  const r = shape.rect;
  let t: number;
  if (shape.ellipse) {
    const c = center(r), a2 = (r.w / 2) ** 2, b2 = (r.h / 2) ** 2;
    const ux = from.x - c.x, uy = from.y - c.y;
    const A = dir.x ** 2 / a2 + dir.y ** 2 / b2;
    const B = 2 * (ux * dir.x / a2 + uy * dir.y / b2);
    const C = ux ** 2 / a2 + uy ** 2 / b2 - 1;
    t = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  } else {
    const tx = dir.x > 0 ? (r.x + r.w - from.x) / dir.x : dir.x < 0 ? (r.x - from.x) / dir.x : Infinity;
    const ty = dir.y > 0 ? (r.y + r.h - from.y) / dir.y : dir.y < 0 ? (r.y - from.y) / dir.y : Infinity;
    t = Math.min(tx, ty);
  }
  return { x: from.x + dir.x * t, y: from.y + dir.y * t };
}

/** A point moved perpendicular to a segment, for spreading parallel links. */
export function offsetSegment(a: Point, b: Point, d: number): [Point, Point] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  return [{ x: a.x + nx * d, y: a.y + ny * d }, { x: b.x + nx * d, y: b.y + ny * d }];
}
