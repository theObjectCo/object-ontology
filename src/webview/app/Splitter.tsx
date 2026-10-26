

/** A bar between two panes; dragging it reports the pointer's travel since the drag started. */
export function Splitter({ axis, onDrag, onReset }: { axis: "x" | "y"; onDrag: (delta: number, end: boolean) => void; onReset: () => void }) {
  return (
    <div
      className={`opm-splitter ${axis === "x" ? "vertical" : "horizontal"}`}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = e.currentTarget;
        const start = axis === "x" ? e.clientX : e.clientY;
        el.setPointerCapture(e.pointerId);
        el.classList.add("active");
        const move = (m: PointerEvent) => onDrag((axis === "x" ? m.clientX : m.clientY) - start, false);
        const up = (m: PointerEvent) => {
          el.releasePointerCapture(m.pointerId);
          el.classList.remove("active");
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          onDrag((axis === "x" ? m.clientX : m.clientY) - start, true);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
    />
  );
}
