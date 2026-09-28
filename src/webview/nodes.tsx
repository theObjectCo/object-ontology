import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { Rect } from "./geometry";

export interface NodeData extends Record<string, unknown> {
  id: string;
  label: string;
  w: number;
  h: number;
  environmental: boolean;
  physical: boolean;
  module?: boolean;
  states?: string[];
  stateRects?: Record<string, Rect>;
  severity?: "error" | "warning";
  tooltip?: string;
  dimmed?: boolean;
  /** During link drawing: true if a link to this node is allowed, false if not, undefined otherwise. */
  target?: boolean;
  highlightStates?: string[];
  editing?: boolean;
  hasZoom?: boolean;
  empty?: boolean;
  emptyHint?: string;
  onLabel?: (id: string, label: string | null) => void;
  onStartEdit?: (id: string) => void;
  onOpenZoom?: (id: string) => void;
}

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

function SideHandles() {
  return (
    <>
      {SIDES.map((p) => <Handle key={p} id={`side-${p}`} type="source" position={p} className="opm-handle" />)}
    </>
  );
}

function LabelEditor({ data, x, y, w }: { data: NodeData; x: number; y: number; w: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(data.label);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => data.onLabel?.(data.id, value.trim() || null);
  return (
    <input
      ref={ref}
      className="opm-label-input nodrag"
      style={{ left: x, top: y, width: w }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") data.onLabel?.(data.id, data.label);
      }}
    />
  );
}

function Selection({ w, h, ellipse }: { w: number; h: number; ellipse?: boolean }) {
  const pad = 6;
  return (
    <g className="opm-selection">
      {ellipse
        ? <ellipse cx={w / 2} cy={h / 2} rx={w / 2 + pad} ry={h / 2 + pad} />
        : <rect x={-pad} y={-pad} width={w + 2 * pad} height={h + 2 * pad} />}
    </g>
  );
}

function classes(data: NodeData, base: string, selected?: boolean): string {
  return [
    "opm-node", base,
    data.environmental && "environmental",
    data.severity && `severity-${data.severity}`,
    data.dimmed && "dimmed",
    data.target === true && "can-target",
    data.target === false && "cannot-target",
    selected && "is-selected",
  ].filter(Boolean).join(" ");
}

export function ObjectNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  const hasStates = !!d.states?.length;
  const labelY = hasStates ? 21 : d.h / 2 + 4.5;
  return (
    <div className={classes(d, "opm-object", selected)} style={{ width: d.w, height: d.h }} title={d.tooltip} data-thing={d.id}>
      <svg width={d.w} height={d.h} className="opm-shape">
        {d.physical && <rect className="opm-shadow" x={6} y={6} width={d.w} height={d.h} />}
        <rect className="opm-outline" x={1} y={1} width={d.w - 2} height={d.h - 2} strokeWidth={d.module ? 4 : 2} />
        {!d.editing && (
          <text className="opm-label opm-label-hit" x={d.w / 2} y={labelY} textAnchor="middle"
                onDoubleClick={(e) => { e.stopPropagation(); d.onStartEdit?.(d.id); }}>{d.label}</text>
        )}
        {d.states?.map((s) => {
          const r = d.stateRects![s];
          return (
            <g key={s} className={`opm-state${d.highlightStates?.includes(s) ? " highlighted" : ""}`} data-state={s}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={10} ry={10} />
            </g>
          );
        })}
        {selected && <Selection w={d.w} h={d.h} />}
      </svg>
      {d.editing && <LabelEditor data={d} x={8} y={hasStates ? 8 : d.h / 2 - 11} w={d.w - 16} />}
      <SideHandles />
      {d.states?.map((s) => {
        const r = d.stateRects![s];
        return (
          // the whole state box is a handle: a link drawn from it starts at the state
          <Handle key={s} id={`state:${s}`} type="source" position={Position.Bottom} className="opm-state-handle"
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h, bottom: "auto", transform: "none" }} />
        );
      })}
    </div>
  );
}

export function ProcessNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <div className={classes(d, "opm-process", selected)} style={{ width: d.w, height: d.h }} title={d.tooltip} data-thing={d.id}
         onDoubleClick={(e) => { e.stopPropagation(); d.onOpenZoom?.(d.id); }}>
      <svg width={d.w} height={d.h} className="opm-shape">
        {d.physical && <ellipse className="opm-shadow" cx={d.w / 2 + 6} cy={d.h / 2 + 6} rx={d.w / 2 - 1} ry={d.h / 2 - 1} />}
        <ellipse className="opm-outline" cx={d.w / 2} cy={d.h / 2} rx={d.w / 2 - 1} ry={d.h / 2 - 1} strokeWidth={d.hasZoom ? 3.5 : 2} />
        {!d.editing && (
          <text className="opm-label opm-label-hit" x={d.w / 2} y={d.h / 2 + 4.5} textAnchor="middle"
                onDoubleClick={(e) => { e.stopPropagation(); d.onStartEdit?.(d.id); }}>
            {d.label}{d.hasZoom ? " ›" : ""}
          </text>
        )}
        {selected && <Selection w={d.w} h={d.h} ellipse />}
      </svg>
      {d.editing && <LabelEditor data={d} x={24} y={d.h / 2 - 11} w={d.w - 48} />}
      <SideHandles />
    </div>
  );
}

export function ContainerNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <div className={classes(d, "opm-container", selected)} style={{ width: d.w, height: d.h }} title={d.tooltip} data-thing={d.id}>
      <svg width={d.w} height={d.h} className="opm-shape">
        {d.physical && <ellipse className="opm-shadow" cx={d.w / 2 + 6} cy={d.h / 2 + 6} rx={d.w / 2 - 1} ry={d.h / 2 - 1} />}
        <ellipse className="opm-outline" cx={d.w / 2} cy={d.h / 2} rx={d.w / 2 - 1} ry={d.h / 2 - 1} strokeWidth={2.5} />
        {/* the container is picked by its outline and label; clicks inside reach the links and the canvas */}
        <ellipse className="opm-hit" cx={d.w / 2} cy={d.h / 2} rx={d.w / 2 - 1} ry={d.h / 2 - 1} />
        {!d.editing && (
          <text className="opm-label opm-label-hit" x={d.w / 2} y={34} textAnchor="middle"
                onDoubleClick={(e) => { e.stopPropagation(); d.onStartEdit?.(d.id); }}>{d.label}</text>
        )}
        {selected && <Selection w={d.w} h={d.h} ellipse />}
      </svg>
      {d.editing && <LabelEditor data={d} x={d.w / 2 - 110} y={20} w={220} />}
      <SideHandles />
    </div>
  );
}

/** Visible texts of a thing, relative to its top-left corner; they are drawn in a layer above the links. */
function textsOf(type: string | undefined, d: NodeData): { x: number; y: number; text: string; className: string }[] {
  const out: { x: number; y: number; text: string; className: string }[] = [];
  if (type === "object") {
    if (!d.editing) out.push({ x: d.w / 2, y: d.states?.length ? 21 : d.h / 2 + 4.5, text: d.label, className: "opm-label" });
    for (const s of d.states ?? []) {
      const r = d.stateRects![s];
      out.push({ x: r.x + r.w / 2, y: r.y + r.h / 2 + 4, text: s, className: "opm-state-label" });
    }
  } else if (type === "process") {
    if (!d.editing) out.push({ x: d.w / 2, y: d.h / 2 + 4.5, text: `${d.label}${d.hasZoom ? " ›" : ""}`, className: "opm-label" });
  } else if (type === "container") {
    if (!d.editing) out.push({ x: d.w / 2, y: 34, text: d.label, className: "opm-label" });
    if (d.empty && d.emptyHint) out.push({ x: d.w / 2, y: d.h / 2 + 4, text: d.emptyHint, className: "opm-hint" });
  }
  return out;
}

/**
 * The texts of all things, in one SVG in flow coordinates. Rendered in React Flow's viewport portal, it lies
 * above the shapes, the links and the link labels, and lets every pointer event through to the things.
 */
export function ThingLabels({ nodes }: { nodes: Node[] }) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <svg className="opm-thing-labels">
      {nodes.map((n) => {
        const d = n.data as NodeData;
        const parent = n.parentId ? byId.get(n.parentId) : undefined;
        const x = n.position.x + (parent?.position.x ?? 0), y = n.position.y + (parent?.position.y ?? 0);
        const cls = ["opm-thing-text", d.dimmed && "dimmed", d.target === false && "cannot-target"].filter(Boolean).join(" ");
        return (
          <g key={n.id} className={cls} transform={`translate(${x},${y})`}>
            {textsOf(n.type, d).map((t, i) => <text key={i} className={t.className} x={t.x} y={t.y} textAnchor="middle">{t.text}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

export const nodeTypes = { object: ObjectNode, process: ProcessNode, container: ContainerNode };
