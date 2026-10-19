import { ReactElement } from "react";
import { Entry, entryText } from "../../core/methods/common";
import { Idef0, Idef0Box } from "../../core/methods/idef0";
import { Model, label } from "../../core/model";
import { format } from "../../shared/i18n";
import { MethodMessages } from "./messages";
import { Arrowhead, CHAR, Clipped, clip } from "./svg";

/** One arrow on a side of a box; a sibling arrow comes from or goes to another box of the same diagram. */
interface Side {
  text: string;
  object: string;
  sibling?: boolean;
}

interface Spec {
  node: string;
  title: string;
  left: Side[];
  top: Side[];
  right: Side[];
  bottom: Side[];
}

interface Placed extends Spec {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SLOT = 24;
const STUB = 36;
const PAD = 16;
const textWidth = (sides: Side[]) => Math.max(0, ...sides.map((s) => clip(s.text).length * CHAR));
const unique = (list: string[]) => [...new Set(list)];

/** Where a side's k-th arrow meets the box; one object can have two boundary arrows, a sibling arrow has one slot. */
const atY = (b: Placed, list: Side[], k: number) => b.y + (b.h * (k + 1)) / (list.length + 1);
const atX = (b: Placed, list: Side[], k: number) => b.x + (b.w * (k + 1)) / (list.length + 1);
const sibling = (list: Side[], object: string) => list.findIndex((s) => s.sibling && s.object === object);

function size(s: Spec): { w: number; h: number } {
  const across = Math.max(s.top.length, s.bottom.length);
  const slot = Math.max(70, textWidth([...s.top, ...s.bottom].filter((x) => !x.sibling)) + 14);
  return { w: Math.max(170, slot * across), h: Math.max(64, SLOT * (Math.max(s.left.length, s.right.length) + 1)) };
}

/** The boxes of a diagram with their arrows: the boundary ones as labelled stubs, sibling ones routed between boxes. */
function Diagram({ specs, arrows, stub }: { specs: Spec[]; arrows: { from: number; to: number; object: string; text: string; role: "input" | "control" }[]; stub: number }) {
  // the arrows that leave one box with one object share a vertical channel to the right of the box
  const channels = specs.map((_, i) => unique(arrows.filter((a) => a.from === i).map((a) => a.object)));
  const placed: Placed[] = [];
  let x = PAD + stub + textWidth(specs[0]?.left.filter((s) => !s.sibling) ?? []) + 8;
  let y = PAD + (specs[0]?.top.length ? stub + 22 : 0);
  specs.forEach((s, i) => {
    if (i > 0) {
      const prev = placed[i - 1];
      const siblingControls = s.top.filter((t) => t.sibling).length;
      x = prev.x + prev.w + 30 + 10 * channels[i - 1].length + stub + Math.max(textWidth(s.left), textWidth(s.top.filter((t) => t.sibling)) - 20) + 8;
      y = prev.y + prev.h + (prev.bottom.length ? stub + 22 : 12) + (s.top.length ? stub + 24 : 16) + 6 * siblingControls;
    }
    placed.push({ ...s, x, y, ...size(s) });
  });
  const parts: ReactElement[] = [];
  let right = 0;
  let bottom = 0;
  placed.forEach((b, i) => {
    parts.push(
      <g key={`box${i}`} className="opm-m-box">
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} />
        <Clipped x={b.x + b.w / 2} y={b.y + b.h / 2 + 4} anchor="middle" text={b.title} max={Math.floor((b.w - 12) / CHAR)} className="opm-m-title" />
        <text x={b.x + b.w - 6} y={b.y + b.h - 6} textAnchor="end" className="opm-m-node">{b.node}</text>
      </g>,
    );
    b.left.forEach((s, k) => {
      if (s.sibling) return;
      const sy = atY(b, b.left, k);
      parts.push(<g key={`l${i}-${k}`}><line x1={b.x - stub} y1={sy} x2={b.x} y2={sy} /><Arrowhead x={b.x} y={sy} dir="right" /><Clipped x={b.x - stub - 4} y={sy + 4} anchor="end" text={s.text} /></g>);
    });
    b.top.forEach((s, k) => {
      if (s.sibling) return;
      const sx = atX(b, b.top, k);
      parts.push(<g key={`t${i}-${k}`}><line x1={sx} y1={b.y - stub} x2={sx} y2={b.y} /><Arrowhead x={sx} y={b.y} dir="down" /><Clipped x={sx} y={b.y - stub - 5} anchor="middle" text={s.text} /></g>);
    });
    b.right.forEach((s, k) => {
      if (s.sibling) return;
      const sy = atY(b, b.right, k);
      right = Math.max(right, b.x + b.w + stub + 4 + clip(s.text).length * CHAR);
      parts.push(<g key={`r${i}-${k}`}><line x1={b.x + b.w} y1={sy} x2={b.x + b.w + stub} y2={sy} /><Arrowhead x={b.x + b.w + stub} y={sy} dir="right" /><Clipped x={b.x + b.w + stub + 4} y={sy + 4} anchor="start" text={s.text} /></g>);
    });
    b.bottom.forEach((s, k) => {
      const sx = atX(b, b.bottom, k);
      bottom = Math.max(bottom, b.y + b.h + stub + 18);
      parts.push(<g key={`b${i}-${k}`}><line x1={sx} y1={b.y + b.h + stub} x2={sx} y2={b.y + b.h} /><Arrowhead x={sx} y={b.y + b.h} dir="up" /><Clipped x={sx} y={b.y + b.h + stub + 13} anchor="middle" text={s.text} /></g>);
    });
    right = Math.max(right, b.x + b.w + 10 * channels[i].length + 20);
    bottom = Math.max(bottom, b.y + b.h + 12);
  });
  // sibling arrows: right from the source, down its channel, then into the left side or the top of the target
  placed.forEach((src, i) => {
    channels[i].forEach((object, c) => {
      const sy = atY(src, src.right, sibling(src.right, object));
      const cx = src.x + src.w + 16 + 10 * c;
      const targets = arrows.filter((a) => a.from === i && a.object === object);
      const ends = targets.map((a) => {
        const dst = placed[a.to];
        if (a.role === "input") return { y: atY(dst, dst.left, sibling(dst.left, object)), a, dst };
        const m = dst.top.filter((t) => t.sibling).findIndex((t) => t.object === object);
        return { y: dst.y - 10 - 6 * m, a, dst };
      });
      const lowest = Math.max(...ends.map((e) => e.y));
      const segments = [`M${src.x + src.w},${sy} H${cx} V${lowest}`];
      const heads: ReactElement[] = [];
      const labels: ReactElement[] = [];
      for (const e of ends) {
        if (e.a.role === "input") {
          segments.push(`M${cx},${e.y} H${e.dst.x}`);
          heads.push(<Arrowhead key={`h${e.a.to}`} x={e.dst.x} y={e.y} dir="right" />);
          labels.push(<Clipped key={`t${e.a.to}`} x={e.dst.x - 6} y={e.y - 4} anchor="end" text={e.a.text} />);
        } else {
          const tx = atX(e.dst, e.dst.top, sibling(e.dst.top, object));
          segments.push(`M${cx},${e.y} H${tx} V${e.dst.y}`);
          heads.push(<Arrowhead key={`h${e.a.to}`} x={tx} y={e.dst.y} dir="down" />);
          labels.push(<Clipped key={`t${e.a.to}`} x={tx - 6} y={e.y - 4} anchor="end" text={e.a.text} />);
        }
      }
      parts.push(<g key={`s${i}-${c}`} className="opm-m-sibling"><path d={segments.join(" ")} />{heads}{labels}</g>);
    });
  });
  const width = Math.ceil(right + PAD);
  const height = Math.ceil(bottom + PAD);
  return <svg className="opm-m-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>{parts}</svg>;
}

function sides(model: Model, list: Entry[], t: MethodMessages): Side[] {
  return list.map((e) => ({ text: entryText(model, e, t.words), object: e.object }));
}

/** The A-0 box of a process with all four sides, and the A0 decomposition when it has subprocesses. */
export function Idef0View({ model, d, t }: { model: Model; d: Idef0; t: MethodMessages }) {
  const c = d.context;
  const context: Spec = {
    node: "A0", title: label(model, c.process),
    left: sides(model, c.inputs, t), top: sides(model, c.controls, t), right: sides(model, c.outputs, t), bottom: sides(model, c.mechanisms, t),
  };
  const boundaryOut = new Set(c.outputs.map((e) => e.object));
  const specs: Spec[] = d.boxes.map((b, j) => {
    const into = d.arrows.filter((a) => a.to === j);
    const delivered = new Set(into.map((a) => a.object));
    const sib = (role: "input" | "control") => unique(into.filter((a) => a.role === role).map((a) => a.object)).map((object) => ({ text: label(model, object), object, sibling: true }));
    const outgoing = unique(d.arrows.filter((a) => a.from === j).map((a) => a.object)).map((object) => ({ text: label(model, object), object, sibling: true }));
    return {
      node: b.node, title: label(model, b.process),
      left: [...sib("input"), ...sides(model, b.inputs.filter((e) => !delivered.has(e.object)), t)],
      top: [...sib("control"), ...sides(model, b.controls.filter((e) => !delivered.has(e.object)), t)],
      right: [...sides(model, b.outputs.filter((e) => boundaryOut.has(e.object)), t), ...outgoing],
      bottom: sides(model, b.mechanisms, t),
    };
  });
  const arrows = d.arrows.map((a) => ({ ...a, text: label(model, a.object) }));
  return (
    <>
      <h3>{format(t.context, { process: label(model, d.process) })}</h3>
      <Diagram specs={[context]} arrows={[]} stub={56} />
      {d.boxes.length > 0 && (
        <>
          <h3>{format(t.decomposition, { process: label(model, d.process) })}</h3>
          <Diagram specs={specs} arrows={arrows} stub={STUB} />
        </>
      )}
      <IcomTable model={model} boxes={[d.context, ...d.boxes]} t={t} />
    </>
  );
}

function IcomTable({ model, boxes, t }: { model: Model; boxes: Idef0Box[]; t: MethodMessages }) {
  const list = (entries: Entry[]) => entries.map((e) => entryText(model, e, t.words)).join(", ") || <span className="opm-dim">{t.none}</span>;
  return (
    <table className="opm-m-table">
      <thead><tr><th>{t.node}</th><th>{t.process}</th><th>{t.inputs}</th><th>{t.controls}</th><th>{t.outputs}</th><th>{t.mechanisms}</th></tr></thead>
      <tbody>
        {boxes.map((b) => (
          <tr key={b.node}>
            <td>{b.node}</td><td><b>{label(model, b.process)}</b></td>
            <td>{list(b.inputs)}</td><td>{list(b.controls)}</td><td>{list(b.outputs)}</td><td>{list(b.mechanisms)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
