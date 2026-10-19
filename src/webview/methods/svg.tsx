// Small SVG pieces shared by the method drawings, which are laid out by hand rather than by ELK.

/** Average width of a character at the drawing's font size, for laying out labels without measuring them. */
export const CHAR = 6.4;
const MAX = 30;

export const clip = (text: string, max = MAX) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A label cut to a length; the whole text is in the tooltip. */
export function Clipped({ x, y, text, anchor, max = MAX, className }: { x: number; y: number; text: string; anchor: "start" | "middle" | "end"; max?: number; className?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={className}>
      {clip(text, max)}
      {text.length > max && <title>{text}</title>}
    </text>
  );
}

/** A filled arrowhead with its tip at (x, y). */
export function Arrowhead({ x, y, dir }: { x: number; y: number; dir: "right" | "down" | "up" | "left" }) {
  const a = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
  return <polygon className="opm-m-head" points={`${x},${y} ${pt(x, y, a, 1)} ${pt(x, y, a, -1)}`} />;
}

const pt = (x: number, y: number, a: number, side: number) =>
  `${x - 8 * Math.cos(a) + side * 4 * Math.sin(a)},${y - 8 * Math.sin(a) - side * 4 * Math.cos(a)}`;
