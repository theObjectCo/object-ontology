import { useEffect, useRef, useState } from "react";
import { Messages } from "../../shared/i18n";
import { ViewInfo } from "../../core/viewmodel";
import { LAYOUTS, LayoutAlgorithm } from "../layout";
import { CanvasToolbar } from "../../../vendor/object-kit/components/studio/CanvasToolbar";

export interface ToolbarProps {
  t: Messages;
  trail: ViewInfo[];
  onView: (id: string) => void;
  onAddObject: () => void;
  onAddProcess: () => void;
  onAddState?: () => void;
  onArrange: (algorithm: LayoutAlgorithm) => void;
  stories?: { id: string; title: string }[];
  onOpenStory?: (id: string) => void;
  onNewStory?: () => void;
  menu: { label: string; action: () => void; checked?: boolean; disabled?: boolean }[];
  disabled: boolean;
}

export function Toolbar(p: ToolbarProps) {
  const [open, setOpen] = useState<"more" | "layout" | "stories" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className={`opm-toolbar${p.disabled ? " disabled" : ""}`} ref={ref}>
      <div className="opm-trail">
        {p.trail.map((v, i) => (
          <span key={v.id}>
            {i > 0 && <span className="opm-trail-sep">›</span>}
            <button className={i === p.trail.length - 1 ? "current" : "link"} onClick={() => p.onView(v.id)}>{v.code} · {v.title}</button>
          </span>
        ))}
      </div>
      <span className="opm-sep" />
      <CanvasToolbar className="opm-create-tools" groups={[[
        { id: "object", label: p.t.object, icon: "▭", shortcut: "O", disabled: p.disabled, onClick: p.onAddObject },
        { id: "process", label: p.t.process, icon: "◯", shortcut: "P", disabled: p.disabled, onClick: p.onAddProcess },
        ...(p.onAddState ? [{ id: "state", label: p.t.state, icon: "▢", shortcut: "S", disabled: p.disabled, onClick: p.onAddState }] : []),
      ]]} />
      <span className="opm-sep" />
      {(p.onOpenStory || p.onNewStory) && (
        <span className="opm-split">
          <button className="opm-stories-btn" onClick={() => setOpen(open === "stories" ? null : "stories")}>
            ▤ {p.t.stories}{p.stories?.length ? ` (${p.stories.length})` : ""} ▾
          </button>
          {open === "stories" && (
            <div className="opm-menu opm-stories-menu">
              {(p.stories ?? []).map((s) => (
                <button key={s.id} onClick={() => { setOpen(null); p.onOpenStory?.(s.id); }}>
                  <span>{s.title}</span> <span className="opm-dim">{s.id}</span>
                </button>
              ))}
              {p.onNewStory && (
                <button disabled={p.disabled} onClick={() => { setOpen(null); p.onNewStory?.(); }}>
                  <b>{p.t.newStory}</b>
                </button>
              )}
            </div>
          )}
        </span>
      )}
      <span className="opm-split">
        <button className="opm-layout" onClick={() => setOpen(open === "layout" ? null : "layout")}>{p.t.arrange} ▾</button>
        {open === "layout" && (
          <div className="opm-menu opm-layout-menu">
            {LAYOUTS.map((a) => (
              <button key={a} disabled={p.disabled} onClick={() => { setOpen(null); p.onArrange(a); }}>{p.t.layouts[a]}</button>
            ))}
          </div>
        )}
      </span>
      <button className="opm-more" onClick={() => setOpen(open === "more" ? null : "more")} aria-label="More">⋯</button>
      {open === "more" && (
        <div className="opm-menu">
          {p.menu.map((m) => (
            <button key={m.label} disabled={m.disabled} onClick={() => { setOpen(null); m.action(); }}>
              {m.checked !== undefined && <span className="opm-check">{m.checked ? "☑" : "☐"}</span>}{m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
