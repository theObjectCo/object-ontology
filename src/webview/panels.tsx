import { CSSProperties, ChangeEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { EditorLink, EditorLinkKind, STATEFUL, allowedKinds } from "../core/links";
import { Model, affiliation, essence, humanize, label, objects, processes } from "../core/model";
import { Sentence } from "../core/opl";
import { ViewInfo } from "../core/viewmodel";
import { LINK_WORDS, Messages, format } from "../shared/i18n";
import { SchemaFile } from "../shared/protocol";

/* ---------- toolbar ---------- */

export interface ToolbarProps {
  t: Messages;
  trail: ViewInfo[];
  onView: (id: string) => void;
  onAddObject: () => void;
  onAddProcess: () => void;
  onAddState?: () => void;
  manual: boolean;
  onAutoLayout: () => void;
  onResetLayout: () => void;
  menu: { label: string; action: () => void; checked?: boolean; disabled?: boolean }[];
  disabled: boolean;
}

export function Toolbar(p: ToolbarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
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
      <button onClick={p.onAddObject} title="O">▭ {p.t.object}</button>
      <button onClick={p.onAddProcess} title="P">◯ {p.t.process}</button>
      {p.onAddState && <button onClick={p.onAddState} title="S">▢ {p.t.state}</button>}
      <span className="opm-sep" />
      <button onClick={p.onAutoLayout}>{p.t.autoLayout}</button>
      <span className={`opm-badge${p.manual ? " manual" : ""}`}>{p.manual ? p.t.layoutManual : p.t.layoutAuto}</span>
      {p.manual && <button onClick={p.onResetLayout}>{p.t.resetLayout}</button>}
      <button className="opm-more" onClick={() => setOpen(!open)} aria-label="More">⋯</button>
      {open && (
        <div className="opm-menu">
          {p.menu.map((m) => (
            <button key={m.label} disabled={m.disabled} onClick={() => { setOpen(false); m.action(); }}>
              {m.checked !== undefined && <span className="opm-check">{m.checked ? "☑" : "☐"}</span>}{m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- zoom ---------- */

export function ZoomControls({ zoom, onIn, onOut, onFit, t }: { zoom: number; onIn: () => void; onOut: () => void; onFit: () => void; t: Messages }) {
  return (
    <div className="opm-zoom">
      <button onClick={onOut} aria-label="Zoom out">−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={onIn} aria-label="Zoom in">+</button>
      <button onClick={onFit} title={t.fit}>⤢</button>
    </div>
  );
}

/* ---------- OPL ---------- */

export function SentenceView({ s, selected, onClick }: { s: Sentence; selected: Set<string>; onClick: (refs: string[]) => void }) {
  const hot = s.refs.some((r) => selected.has(r));
  return (
    <span className={`opm-sentence${hot ? " hot" : ""}`} onClick={() => onClick(s.refs)}>
      {s.tokens.map((tk, i) => ("thing" in tk ? <b key={i}>{tk.text}</b> : "state" in tk ? <i key={i}>{tk.text}</i> : <span key={i}>{tk.text}</span>))}
    </span>
  );
}

export interface OplProps {
  t: Messages;
  sentences: Sentence[];
  expanded: boolean;
  mode: "view" | "selection";
  selectionActive: boolean;
  selected: Set<string>;
  onToggle: () => void;
  onMode: (m: "view" | "selection") => void;
  onSelect: (refs: string[]) => void;
}

export function OplBar(p: OplProps) {
  const text = p.sentences.map((s) => s.tokens.map((t) => t.text).join("")).join(" ");
  const list = useRef<HTMLDivElement>(null);
  // the first sentence about the selection scrolls into view
  useEffect(() => {
    list.current?.querySelector(".hot")?.scrollIntoView({ block: "nearest" });
  }, [p.selected, p.expanded]);
  if (!p.expanded) {
    return (
      <div className="opm-opl collapsed">
        <button className="opm-opl-toggle" onClick={p.onToggle}>▸ {p.t.opl}</button>
        <div className="opm-opl-line">
          {p.sentences.slice(0, 3).map((s, i) => <SentenceView key={i} s={s} selected={p.selected} onClick={p.onSelect} />)}
          {p.sentences.length > 3 && <span className="opm-dim"> …</span>}
        </div>
        <span className="opm-dim">{p.selectionActive ? p.t.selectionOnly.toLowerCase() : `${p.sentences.length} ${p.t.sentences}`}</span>
      </div>
    );
  }
  return (
    <div className="opm-opl expanded">
      <div className="opm-opl-head">
        <button className="opm-opl-toggle" onClick={p.onToggle}>▾ {p.t.opl}</button>
        <div className="opm-seg">
          <button className={p.mode === "view" ? "on" : ""} onClick={() => p.onMode("view")}>{p.t.wholeView}</button>
          <button className={p.mode === "selection" ? "on" : ""} onClick={() => p.onMode("selection")}>{p.t.selectionOnly}</button>
        </div>
        <button className="link" onClick={() => navigator.clipboard?.writeText(text)}>{p.t.copy}</button>
      </div>
      <div className="opm-opl-list" ref={list}>
        {p.sentences.map((s, i) => <div key={i}><SentenceView s={s} selected={p.selected} onClick={p.onSelect} /></div>)}
      </div>
    </div>
  );
}

/* ---------- inspector and drawer ---------- */

export interface InspectorProps {
  t: Messages;
  language: string;
  model: Model;
  ids: string[];
  link?: EditorLink;
  schemas: SchemaFile[];
  drawer: boolean;
  style?: CSSProperties;
  onMore: () => void;
  onLess: () => void;
  onShowJson: (id: string) => void;
  onOpenZoom: (id: string) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onRename: (oldId: string, newId: string) => Promise<string | undefined>;
  onAddState: (id: string, state?: string) => void;
  onRenameState: (id: string, oldState: string, newState: string) => void;
  onDeleteState: (id: string, state: string) => void;
  onMoveState: (id: string, state: string, index: number) => void;
  onUpdateLink: (id: string, patch: { kind?: EditorLinkKind; fromState?: string | null; toState?: string | null; tag?: string; reverse?: boolean }) => void;
  onDelete: () => void;
  onCopy: () => void;
  onSaveView: () => void;
}

function Field({ value, onCommit, mono, placeholder, multiline }: { value: string; onCommit: (v: string) => void; mono?: boolean; placeholder?: string; multiline?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  const props = {
    className: `opm-input${mono ? " mono" : ""}`, value: v, placeholder,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: ReactKeyboardEvent) => { e.stopPropagation(); if (e.key === "Enter" && !multiline) commit(); if (e.key === "Escape") setV(value); },
  };
  return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
}

function IdField({ id, onRename, t }: { id: string; onRename: (o: string, n: string) => Promise<string | undefined>; t: Messages }) {
  const [v, setV] = useState(id);
  const [error, setError] = useState<string>();
  useEffect(() => { setV(id); setError(undefined); }, [id]);
  const valid = /^[a-z][A-Za-z0-9]*$/.test(v);
  const commit = async () => {
    if (v === id) return;
    if (!valid) return setError("camelCase, a–z first");
    setError(await onRename(id, v));
  };
  return (
    <>
      <input id="opm-id-field" className={`opm-input mono${error || !valid ? " invalid" : ""}`} value={v}
             onChange={(e) => { setV(e.target.value); setError(undefined); }} onBlur={commit}
             onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") void commit(); if (e.key === "Escape") setV(id); }} />
      {(error || !valid) && <div className="opm-field-error">{error ?? "camelCase, a–z first"}</div>}
    </>
  );
}

function StatePills({ p, id, editable }: { p: InspectorProps; id: string; editable: boolean }) {
  const o = objects(p.model)[id];
  const states = o?.states ?? [];
  const enums = useMemo(() => {
    if (!o?.schema) return [];
    for (const f of p.schemas) for (const d of f.defs) if (d.ref === o.schema) return d.enums;
    return [];
  }, [o?.schema, p.schemas]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const suggestions = enums.filter((e) => !states.includes(e));
  return (
    <div className="opm-pills">
      {states.map((s, i) => (
        <span key={s} className="opm-pill" draggable={editable}
              onDragStart={() => setDrag(s)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag && drag !== s) p.onMoveState(id, drag, i); setDrag(null); }}>
          {renaming === s
            ? <input className="opm-pill-input" autoFocus defaultValue={s}
                     onBlur={(e) => { setRenaming(null); if (e.target.value && e.target.value !== s) p.onRenameState(id, s, e.target.value); }}
                     onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(null); }} />
            : <span onDoubleClick={() => editable && setRenaming(s)}>{s}</span>}
          {editable && <button className="opm-x" onClick={() => p.onDeleteState(id, s)} aria-label="Delete state">×</button>}
        </span>
      ))}
      {suggestions.map((s) => <button key={s} className="opm-pill suggestion" onClick={() => p.onAddState(id, s)}>+ {s}</button>)}
      <button className="opm-pill add" onClick={() => p.onAddState(id)}>{p.t.addState}</button>
    </div>
  );
}

function SchemaPicker({ p, id }: { p: InspectorProps; id: string }) {
  const [q, setQ] = useState("");
  const current = objects(p.model)[id]?.schema;
  const files = p.schemas
    .map((f) => ({ ...f, defs: f.defs.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.ref.toLowerCase().includes(q.toLowerCase())) }))
    .filter((f) => f.defs.length);
  return (
    <div className="opm-schema">
      <input className="opm-input" placeholder={p.t.searchSchema} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="opm-schema-list">
        <button className={!current ? "on" : ""} onClick={() => p.onUpdate(id, { schema: null })}>{p.t.noSchema}</button>
        {files.map((f) => (
          <div key={f.file}>
            <div className="opm-schema-file">{f.file}</div>
            {f.defs.map((d) => (
              <button key={d.ref} className={d.ref === current ? "on" : ""} onClick={() => p.onUpdate(id, { schema: d.ref })} title={d.ref}>
                {d.name}{d.enums.length ? <span className="opm-dim"> · {d.enums.join(", ")}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, summary, open: initial = true, children }: { title: string; summary?: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="opm-section">
      <button className="opm-section-head" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title.toUpperCase()}{!open && summary && <span className="opm-dim"> {summary}</span>}
      </button>
      {open && <div className="opm-section-body">{children}</div>}
    </div>
  );
}

function Classification({ p, id }: { p: InspectorProps; id: string }) {
  const isObject = !!objects(p.model)[id];
  const def = (objects(p.model)[id] ?? processes(p.model)[id])!;
  const ess = essence(def), aff = affiliation(def);
  const summary = [ess === "physical" ? p.t.physical : p.t.informatical, aff === "environmental" ? p.t.environmental : p.t.systemic,
    isObject ? `${p.t.module.toLowerCase()}: ${objects(p.model)[id].role === "module" ? p.t.yes : p.t.no}` : ""].filter(Boolean).join(" · ");
  const radio = (name: string, value: string, current: string, text: string, onPick: () => void) => (
    <label className="opm-radio"><input type="radio" name={`${id}-${name}`} checked={current === value} onChange={onPick} /> {text}</label>
  );
  return (
    <Section title={p.t.classification} summary={summary} open={false}>
      {isObject && (
        <div className="opm-row"><span>{p.t.module}</span>
          <div className="opm-choices">
            <label className="opm-radio"><input type="checkbox" checked={objects(p.model)[id].role === "module"} onChange={(e) => p.onUpdate(id, { role: e.target.checked })} /> {p.t.yes}</label>
          </div>
        </div>
      )}
      <div className="opm-row"><span>{p.t.essence}</span>
        <div className="opm-choices">
          {radio("essence", "informatical", ess, p.t.informatical, () => p.onUpdate(id, { essence: null }))}
          {radio("essence", "physical", ess, p.t.physical, () => p.onUpdate(id, { essence: "physical" }))}
        </div>
      </div>
      <div className="opm-row"><span>{p.t.affiliation}</span>
        <div className="opm-choices">
          {radio("aff", "systemic", aff, p.t.systemic, () => p.onUpdate(id, { affiliation: null }))}
          {radio("aff", "environmental", aff, p.t.environmental, () => p.onUpdate(id, { affiliation: "environmental" }))}
        </div>
      </div>
    </Section>
  );
}

function LinkFields({ p, link }: { p: InspectorProps; link: EditorLink }) {
  const words = LINK_WORDS[p.language.toLowerCase().startsWith("pl") ? "pl" : "en"];
  const kinds = allowedKinds(p.model, link.from, link.to);
  const owner = link.kind === "result" ? link.to : link.from;
  const states = objects(p.model)[owner]?.states ?? [];
  const canFrom = STATEFUL[link.kind].from && states.length > 0;
  const canTo = STATEFUL[link.kind].to && states.length > 0;
  const reverseAllowed = allowedKinds(p.model, link.to, link.from).includes(link.kind);
  return (
    <>
      <div className="opm-row"><span>{p.t.kind}</span>
        <select className="opm-input" value={link.kind} onChange={(e) => p.onUpdateLink(link.id, { kind: e.target.value as EditorLinkKind })}>
          {kinds.map((k) => <option key={k} value={k}>{words[k] ?? k}</option>)}
        </select>
      </div>
      {canFrom && (
        <div className="opm-row"><span>{p.t.from}</span>
          <select className="opm-input" value={link.fromState ?? ""} onChange={(e) => p.onUpdateLink(link.id, { fromState: e.target.value || null })}>
            <option value="">{p.t.none}</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      {canTo && (
        <div className="opm-row"><span>{p.t.to}</span>
          <select className="opm-input" value={link.toState ?? ""} onChange={(e) => p.onUpdateLink(link.id, { toState: e.target.value || null })}>
            <option value="">{p.t.none}</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      {link.kind === "tagged" && (
        <div className="opm-row"><span>{p.t.tag}</span><Field value={link.tag ?? ""} onCommit={(v) => p.onUpdateLink(link.id, { tag: v })} /></div>
      )}
      <Reverse p={p} link={link} allowed={reverseAllowed} />
    </>
  );
}

function Reverse({ p, link, allowed }: { p: InspectorProps; link: EditorLink; allowed: boolean }) {
  if (!p.drawer) return null;
  return (
    <>
      <div className="opm-row readonly"><span>{p.t.source}</span><span>{label(p.model, link.from)}</span></div>
      <div className="opm-row readonly"><span>{p.t.target}</span><span>{label(p.model, link.to)}</span></div>
      {allowed && <button className="opm-button" onClick={() => p.onUpdateLink(link.id, { reverse: true })}>⇄ {p.t.reverse}</button>}
    </>
  );
}

export function Inspector(p: InspectorProps) {
  const cls = p.drawer ? "opm-drawer" : "opm-inspector";
  if (p.link) {
    return (
      <div className={cls} style={p.drawer ? undefined : p.style} onKeyDown={(e) => e.stopPropagation()}>
        <div className="opm-insp-head"><b>{p.t.link}</b>{p.drawer && <button className="link" onClick={p.onLess}>{p.t.less}</button>}</div>
        <LinkFields p={p} link={p.link} />
        {!p.drawer && <button className="link" onClick={p.onMore}>{p.t.more}</button>}
      </div>
    );
  }
  if (p.ids.length > 1) {
    return (
      <div className={cls} style={p.drawer ? undefined : p.style}>
        <div className="opm-insp-head"><b>{format(p.t.elements, { n: p.ids.length })}</b></div>
        <div className="opm-actions">
          <button className="opm-button" onClick={p.onDelete}>{p.t.delete}</button>
          <button className="opm-button" onClick={p.onCopy}>{p.t.copy}</button>
          <button className="opm-button" onClick={p.onSaveView}>{p.t.saveAsView}</button>
        </div>
      </div>
    );
  }
  const id = p.ids[0];
  const isObject = !!objects(p.model)[id];
  const def = objects(p.model)[id] ?? processes(p.model)[id];
  if (!def) return null;
  if (!p.drawer) {
    return (
      <div className={cls} style={p.style}>
        <div className="opm-insp-head"><b>{label(p.model, id)}</b></div>
        <div className="opm-id">{id}</div>
        {isObject && <StatePills p={p} id={id} editable={false} />}
        <div className="opm-actions">
          {!isObject && <button className="link" onClick={() => p.onOpenZoom(id)}>{p.t.openZoom}</button>}
          <button className="link" onClick={() => p.onShowJson(id)}>{p.t.showInJson}</button>
          <button className="link" onClick={p.onMore}>{p.t.more}</button>
        </div>
      </div>
    );
  }
  return (
    <div className={cls} onKeyDown={(e) => e.stopPropagation()}>
      <div className="opm-insp-head">
        <b>{label(p.model, id)}</b>
        <button className="link" onClick={p.onLess}>{p.t.less}</button>
      </div>
      <Section title={p.t.basic}>
        <div className="opm-row"><span>{p.t.id}</span><div className="opm-grow"><IdField id={id} onRename={p.onRename} t={p.t} /></div></div>
        <div className="opm-row"><span>{p.t.label}</span>
          <Field value={def.label ?? humanize(id)} onCommit={(v) => p.onUpdate(id, { label: !v || v === humanize(id) ? null : v })} /></div>
        <div className="opm-row"><span>{p.t.description}</span>
          <Field multiline value={def.description ?? ""} onCommit={(v) => p.onUpdate(id, { description: v || null })} /></div>
      </Section>
      {isObject && <Section title={p.t.states}><StatePills p={p} id={id} editable /></Section>}
      {isObject && <Section title={p.t.jsonSchema}><SchemaPicker p={p} id={id} /></Section>}
      <Classification p={p} id={id} />
      <div className="opm-actions">
        {!isObject && <button className="link" onClick={() => p.onOpenZoom(id)}>{p.t.openZoom}</button>}
        <button className="link" onClick={() => p.onShowJson(id)}>{p.t.showInJson}</button>
      </div>
    </div>
  );
}

/* ---------- link kind menu ---------- */

export interface LinkMenuProps {
  t: Messages;
  language: string;
  x: number;
  y: number;
  kinds: EditorLinkKind[];
  /** For an effect that starts at a state: the states it can change to. */
  effectTargets?: string[];
  onPick: (kind: EditorLinkKind, toState?: string) => void;
  onCancel: () => void;
}

export const LINK_SYMBOL: Record<EditorLinkKind, string> = {
  agent: "●", instrument: "○", consumption: "→", result: "→", effect: "↔", condition: "○c", event: "○e",
  invocation: "⌇→", aggregation: "▲", exhibition: "◭", generalization: "△", tagged: "⇢",
};

export function LinkMenu(p: LinkMenuProps) {
  const words = LINK_WORDS[p.language.toLowerCase().startsWith("pl") ? "pl" : "en"];
  const items: { kind: EditorLinkKind; toState?: string; text: string }[] = [];
  for (const k of p.kinds) {
    if (k === "effect" && p.effectTargets?.length) for (const s of p.effectTargets) items.push({ kind: k, toState: s, text: `${words[k]} → ${s}` });
    else items.push({ kind: k, text: words[k] ?? k });
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); p.onCancel(); }
      const n = Number(e.key);
      if (n >= 1 && n <= Math.min(9, items.length)) { e.preventDefault(); p.onPick(items[n - 1].kind, items[n - 1].toState); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  return (
    <div className="opm-linkmenu" style={{ left: p.x, top: p.y }}>
      <div className="opm-linkmenu-head">{p.t.chooseLinkKind}</div>
      {items.map((it, i) => (
        <button key={`${it.kind}-${it.toState ?? ""}`} onClick={() => p.onPick(it.kind, it.toState)}>
          <span className="opm-symbol">{LINK_SYMBOL[it.kind]}</span> {it.text} <span className="opm-dim">{i < 9 ? i + 1 : ""}</span>
        </button>
      ))}
      <div className="opm-dim opm-linkmenu-foot">{p.t.escCancel}</div>
    </div>
  );
}

/* ---------- toast and banners ---------- */

export function Toast({ text, error }: { text: string; error?: boolean }) {
  return <div className={`opm-toast${error ? " error" : ""}`} role="status">{text}</div>;
}
