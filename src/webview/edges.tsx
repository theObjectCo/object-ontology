import { EdgeLabelRenderer, EdgeProps, InternalNode, useInternalNode } from "@xyflow/react";
import { ReactElement } from "react";
import { EditorLinkKind } from "../core/links";
import { Point, Rect, borderFrom, center, offsetSegment } from "./geometry";
import { NodeData } from "./nodes";

export interface EdgeData extends Record<string, unknown> {
  kind: EditorLinkKind;
  fromState?: string;
  toState?: string;
  /** Which drawn end holds the states: the object end. */
  stateEnd: "source" | "target";
  word: string;
  tag?: string;
  labelsOn: boolean;
  dimmed?: boolean;
  offset: number;
}

interface Shape { rect: Rect; ellipse: boolean }

function shapeOf(node: InternalNode | undefined, state?: string): Shape | undefined {
  if (!node) return undefined;
  const { x, y } = node.internals.positionAbsolute;
  const w = node.measured?.width ?? (node.data as NodeData).w;
  const h = node.measured?.height ?? (node.data as NodeData).h;
  const pill = state ? (node.data as NodeData).stateRects?.[state] : undefined;
  if (pill) return { rect: { x: x + pill.x, y: y + pill.y, w: pill.w, h: pill.h }, ellipse: false };
  return { rect: { x, y, w, h }, ellipse: node.type !== "object" };
}

function ends(a: Shape, b: Shape, offset: number): [Point, Point] {
  const [ca, cb] = offsetSegment(center(a.rect), center(b.rect), offset);
  const dir = { x: cb.x - ca.x, y: cb.y - ca.y };
  return [borderFrom(a, ca, dir), borderFrom(b, cb, { x: -dir.x, y: -dir.y })];
}

const angle = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);
const at = (p: Point, a: number, d: number): Point => ({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d });
const pts = (...ps: Point[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");

/** A filled arrowhead whose tip is at p, pointing along a. */
function Arrow({ p, a, open }: { p: Point; a: number; open?: boolean }) {
  const back = at(p, a + Math.PI, 11);
  const l = at(back, a + Math.PI / 2, 5.5), r = at(back, a - Math.PI / 2, 5.5);
  return open
    ? <polyline className="opm-marker-line" points={pts(l, p, r)} />
    : <polygon className="opm-marker" points={pts(l, p, r)} />;
}

/** A circle centered on the border of the process. */
function Lollipop({ p, filled }: { p: Point; filled: boolean }) {
  return <circle className={filled ? "opm-marker" : "opm-marker-hollow"} cx={p.x} cy={p.y} r={5.5} />;
}

/** A triangle with its apex at p, pointing along a; inner draws the exhibition mark. */
function Triangle({ p, a, filled, inner }: { p: Point; a: number; filled: boolean; inner?: boolean }) {
  const base = at(p, a + Math.PI, 16);
  const l = at(base, a + Math.PI / 2, 9), r = at(base, a - Math.PI / 2, 9);
  const small = [at(p, a + Math.PI, 5), at(at(base, a, 2), a + Math.PI / 2, 4.5), at(at(base, a, 2), a - Math.PI / 2, 4.5)];
  return (
    <>
      <polygon className={filled ? "opm-marker" : "opm-marker-hollow"} points={pts(l, p, r)} />
      {inner && <polygon className="opm-marker" points={pts(...small)} />}
    </>
  );
}

function Zigzag({ a, b }: { a: Point; b: Point }) {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ang = angle(a, b);
  const p1 = at(m, ang + Math.PI, 8), p4 = at(m, ang, 8);
  const p2 = at(at(m, ang + Math.PI, 3), ang + Math.PI / 2, 7);
  const p3 = at(at(m, ang, 3), ang - Math.PI / 2, 7);
  return <polyline className="opm-edge-path" points={pts(p1, p2, p3, p4)} />;
}

/** The word or tag of a link, in React Flow's label layer: above every link, below the texts of things. */
function Pill({ p, text, className }: { p: Point; text: string; className: string }) {
  return (
    <EdgeLabelRenderer>
      <div className={`opm-edge-label ${className}`} style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}>{text}</div>
    </EdgeLabelRenderer>
  );
}

function Letter({ p, a, letter }: { p: Point; a: number; letter: string }) {
  const q = at(at(p, a + Math.PI, 16), a + Math.PI / 2, 10);
  return <text className="opm-letter" x={q.x} y={q.y + 3.5} textAnchor="middle">{letter}</text>;
}

export function OpmEdge({ id, source, target, data, selected }: EdgeProps) {
  const d = data as EdgeData;
  const src = useInternalNode(source);
  const tgt = useInternalNode(target);
  const srcState = d.stateEnd === "source" ? d.fromState : undefined;
  const tgtState = d.stateEnd === "target" ? d.toState : undefined;
  const className = `opm-edge${selected ? " selected" : ""}${d.dimmed ? " dimmed" : ""}`;

  // an effect between two states is drawn as two arrows: from state to process, and from process to state
  if (d.kind === "effect" && d.toState) {
    const obj = d.stateEnd === "source" ? src : tgt;
    const proc = d.stateEnd === "source" ? tgt : src;
    const procShape = shapeOf(proc);
    const toShape = shapeOf(obj, d.toState);
    if (!procShape || !toShape) return null;
    const fromShape = d.fromState ? shapeOf(obj, d.fromState) : undefined;
    // the second segment runs the other way, so its offset is negated to stay on the same side
    const [b1, b2] = ends(procShape, toShape, -d.offset);
    const seg1 = fromShape ? ends(fromShape, procShape, d.offset) : undefined;
    const mid = seg1 ? { x: (seg1[1].x + b1.x) / 2, y: (seg1[1].y + b1.y) / 2 } : { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
    return (
      <g className={className} data-edge={id}>
        {seg1 && <path className="react-flow__edge-interaction" d={`M${seg1[0].x},${seg1[0].y}L${seg1[1].x},${seg1[1].y}`} />}
        <path className="react-flow__edge-interaction" d={`M${b1.x},${b1.y}L${b2.x},${b2.y}`} />
        {seg1 && <path className="opm-edge-path" d={`M${seg1[0].x},${seg1[0].y}L${seg1[1].x},${seg1[1].y}`} />}
        {seg1 && <Arrow p={seg1[1]} a={angle(seg1[0], seg1[1])} />}
        <path className="opm-edge-path" d={`M${b1.x},${b1.y}L${b2.x},${b2.y}`} />
        <Arrow p={b2} a={angle(b1, b2)} />
        {d.labelsOn && <Pill p={mid} text={d.word} className={className} />}
      </g>
    );
  }

  const a = shapeOf(src, srcState);
  const b = shapeOf(tgt, tgtState);
  if (!a || !b) return null;
  const [p1, p2] = ends(a, b, d.offset);
  const ang = angle(p1, p2);
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const path = `M${p1.x},${p1.y}L${p2.x},${p2.y}`;
  let markers: ReactElement | null = null;
  switch (d.kind) {
    case "consumption": markers = <Arrow p={p2} a={ang} />; break;
    case "result": markers = <Arrow p={p2} a={ang} />; break;
    case "effect": markers = <><Arrow p={p2} a={ang} /><Arrow p={p1} a={ang + Math.PI} /></>; break;
    case "agent": markers = <Lollipop p={p2} filled />; break;
    case "instrument": markers = <Lollipop p={p2} filled={false} />; break;
    case "condition": markers = <><Lollipop p={p2} filled={false} /><Letter p={p2} a={ang} letter="c" /></>; break;
    case "event": markers = <><Lollipop p={p2} filled={false} /><Letter p={p2} a={ang} letter="e" /></>; break;
    case "invocation": markers = <><Zigzag a={p1} b={p2} /><Arrow p={p2} a={ang} /></>; break;
    case "aggregation": markers = <Triangle p={p1} a={ang + Math.PI} filled />; break;
    case "exhibition": markers = <Triangle p={p1} a={ang + Math.PI} filled={false} inner />; break;
    case "generalization": markers = <Triangle p={p2} a={ang} filled={false} />; break;
    case "tagged": markers = <Arrow p={p2} a={ang} open />; break;
  }
  // the invocation zigzag replaces the middle of the line
  const line = d.kind === "invocation"
    ? <><path className="opm-edge-path" d={`M${p1.x},${p1.y}L${at(mid, ang + Math.PI, 8).x},${at(mid, ang + Math.PI, 8).y}`} />
        <path className="opm-edge-path" d={`M${at(mid, ang, 8).x},${at(mid, ang, 8).y}L${p2.x},${p2.y}`} /></>
    : <path className="opm-edge-path" d={path} />;
  const text = d.kind === "tagged" ? d.tag ?? "" : d.labelsOn ? d.word : "";
  return (
    <g className={className} data-edge={id}>
      <path className="react-flow__edge-interaction" d={path} />
      {line}
      {markers}
      {text && <Pill p={mid} text={text} className={className} />}
    </g>
  );
}

export const edgeTypes = { opm: OpmEdge };
