import { ViewContent } from "../../core/viewmodel";
import { Rect } from "../geometry";
import { Positions, Shapes, sizeOf } from "../layout";

/** Rectangle of a node in flow coordinates. */
export function rectOf(content: ViewContent, shapes: Shapes, positions: Positions, id: string): Rect | undefined {
  const n = content.nodes.find((x) => x.id === id);
  if (!n) return undefined;
  if (n.inside) {
    const p = positions[n.inside];
    const r = shapes.container?.shape.inner[id];
    return p && r ? { x: p[0] + r.x, y: p[1] + r.y, w: r.w, h: r.h } : undefined;
  }
  const p = positions[id];
  return p ? { x: p[0], y: p[1], ...sizeOf(shapes, id) } : undefined;
}
