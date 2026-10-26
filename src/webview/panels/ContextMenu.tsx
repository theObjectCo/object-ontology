import { useEffect, useRef, useState } from "react";

/** A menu entry, or "-" for a separator. */
export type ContextItem = { label: string; keys?: string; action: () => void; disabled?: boolean } | "-";

export function ContextMenu({ x, y, title, subtitle, items, onClose }: {
  x: number; y: number; title?: string; subtitle?: string; items: ContextItem[]; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    // keep the menu inside the canvas
    const el = ref.current, box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box) return;
    setPos({ x: Math.max(4, Math.min(x, box.width - el.offsetWidth - 4)), y: Math.max(4, Math.min(y, box.height - el.offsetHeight - 4)) });
  }, [x, y]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  const shown = items.filter((it, i) => it !== "-" || (i > 0 && items[i - 1] !== "-" && i < items.length - 1));
  return (
    <div ref={ref} className="opm-menu opm-context" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {title && <div className="opm-context-head"><b>{title}</b>{subtitle && <span className="opm-id">{subtitle}</span>}</div>}
      {shown.map((it, i) => it === "-"
        ? <div key={i} className="opm-context-sep" />
        : (
          <button key={i} disabled={it.disabled} onClick={() => { onClose(); it.action(); }}>
            <span>{it.label}</span>{it.keys && <span className="opm-dim">{it.keys}</span>}
          </button>
        ))}
    </div>
  );
}
