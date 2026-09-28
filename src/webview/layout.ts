import type { ElkNode } from "elkjs/lib/elk-api";
import ELK from "elkjs/lib/elk-api";
import { Model, label, objects } from "../core/model";
import { ViewContent } from "../core/viewmodel";
import { ContainerShape, ObjectShape, Rect, containerShape, objectShape, processShape } from "./geometry";

export type Positions = Record<string, [number, number]>;

export interface Shapes {
  objects: Record<string, ObjectShape>;
  processes: Record<string, { w: number; h: number }>;
  container?: { id: string; shape: ContainerShape };
}

export function shapesOf(model: Model, content: ViewContent): Shapes {
  const out: Shapes = { objects: {}, processes: {} };
  for (const n of content.nodes) {
    if (n.kind === "object") out.objects[n.id] = objectShape(label(model, n.id), objects(model)[n.id]?.states);
    else if (!n.container) out.processes[n.id] = processShape(label(model, n.id));
  }
  const container = content.nodes.find((n) => n.container);
  if (container) {
    const subs = content.nodes.filter((n) => n.inside === container.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    out.container = {
      id: container.id,
      shape: containerShape(label(model, container.id), subs.map((s) => ({ id: s.id, ...out.processes[s.id] }))),
    };
  }
  return out;
}

/** Size of a node that is positioned on its own (not a subprocess inside the container). */
function sizeOf(shapes: Shapes, id: string): { w: number; h: number } {
  if (shapes.container?.id === id) return shapes.container.shape;
  return shapes.objects[id] ?? shapes.processes[id] ?? { w: 120, h: 50 };
}

/** Top-level nodes of a view: everything except the subprocesses inside the container. */
export function topLevel(content: ViewContent): string[] {
  return content.nodes.filter((n) => !n.inside).map((n) => n.id);
}

/** Maps a drawn end to the top-level node that carries it. */
function carrier(content: ViewContent, id: string): string {
  const n = content.nodes.find((x) => x.id === id);
  return n?.inside ?? id;
}

let elk: InstanceType<typeof ELK> | null | undefined;

async function engine(): Promise<InstanceType<typeof ELK> | null> {
  if (elk !== undefined) return elk;
  try {
    const url = document.getElementById("root")?.dataset.elkWorker;
    if (!url) throw new Error("no worker url");
    const source = await (await fetch(url)).text();
    const blobUrl = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
    elk = new ELK({ workerFactory: () => new Worker(blobUrl) as never });
  } catch (e) {
    console.warn("ELK worker unavailable, using a simple grid layout", e);
    elk = null;
  }
  return elk;
}

/** Automatic positions of the top-level nodes (top-left corners). */
export async function autoLayout(content: ViewContent, shapes: Shapes): Promise<Positions> {
  const ids = topLevel(content);
  const edges = content.edges
    .map((e) => [carrier(content, e.source), carrier(content, e.target)] as const)
    .filter(([a, b]) => a !== b && ids.includes(a) && ids.includes(b));
  const run = await engine();
  if (!run) return gridLayout(ids, shapes);
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "110",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "80",
    },
    children: ids.map((id) => ({ id, width: sizeOf(shapes, id).w, height: sizeOf(shapes, id).h })),
    edges: edges.map(([s, t], i) => ({ id: `e${i}`, sources: [s], targets: [t] })),
  };
  try {
    const result = await run.layout(graph);
    const out: Positions = {};
    for (const c of result.children ?? []) out[c.id] = [Math.round((c.x ?? 0) + 40), Math.round((c.y ?? 0) + 40)];
    return out;
  } catch (e) {
    console.warn("ELK layout failed, using a grid", e);
    return gridLayout(ids, shapes);
  }
}

function gridLayout(ids: string[], shapes: Shapes): Positions {
  const out: Positions = {};
  const perRow = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
  let x = 40, y = 40, rowH = 0;
  ids.forEach((id, i) => {
    const s = sizeOf(shapes, id);
    out[id] = [x, y];
    x += s.w + 80;
    rowH = Math.max(rowH, s.h);
    if ((i + 1) % perRow === 0) { x = 40; y += rowH + 80; rowH = 0; }
  });
  return out;
}

/**
 * Positions for a manual view: the stored ones, plus a free place next to the linked things for each
 * node without a position (or in the visible area when it has no links).
 */
export function manualLayout(content: ViewContent, shapes: Shapes, stored: Positions, visible: { x: number; y: number }): Positions {
  const out: Positions = {};
  const ids = topLevel(content);
  for (const id of ids) if (stored[id]) out[id] = [...stored[id]] as [number, number];
  const occupied = (): Rect[] => Object.entries(out).map(([id, [x, y]]) => ({ x, y, ...sizeOf(shapes, id) }));
  for (const id of ids) {
    if (out[id]) continue;
    const s = sizeOf(shapes, id);
    const linked = content.edges
      .flatMap((e) => [[carrier(content, e.source), carrier(content, e.target)]])
      .filter(([a, b]) => a === id || b === id)
      .map(([a, b]) => (a === id ? b : a))
      .filter((o) => out[o]);
    let x: number, y: number;
    if (linked.length) {
      const cx = linked.reduce((sum, o) => sum + out[o][0] + sizeOf(shapes, o).w / 2, 0) / linked.length;
      const cy = linked.reduce((sum, o) => sum + out[o][1] + sizeOf(shapes, o).h / 2, 0) / linked.length;
      x = cx + 160; y = cy - s.h / 2;
    } else {
      x = visible.x; y = visible.y;
    }
    // move down until the node overlaps nothing
    const overlaps = (px: number, py: number) => occupied().some((r) => px < r.x + r.w + 20 && px + s.w + 20 > r.x && py < r.y + r.h + 20 && py + s.h + 20 > r.y);
    for (let i = 0; i < 200 && overlaps(x, y); i++) y += 30;
    out[id] = [Math.round(x), Math.round(y)];
  }
  return out;
}

/** A key that changes when the laid-out graph changes, so an automatic layout can be reused. */
export function layoutKey(content: ViewContent, shapes: Shapes): string {
  const nodes = topLevel(content).map((id) => `${id}:${Math.round(sizeOf(shapes, id).w)}x${Math.round(sizeOf(shapes, id).h)}`);
  const edges = content.edges.map((e) => `${carrier(content, e.source)}>${carrier(content, e.target)}`);
  return `${content.view.id}|${nodes.join(",")}|${edges.join(",")}`;
}

export { sizeOf };
