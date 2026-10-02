import {
  Background, BackgroundVariant, ConnectionLineType, ConnectionMode, Edge, EdgeChange, FinalConnectionState, Node, NodeChange,
  ReactFlow, SelectionMode, Viewport, ViewportPortal, applyNodeChanges, getNodesBounds, useReactFlow, useViewport,
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { CSSProperties, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Operation } from "../core/edit";
import { fragmentOf } from "../core/edit";
import { EditorLinkKind, STATEFUL, allowedKinds, editorLinks, stateOwner, thingKind } from "../core/links";
import { Model, affiliation, essence, label, objects, processes } from "../core/model";
import { oplSentences } from "../core/opl";
import { ViewContent, ViewEdge, ViewInfo, ViewNode, listViews, viewContent, viewsContaining } from "../core/viewmodel";
import { LINK_WORDS, format, messages } from "../shared/i18n";
import { ElementDiagnostic, HostMessage, SchemaFile, UiDefaults } from "../shared/protocol";
import { EdgeData, edgeTypes } from "./edges";
import { Rect } from "./geometry";
import { Positions, Shapes, autoLayout, layoutKey, manualLayout, shapesOf, sizeOf, topLevel } from "./layout";
import { NodeData, ThingLabels, nodeTypes } from "./nodes";
import { ContextItem, ContextMenu, Inspector, InspectorProps, LinkMenu, OplBar, Toast, Toolbar, ZoomControls } from "./panels";
import { edit, post, saveTabState, settle, tabState } from "./vscode";

interface TabState {
  viewId: string;
  drawer: boolean;
  oplExpanded: boolean;
  oplMode: "view" | "selection";
  labelsOn: boolean;
  viewports: Record<string, Viewport>;
  drawerWidth?: number;
  oplHeight?: number;
}

interface MenuState {
  x: number;
  y: number;
  from: string;
  to: string;
  fromState?: string;
  toState?: string;
  kinds: EditorLinkKind[];
  effectTargets?: string[];
}

type Result = Awaited<ReturnType<typeof edit>>;

const LARGE_VIEW = 300;
const NONE = new Set<string>();
/**
 * Layers from the bottom, with React Flow's automatic z-index switched off: shapes of things (the container
 * at 0, the rest at 1), links at 2, link labels at 3 and the texts of things at 4 (the last two in styles.css).
 */
const THINGS_Z = 1;
const LINKS_Z = 2;
const DRAWER_WIDTH = 270;
const OPL_HEIGHT = 130;
const OPL_COLLAPSED = 32;

/** A bar between two panes; dragging it reports the pointer's travel since the drag started. */
function Splitter({ axis, onDrag, onReset }: { axis: "x" | "y"; onDrag: (delta: number, end: boolean) => void; onReset: () => void }) {
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

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

/** Link kinds for a drawn pair, with the states that the kinds can keep. */
function linkChoices(model: Model, from: string, to: string, fromState?: string, toState?: string) {
  const all = allowedKinds(model, from, to);
  let kinds = all.filter((k) => (!fromState || STATEFUL[k].from) && (!toState || STATEFUL[k].to));
  if (!kinds.length) {
    // no kind of this pair uses states (e.g. structure between objects): the states are dropped
    kinds = all;
    fromState = toState = undefined;
  }
  let effectTargets: string[] | undefined;
  if (fromState && kinds.includes("effect") && thingKind(model, from) === "object") {
    effectTargets = (objects(model)[from].states ?? []).filter((s) => s !== fromState);
    if (!effectTargets.length) kinds = kinds.filter((k) => k !== "effect");
  }
  return { kinds, fromState, toState, effectTargets };
}

/** The addLink operation for a kind picked from the menu; an effect is always stored from the object's side. */
function linkOperation(model: Model, m: MenuState, kind: EditorLinkKind, target?: string): Operation {
  if (kind === "effect") {
    const fromObject = thingKind(model, m.from) === "object";
    return fromObject
      ? { op: "addLink", kind, from: m.from, to: m.to, fromState: m.fromState, toState: target }
      : { op: "addLink", kind, from: m.to, to: m.from, toState: m.toState };
  }
  return {
    op: "addLink", kind, from: m.from, to: m.to,
    fromState: STATEFUL[kind].from ? m.fromState : undefined,
    toState: STATEFUL[kind].to ? m.toState : undefined,
  };
}

/** Rectangle of a node in flow coordinates. */
function rectOf(content: ViewContent, shapes: Shapes, positions: Positions, id: string): Rect | undefined {
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

function Zoom({ t }: { t: ReturnType<typeof messages> }) {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <ZoomControls t={t} zoom={zoom} onIn={() => flow.zoomIn({ duration: 120 })} onOut={() => flow.zoomOut({ duration: 120 })}
                  onFit={() => flow.fitView({ padding: 0.15, maxZoom: 1, duration: 200 })} />
  );
}

export function App() {
  const saved = useMemo(() => tabState<TabState>(), []);
  const [language, setLanguage] = useState("en");
  const t = useMemo(() => messages(language), [language]);
  const words = LINK_WORDS[language.toLowerCase().startsWith("pl") ? "pl" : "en"];
  const [model, setModel] = useState<Model | null>(null);
  const [parseError, setParseError] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<ElementDiagnostic[]>([]);
  const [schemas, setSchemas] = useState<SchemaFile[]>([]);
  const [viewId, setViewId] = useState(saved?.viewId ?? "system");
  const [selection, setSelection] = useState<string[]>([]);
  const [edgeSel, setEdgeSel] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(saved?.drawer ?? false);
  const [oplExpanded, setOplExpanded] = useState(saved?.oplExpanded ?? false);
  const [drawerWidth, setDrawerWidth] = useState(saved?.drawerWidth ?? DRAWER_WIDTH);
  const [oplHeight, setOplHeight] = useState(saved?.oplHeight ?? OPL_HEIGHT);
  const dragBase = useRef(0);
  const [oplMode, setOplMode] = useState<"view" | "selection">(saved?.oplMode ?? "view");
  const [labelsOn, setLabelsOn] = useState(saved?.labelsOn ?? false);
  const [editing, setEditing] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, string[]>>({});
  const [positions, setPositions] = useState<Positions>({});
  const [layingOut, setLayingOut] = useState(false);
  /** The view whose positions are final (not the interim placement while ELK runs). */
  const [settledView, setSettledView] = useState<string | null>(null);
  const [autoNonce, setAutoNonce] = useState(0);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ text: string; action: string; run: () => void } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  /** The open context menu, opened either on the pane or on the selection. */
  const [context, setContext] = useState<{ x: number; y: number; pos: [number, number]; on: "pane" | "selection" } | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; state?: string } | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [rebuild, setRebuild] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [reveal, setReveal] = useState<{ elementId?: string; viewId?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [initialized, setInitialized] = useState(!!saved);

  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  // Where the right button went down; a right click opens the context menu, a right drag pans.
  const rightDown = useRef<{ x: number; y: number } | null>(null);
  const boxSelecting = useRef(false);
  /** The last fragment copied here, for pasting from the menu when the clipboard cannot be read. */
  const copied = useRef<string | undefined>(undefined);
  const autoCache = useRef(new Map<string, Positions>());
  const viewports = useRef<Record<string, Viewport>>(saved?.viewports ?? {});
  const needsFit = useRef(true);
  const centerOn = useRef<string | null>(null);
  const pendingView = useRef<string | null>(null);
  const pendingEdge = useRef<{ kind: EditorLinkKind; from: string; to: string } | null>(null);
  const fresh = useRef(new Set<string>());
  const editingRef = useRef<string | null>(null);
  const fromHost = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const frozen = parseError !== null;
  const views = useMemo(() => (model ? listViews(model) : []), [model]);
  const view: ViewInfo | undefined = views.find((v) => v.id === viewId);
  const stored = model?.layout?.[viewId];
  const manual = !!stored;
  const storedKey = JSON.stringify(stored ?? null);

  /* ---------- messages from the extension ---------- */

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 6000 : 4000);
  }, []);

  const saveViewRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onMessage = (e: MessageEvent<HostMessage>) => {
      const m = e.data;
      switch (m.type) {
        case "init":
          setLanguage(m.language);
          document.body.dataset.theme = m.theme;
          if (!saved) {
            const d: UiDefaults = m.defaults ?? {};
            if (d.drawerOpen !== undefined) setDrawer(d.drawerOpen);
            if (d.oplExpanded !== undefined) setOplExpanded(d.oplExpanded);
            if (d.drawerWidth) setDrawerWidth(d.drawerWidth);
            if (d.oplHeight) setOplHeight(d.oplHeight);
            if (d.oplMode) setOplMode(d.oplMode);
            if (d.labelsOn !== undefined) setLabelsOn(d.labelsOn);
          }
          setInitialized(true);
          return;
        case "model":
          setModel(m.model);
          setParseError(null);
          return;
        case "parseError":
          setParseError(m.line);
          return;
        case "diagnostics":
          setDiagnostics(m.items);
          return;
        case "schemas":
          setSchemas(m.files);
          return;
        case "reveal":
          setReveal({ elementId: m.elementId, viewId: m.viewId });
          return;
        case "theme":
          document.body.dataset.theme = m.theme;
          return;
        case "result":
          settle(m);
          return;
        case "requestSaveView":
          saveViewRef.current();
          return;
      }
    };
    window.addEventListener("message", onMessage);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, [saved]);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- tab state and defaults ---------- */

  useEffect(() => {
    saveTabState({ viewId, drawer, oplExpanded, oplMode, labelsOn, viewports: viewports.current, drawerWidth, oplHeight } satisfies TabState);
  }, [viewId, drawer, oplExpanded, oplMode, labelsOn, drawerWidth, oplHeight]);

  useEffect(() => {
    if (initialized) post({ type: "defaults", defaults: { drawerOpen: drawer, oplExpanded, oplMode, labelsOn, drawerWidth, oplHeight } });
  }, [drawer, oplExpanded, oplMode, labelsOn, drawerWidth, oplHeight, initialized]);

  /* ---------- edits ---------- */

  const run = useCallback(async (op: Operation, opts: { quiet?: boolean } = {}): Promise<Result> => {
    const r = await edit(op);
    if (!r.ok && !opts.quiet) showToast(r.error ?? "Error", true);
    else if (r.ok && r.message && op.op !== "moveElements") showToast(r.message);
    return r;
  }, [showToast]);

  const goTo = useCallback((id: string) => {
    setViewId(id);
    setSelection([]);
    setEdgeSel(null);
    setMenu(null);
    needsFit.current = true;
  }, []);

  /* ---------- the view ---------- */

  // a view that disappeared (deleted process, renamed view) falls back to the system diagram
  useEffect(() => {
    if (!model) return;
    if (view) {
      if (pendingView.current === view.id) pendingView.current = null;
      return;
    }
    if (pendingView.current !== viewId) goTo("system");
  }, [model, view, viewId, goTo]);

  const content = useMemo<ViewContent | undefined>(() => {
    if (!model || !view) return undefined;
    const c = viewContent(model, view.id)!;
    const add = (extra[view.id] ?? []).filter((id) => (objects(model)[id] || processes(model)[id]) && !c.nodes.some((n) => n.id === id));
    if (!add.length) return c;
    return { ...c, nodes: [...c.nodes, ...add.map((id): ViewNode => ({ id, kind: objects(model)[id] ? "object" : "process" }))] };
  }, [model, view, extra]);

  const shapes = useMemo(() => (model && content ? shapesOf(model, content) : undefined), [model, content]);
  const key = content && shapes ? layoutKey(content, shapes) : "";

  const visibleCenter = useCallback((): { x: number; y: number } => {
    const r = wrapper.current?.getBoundingClientRect();
    if (!r) return { x: 40, y: 40 };
    const p = flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return { x: Math.round(p.x - 60), y: Math.round(p.y - 25) };
  }, [flow]);

  useEffect(() => {
    if (!content || !shapes) return;
    const vid = content.view.id;
    if (stored) {
      setLayingOut(false);
      setPositions(manualLayout(content, shapes, stored, visibleCenter()));
      setSettledView(vid);
      return;
    }
    const cached = autoCache.current.get(key);
    if (cached) {
      setLayingOut(false);
      setPositions(cached);
      setSettledView(vid);
      return;
    }
    // until ELK answers, things keep their places and new ones get a free spot
    setPositions((prev) => manualLayout(content, shapes, prev, visibleCenter()));
    setLayingOut(true);
    let cancelled = false;
    void autoLayout(content, shapes).then((p) => {
      if (cancelled) return;
      autoCache.current.set(key, p);
      setPositions(p);
      setLayingOut(false);
      setSettledView(vid);
    });
    return () => { cancelled = true; };
    // content and shapes are covered by the layout key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storedKey, autoNonce]);

  // an external change keeps the selection of the things that still exist
  useEffect(() => {
    if (!model || !content) return;
    const shown = new Set(content.nodes.map((n) => n.id));
    setSelection((s) => (s.every((id) => shown.has(id)) ? s : s.filter((id) => shown.has(id))));
    if (pendingEdge.current) {
      const p = pendingEdge.current;
      const e = content.edges.find((x) => x.link.kind === p.kind && ((x.link.from === p.from && x.link.to === p.to) || (x.link.from === p.to && x.link.to === p.from)));
      pendingEdge.current = null;
      setEdgeSel(e?.id ?? null);
    } else setEdgeSel((id) => (id && content.edges.some((e) => e.id === id) ? id : null));
  }, [model, content]);

  /* ---------- reveal from the tree, Problems or the text cursor ---------- */

  useEffect(() => {
    if (!reveal || !model) return;
    setReveal(null);
    if (reveal.viewId && views.some((v) => v.id === reveal.viewId)) {
      if (reveal.viewId !== viewId) goTo(reveal.viewId);
    }
    const id = reveal.elementId;
    if (!id || !(objects(model)[id] || processes(model)[id])) return;
    const target = reveal.viewId ?? viewsContaining(model, id, viewId)[0];
    if (!target) return;
    if (target !== viewId) goTo(target);
    fromHost.current = true;
    setSelection([id]);
    setEdgeSel(null);
    centerOn.current = id;
  }, [reveal, model, views, viewId, goTo]);

  /* ---------- nodes and edges ---------- */

  const diagBy = useMemo(() => {
    const out = new Map<string, { severity: "error" | "warning"; messages: string[] }>();
    for (const d of diagnostics) {
      if (!d.element || d.severity === "info") continue;
      const cur = out.get(d.element);
      if (!cur) out.set(d.element, { severity: d.severity, messages: [d.message] });
      else {
        cur.messages.push(d.message);
        if (d.severity === "error") cur.severity = "error";
      }
    }
    return out;
  }, [diagnostics]);

  const selectedEdge: ViewEdge | undefined = content?.edges.find((e) => e.id === edgeSel);

  const related = useMemo(() => {
    if (!content || exporting || (!selection.length && !selectedEdge)) return null;
    const set = new Set(selection);
    for (const e of content.edges) {
      if (selection.includes(e.source) || selection.includes(e.target) || e.id === edgeSel) set.add(e.source).add(e.target);
    }
    return set;
  }, [content, selection, selectedEdge, edgeSel, exporting]);

  const canLink = useCallback((id: string): boolean => {
    if (!model || !connecting || id === connecting.from) return false;
    return linkChoices(model, connecting.from, id, connecting.state).kinds.length > 0;
  }, [model, connecting]);

  const onLabel = useCallback((id: string, value: string | null) => {
    if (editingRef.current !== id) return;
    editingRef.current = null;
    setEditing(null);
    if (!model) return;
    const isFresh = fresh.current.has(id);
    fresh.current.delete(id);
    if (value === null || (value === label(model, id) && !isFresh)) return;
    void run({ op: "setLabel", id, label: value, deriveId: isFresh }).then((r) => {
      if (r.ok && r.select?.length) setSelection(r.select);
    });
  }, [model, run]);

  const startEdit = useCallback((id: string) => {
    if (frozen) return;
    editingRef.current = id;
    setEditing(id);
  }, [frozen]);

  const openZoom = useCallback(async (id: string) => {
    if (!model || !processes(model)[id]) return;
    if (processes(model)[id].zoomsInto === undefined) {
      if (frozen) return;
      pendingView.current = id;
      const r = await run({ op: "openZoom", process: id });
      if (!r.ok) { pendingView.current = null; return; }
    }
    goTo(id);
  }, [model, frozen, run, goTo]);

  const baseNodes = useMemo<Node[]>(() => {
    if (!model || !content || !shapes) return [];
    const out: Node[] = [];
    const ordered = [...content.nodes].sort((a, b) => Number(!!b.container) - Number(!!a.container));
    for (const n of ordered) {
      const def = objects(model)[n.id] ?? processes(model)[n.id];
      if (!def) continue;
      const diag = diagBy.get(n.id);
      const data: NodeData = {
        id: n.id,
        label: label(model, n.id),
        w: 0, h: 0,
        environmental: affiliation(def) === "environmental",
        physical: essence(def) === "physical",
        severity: diag?.severity,
        tooltip: diag?.messages.join("\n"),
        dimmed: !!related && !n.container && !related.has(n.id),
        target: connecting && n.id !== connecting.from ? canLink(n.id) : undefined,
        editing: editing === n.id,
        onLabel, onStartEdit: startEdit, onOpenZoom: (id: string) => void openZoom(id),
      };
      const selected = selection.includes(n.id);
      const common = { id: n.id, selected, draggable: !frozen, connectable: !frozen };
      if (n.kind === "object") {
        const s = shapes.objects[n.id];
        const p = positions[n.id] ?? [40, 40];
        data.w = s.w; data.h = s.h;
        data.module = objects(model)[n.id].role === "module";
        data.states = objects(model)[n.id].states ?? [];
        data.stateRects = s.states;
        if (connecting && canLink(n.id) && thingKind(model, connecting.from) === "process") data.highlightStates = data.states;
        out.push({ ...common, type: "object", position: { x: p[0], y: p[1] }, width: s.w, height: s.h, data, zIndex: THINGS_Z });
      } else if (n.container) {
        const s = shapes.container!.shape;
        const p = positions[n.id] ?? [40, 40];
        data.w = s.w; data.h = s.h;
        data.empty = !(processes(model)[n.id].zoomsInto ?? []).length;
        data.emptyHint = t.subprocessesHint;
        out.push({ ...common, type: "container", position: { x: p[0], y: p[1] }, width: s.w, height: s.h, data, zIndex: 0 });
      } else if (n.inside) {
        const r = shapes.container!.shape.inner[n.id];
        data.w = r.w; data.h = r.h;
        data.hasZoom = processes(model)[n.id].zoomsInto !== undefined;
        out.push({ ...common, type: "process", parentId: n.inside, position: { x: r.x, y: r.y }, width: r.w, height: r.h, data });
      } else {
        const s = shapes.processes[n.id];
        const p = positions[n.id] ?? [40, 40];
        data.w = s.w; data.h = s.h;
        data.hasZoom = processes(model)[n.id].zoomsInto !== undefined;
        out.push({ ...common, type: "process", position: { x: p[0], y: p[1] }, width: s.w, height: s.h, data, zIndex: THINGS_Z });
      }
    }
    return out;
  }, [model, content, shapes, positions, diagBy, related, connecting, canLink, editing, selection, frozen, onLabel, startEdit, openZoom, t]);

  useEffect(() => setNodes(baseNodes), [baseNodes, rebuild]);

  const edges = useMemo<Edge[]>(() => {
    if (!content || !model) return [];
    const groups = new Map<string, ViewEdge[]>();
    const pair = (e: ViewEdge) => [e.source, e.target].sort().join("|");
    for (const e of content.edges) groups.set(pair(e), [...(groups.get(pair(e)) ?? []), e]);
    return content.edges.map((e) => {
      const g = groups.get(pair(e))!;
      const i = g.indexOf(e);
      let offset = (i - (g.length - 1) / 2) * 16;
      // the offset is perpendicular to the drawn direction, so opposite directions flip it
      if (e.source > e.target) offset = -offset;
      const touches = !related || selection.includes(e.source) || selection.includes(e.target) || e.id === edgeSel;
      const data: EdgeData = {
        kind: e.link.kind,
        fromState: e.link.fromState,
        toState: e.link.toState,
        stateEnd: e.link.kind === "result" ? "target" : "source",
        word: words[e.link.kind] ?? e.link.kind,
        tag: e.link.tag,
        labelsOn,
        dimmed: !touches,
        offset,
      };
      const zIndex = LINKS_Z;
      return { id: e.id, source: e.source, target: e.target, type: "opm", selected: e.id === edgeSel, data, zIndex, selectable: true, focusable: false };
    });
  }, [content, model, related, selection, edgeSel, labelsOn, words]);

  /* ---------- fitting and centering ---------- */

  useEffect(() => {
    if (!nodes.length || layingOut || settledView !== viewId) return;
    if (needsFit.current) {
      needsFit.current = false;
      const vp = viewports.current[viewId];
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (vp) void flow.setViewport(vp);
        else void flow.fitView({ padding: 0.15, maxZoom: 1 });
      }));
    }
    if (centerOn.current && content && shapes) {
      const r = rectOf(content, shapes, positions, centerOn.current);
      centerOn.current = null;
      if (r) requestAnimationFrame(() => void flow.setCenter(r.x + r.w / 2, r.y + r.h / 2, { zoom: flow.getZoom(), duration: 200 }));
    }
  }, [nodes, layingOut, settledView, flow, viewId, content, shapes, positions]);

  // the diagram selection moves the cursor in a visible text editor of the same file
  useEffect(() => {
    if (fromHost.current) { fromHost.current = false; return; }
    if (selection.length === 1) post({ type: "revealInText", id: selection[0], open: false });
  }, [selection]);

  /* ---------- React Flow events ---------- */

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const rest = changes.filter((c) => c.type !== "select" && c.type !== "remove");
    if (rest.length) setNodes((ns) => applyNodeChanges(rest, ns));
    const sel = changes.filter((c): c is Extract<NodeChange, { type: "select" }> => c.type === "select");
    if (!sel.length) return;
    setSelection((prev) => {
      const s = new Set(prev);
      for (const c of sel) (c.selected ? s.add(c.id) : s.delete(c.id));
      const next = [...s];
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
    if (sel.some((c) => c.selected)) setEdgeSel(null);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // links stay unselected while a selection rectangle is drawn
    if (boxSelecting.current) return;
    for (const c of changes) {
      if (c.type !== "select") continue;
      if (c.selected) { setEdgeSel(c.id); setSelection([]); }
      else setEdgeSel((cur) => (cur === c.id ? null : cur));
    }
  }, []);

  const onNodeDragStop = useCallback((_e: unknown, _node: Node, dragged: Node[]) => {
    if (!model || !content || !shapes || frozen) return;
    const top = dragged.filter((n) => !n.parentId);
    const subs = dragged.filter((n) => n.parentId);
    if (subs.length === 1 && !top.length) {
      // a vertical drag of a subprocess changes its place in the order of execution
      const n = subs[0];
      const parent = n.parentId!;
      const order = processes(model)[parent]?.zoomsInto ?? [];
      const inner = shapes.container?.shape.inner ?? {};
      const cy = n.position.y + (n.height ?? inner[n.id]?.h ?? 0) / 2;
      const others = order.filter((id) => id !== n.id);
      const index = others.filter((id) => inner[id] && inner[id].y + inner[id].h / 2 < cy).length;
      if (index !== order.indexOf(n.id)) void run({ op: "reorderSubprocess", parent, id: n.id, index });
      setRebuild((x) => x + 1);
      return;
    }
    if (!top.length) { setRebuild((x) => x + 1); return; }
    const moved: Positions = {};
    for (const n of top) {
      const p: [number, number] = [Math.round(n.position.x), Math.round(n.position.y)];
      const before = positions[n.id];
      if (!before || before[0] !== p[0] || before[1] !== p[1]) moved[n.id] = p;
    }
    if (!Object.keys(moved).length) return;
    setPositions((p) => ({ ...p, ...moved }));
    if (manual) void run({ op: "moveElements", viewId, positions: moved });
    else {
      const all = Object.fromEntries(topLevel(content).filter((id) => positions[id]).map((id) => [id, positions[id]]));
      void run({ op: "moveElements", viewId, positions: moved, all }).then((r) => {
        if (r.ok) showToast(`${format(t.switchedToManual, { view: view?.code ?? viewId })} · ${t.undoHint}`);
      });
    }
  }, [model, content, shapes, frozen, positions, manual, viewId, run, showToast, t, view]);

  const onConnectStart = useCallback((_e: unknown, p: { nodeId: string | null; handleId: string | null }) => {
    if (!p.nodeId || frozen) return;
    setMenu(null);
    setConnecting({ from: p.nodeId, state: p.handleId?.startsWith("state:") ? p.handleId.slice(6) : undefined });
  }, [frozen]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, cs: FinalConnectionState) => {
    const start = connecting;
    setConnecting(null);
    if (!start || !model) return;
    const pt = "changedTouches" in event ? event.changedTouches[0] : event;
    const el = document.elementFromPoint(pt.clientX, pt.clientY);
    const to = el?.closest("[data-thing]")?.getAttribute("data-thing") ?? cs.toNode?.id;
    if (!to || to === start.from) return;
    const handle = el?.closest("[data-handleid]")?.getAttribute("data-handleid");
    const pill = el?.closest("[data-state]")?.getAttribute("data-state");
    const toState = handle?.startsWith("state:") ? handle.slice(6) : pill ?? undefined;
    const choice = linkChoices(model, start.from, to, start.state, thingKind(model, to) === "object" ? toState : undefined);
    if (!choice.kinds.length) return;
    const box = wrapper.current!.getBoundingClientRect();
    const m: MenuState = { x: pt.clientX - box.left, y: pt.clientY - box.top, from: start.from, to, ...choice };
    const items = choice.kinds.flatMap((k) => (k === "effect" && choice.effectTargets?.length ? choice.effectTargets : [k]));
    if (items.length === 1) {
      const kind = choice.kinds[0];
      void run(linkOperation(model, m, kind, kind === "effect" ? choice.effectTargets?.[0] : undefined));
    } else setMenu(m);
  }, [connecting, model, run]);

  /* ---------- actions ---------- */

  const zoomProcess = view && (view.kind === "zoom" || (view.kind === "custom" && view.process)) ? view.process : undefined;

  const freeSpot = useCallback((w: number, h: number, at?: [number, number]): [number, number] => {
    const c = at ? { x: at[0], y: at[1] } : visibleCenter();
    const rects = content && shapes ? topLevel(content).map((id) => rectOf(content, shapes, positions, id)).filter((r): r is Rect => !!r) : [];
    let x = c.x, y = c.y;
    const overlaps = () => rects.some((r) => x < r.x + r.w + 20 && x + w + 20 > r.x && y < r.y + r.h + 20 && y + h + 20 > r.y);
    for (let i = 0; i < 200 && overlaps(); i++) y += 30;
    return [Math.round(x), Math.round(y)];
  }, [content, shapes, positions, visibleCenter]);

  const addElement = useCallback(async (kind: "object" | "process", at?: [number, number]) => {
    if (frozen || !model) return;
    const parentId = kind === "process" ? zoomProcess : undefined;
    const pos = manual && !parentId ? freeSpot(kind === "object" ? 120 : 220, kind === "object" ? 50 : 84, at) : undefined;
    const r = await run({ op: "addElement", kind, viewId, pos, parentId });
    const id = r.ok ? r.select?.[0] : undefined;
    if (!id) return;
    fresh.current.add(id);
    if (zoomProcess && !parentId) setExtra((x) => ({ ...x, [viewId]: [...(x[viewId] ?? []), id] }));
    setSelection([id]);
    setEdgeSel(null);
    editingRef.current = id;
    setEditing(id);
  }, [frozen, model, zoomProcess, manual, freeSpot, run, viewId]);

  const selectedObject = selection.length === 1 && model && objects(model)[selection[0]] ? selection[0] : undefined;

  const addState = useCallback((object?: string, state?: string) => {
    const id = object ?? selectedObject;
    if (!id || frozen) return;
    void run({ op: "addState", object: id, state });
  }, [selectedObject, frozen, run]);

  const deleteSelection = useCallback(() => {
    if (frozen || (!selection.length && !selectedEdge)) return;
    void run({ op: "deleteElements", ids: selection, links: selectedEdge ? [selectedEdge.link.id] : [] });
    setSelection([]);
    setEdgeSel(null);
  }, [frozen, selection, selectedEdge, run]);

  const levelUp = useCallback(() => {
    if (!view || view.kind === "system") return;
    goTo(view.kind === "zoom" ? view.parent ?? "system" : "system");
  }, [view, goTo]);

  const copyText = useCallback((): string | undefined => {
    if (!model || !selection.length) return undefined;
    return JSON.stringify(fragmentOf(model, selection, positions), null, 2);
  }, [model, selection, positions]);

  /** Pastes a copied fragment; with `at`, its top-left corner lands there. */
  const paste = useCallback(async (text: string, at?: [number, number]) => {
    if (frozen) return;
    let fragment: unknown;
    try { fragment = JSON.parse(text); } catch { return; }
    if (!fragment || typeof fragment !== "object") return;
    const f = fragment as { objects?: unknown; processes?: unknown; positions?: Record<string, [number, number]> };
    if (!f.objects && !f.processes) return;
    const corners = Object.values(f.positions ?? {});
    const offset: [number, number] | undefined = at && corners.length
      ? [at[0] - Math.min(...corners.map((c) => c[0])), at[1] - Math.min(...corners.map((c) => c[1]))] : undefined;
    const r = await run({ op: "paste", fragment: { objects: f.objects as never, processes: f.processes as never, positions: f.positions as never }, viewId, parentId: zoomProcess, offset });
    if (r.ok && r.select?.length) {
      if (zoomProcess) setExtra((x) => ({ ...x, [viewId]: [...(x[viewId] ?? []), ...r.select!] }));
      setSelection(r.select);
    }
  }, [frozen, run, viewId, zoomProcess]);

  const saveView = useCallback(() => {
    if (!selection.length) return;
    const pos = manual ? Object.fromEntries(selection.filter((id) => positions[id]).map((id) => [id, positions[id]])) : undefined;
    post({ type: "saveViewFromSelection", ids: selection, positions: pos });
  }, [selection, manual, positions]);
  saveViewRef.current = saveView;

  // the menu writes and reads the clipboard itself; the keyboard goes through the copy, cut and paste events
  const copySelection = useCallback(() => {
    const text = copyText();
    if (!text) return;
    copied.current = text;
    void navigator.clipboard?.writeText(text);
  }, [copyText]);
  const pasteFromMenu = useCallback(async (at?: [number, number]) => {
    const text = await navigator.clipboard?.readText().catch(() => undefined);
    await paste(text || copied.current || "", at);
  }, [paste]);

  const autoLayoutNow = useCallback(async () => {
    if (!content || !shapes) return;
    if (!manual) {
      autoCache.current.delete(key);
      setAutoNonce((n) => n + 1);
      return;
    }
    if (frozen) return;
    setLayingOut(true);
    const p = await autoLayout(content, shapes);
    setLayingOut(false);
    void run({ op: "setLayout", viewId, positions: p });
  }, [content, shapes, manual, key, frozen, run, viewId]);

  const exportImage = useCallback(async (kind: "png" | "svg") => {
    const el = wrapper.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el || !nodes.length) return;
    setExporting(true);
    setEditing(null);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const b = getNodesBounds(flow.getNodes());
      const pad = 40;
      const width = Math.ceil(b.width + 2 * pad), height = Math.ceil(b.height + 2 * pad);
      const style = { width: `${width}px`, height: `${height}px`, transform: `translate(${pad - b.x}px, ${pad - b.y}px) scale(1)` };
      const backgroundColor = getComputedStyle(document.body).getPropertyValue("--vscode-editor-background").trim() || undefined;
      const filter = (n: HTMLElement) => !n.classList?.contains("opm-selection") && !n.classList?.contains("react-flow__handle");
      const options = { width, height, style, backgroundColor, filter, skipFonts: true };
      if (kind === "png") post({ type: "export", format: "png", viewId, data: await toPng(el, { ...options, pixelRatio: 2 }) });
      else {
        const url = await toSvg(el, options);
        post({ type: "export", format: "svg", viewId, data: decodeURIComponent(url.slice(url.indexOf(",") + 1)) });
      }
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setExporting(false);
    }
  }, [nodes, flow, viewId, showToast]);

  /* ---------- keyboard and clipboard ---------- */

  const onKey = (e: KeyboardEvent) => {
    if (confirm && e.key === "Escape") { setConfirm(null); return; }
    if (isEditable(e.target) || menu || confirm) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (k === "Escape") {
      setSelection([]); setEdgeSel(null); setContext(null);
      return;
    }
    if (ctrl) {
      if (k.toLowerCase() === "a" && content) { e.preventDefault(); setSelection(content.nodes.filter((n) => !n.container).map((n) => n.id)); setEdgeSel(null); }
      else if (k === "0") { e.preventDefault(); void flow.fitView({ padding: 0.15, maxZoom: 1, duration: 200 }); }
      else if (k === "=" || k === "+") { e.preventDefault(); void flow.zoomIn({ duration: 120 }); }
      else if (k === "-") { e.preventDefault(); void flow.zoomOut({ duration: 120 }); }
      return;
    }
    if (e.altKey) return;
    if (k === "Delete" || (k === "Backspace" && (selection.length || selectedEdge))) { e.preventDefault(); deleteSelection(); }
    else if (k === "Backspace") { e.preventDefault(); levelUp(); }
    else if (k === "F2" && selection.length === 1) {
      e.preventDefault();
      setDrawer(true);
      window.setTimeout(() => (document.getElementById("opm-id-field") as HTMLInputElement | null)?.select(), 60);
    } else if (k === "Enter" && selection.length === 1 && model && processes(model)[selection[0]] && selection[0] !== zoomProcess) {
      e.preventDefault(); void openZoom(selection[0]);
    } else if (k === "o" || k === "O") { e.preventDefault(); void addElement("object"); }
    else if (k === "p" || k === "P") { e.preventDefault(); void addElement("process"); }
    else if ((k === "s" || k === "S") && selectedObject) { e.preventDefault(); addState(); }
  };
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  const copyRef = useRef(copyText);
  copyRef.current = copyText;
  const pasteRef = useRef(paste);
  pasteRef.current = paste;
  const deleteRef = useRef(deleteSelection);
  deleteRef.current = deleteSelection;

  useEffect(() => {
    const key = (e: KeyboardEvent) => keyRef.current(e);
    const copy = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const text = copyRef.current();
      if (!text || !e.clipboardData) return;
      copied.current = text;
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
    };
    const cut = (e: ClipboardEvent) => {
      copy(e);
      if (e.defaultPrevented) deleteRef.current();
    };
    const pasteEvent = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text) { e.preventDefault(); void pasteRef.current(text); }
    };
    window.addEventListener("keydown", key);
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cut);
    document.addEventListener("paste", pasteEvent);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cut);
      document.removeEventListener("paste", pasteEvent);
    };
  }, []);

  /* ---------- OPL ---------- */

  const sentences = useMemo(() => (model ? oplSentences(model) : []), [model]);
  const shownIds = useMemo(() => new Set(content?.nodes.map((n) => n.id) ?? []), [content]);
  const focus = useMemo(() => {
    if (selection.length) return new Set(selection);
    if (selectedEdge) return new Set([selectedEdge.link.from, selectedEdge.link.to]);
    return new Set<string>();
  }, [selection, selectedEdge]);
  const viewSentences = useMemo(() => sentences.filter((s) => s.refs.length && s.refs.every((r) => shownIds.has(r))), [sentences, shownIds]);
  const focusSentences = useMemo(() => {
    if (selectedEdge && !selection.length) return sentences.filter((s) => focus.size && [...focus].every((id) => s.refs.includes(id)));
    return sentences.filter((s) => s.refs.some((r) => focus.has(r)));
  }, [sentences, focus, selectedEdge, selection]);
  const useFocus = focus.size > 0 && (!oplExpanded || oplMode === "selection");

  /* ---------- inspector ---------- */

  const confirmDeleteState = useCallback((object: string, state: string) => {
    if (!model) return;
    const used = editorLinks(model).filter((l) => stateOwner(l) === object && (l.fromState === state || l.toState === state)).length;
    const del = () => void run({ op: "deleteState", object, state });
    if (!used) return del();
    setConfirm({ text: format(t.confirmDeleteState, { state, n: used }), action: t.delete, run: del });
  }, [model, run, t]);

  const inspectorProps: InspectorProps | undefined = model ? {
    t, language, model, schemas,
    ids: selection,
    link: selection.length ? undefined : selectedEdge?.link,
    onLess: () => setDrawer(false),
    onShowJson: (id) => post({ type: "revealInText", id, open: true }),
    onOpenZoom: (id) => void openZoom(id),
    onUpdate: (id, patch) => void run({ op: "updateElement", id, patch }),
    onRename: async (oldId, newId) => {
      const r = await run({ op: "renameId", oldId, newId }, { quiet: true });
      if (!r.ok) return r.error;
      fresh.current.delete(oldId);
      setSelection([newId]);
      return undefined;
    },
    onAddState: (id, state) => addState(id, state),
    onRenameState: (id, oldState, newState) => void run({ op: "renameState", object: id, oldState, newState }),
    onDeleteState: confirmDeleteState,
    onMoveState: (id, state, index) => void run({ op: "moveState", object: id, state, index }),
    onUpdateLink: (id, patch) => {
      const l = selectedEdge?.link;
      if (l) pendingEdge.current = { kind: patch.kind ?? l.kind, from: l.from, to: l.to };
      void run({ op: "updateLink", id, ...patch });
    },
    onOpenLink: (href) => post({ type: "openLink", href }),
    onDelete: deleteSelection,
    onCopy: () => { const text = copyText(); if (text) void navigator.clipboard?.writeText(text); },
    onSaveView: saveView,
  } : undefined;

  const hasSelection = selection.length > 0 || !!selectedEdge;

  const trail = useMemo(() => {
    if (!view) return [];
    const out: ViewInfo[] = [view];
    let cur = view;
    for (let i = 0; i < 20 && cur.kind === "zoom" && cur.parent; i++) {
      const parent = views.find((v) => v.id === cur.parent);
      if (!parent) break;
      out.unshift(parent);
      cur = parent;
    }
    if (out[0].kind !== "system") out.unshift(views[0]);
    return out;
  }, [view, views]);

  const empty = !!model && !Object.keys(objects(model)).length && !Object.keys(processes(model)).length;

  /* ---------- context menu ---------- */

  // one menu for the right button: on a thing or a link it acts on the selection, on the pane it adds things
  const openContext = (e: ReactMouseEvent) => {
    const el = e.target as HTMLElement;
    if (isEditable(el)) return;
    e.preventDefault();
    const down = rightDown.current;
    rightDown.current = null;
    if (el.closest(".opm-context") || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4)) return;
    const nodeId = el.closest(".react-flow__node")?.getAttribute("data-id");
    const edgeId = el.closest("[data-edge]")?.getAttribute("data-edge");
    let on: "pane" | "selection";
    if (nodeId) {
      if (!selection.includes(nodeId)) { setSelection([nodeId]); setEdgeSel(null); }
      on = "selection";
    } else if (edgeId) {
      setEdgeSel(edgeId); setSelection([]);
      on = "selection";
    } else if (el.classList.contains("react-flow__pane")) {
      if (frozen) return;
      on = "pane";
    } else return;
    const box = wrapper.current!.getBoundingClientRect();
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setContext({ x: e.clientX - box.left, y: e.clientY - box.top, pos: [Math.round(p.x), Math.round(p.y)], on });
  };
  const closeContext = useCallback(() => setContext(null), []);

  const contextMenu = ((): { title?: string; subtitle?: string; items: ContextItem[] } | undefined => {
    if (!context || !model) return undefined;
    const properties: ContextItem = { label: t.properties, keys: "F2", action: () => setDrawer(true) };
    const paste: ContextItem = { label: t.paste, keys: "Ctrl+V", action: () => void pasteFromMenu(context.on === "pane" ? context.pos : undefined), disabled: frozen };
    if (context.on === "pane") {
      return { items: [
        { label: `▭ ${t.object}`, keys: "O", action: () => void addElement("object", context.pos) },
        { label: `◯ ${t.process}`, keys: "P", action: () => void addElement("process", context.pos) },
        "-", paste,
      ] };
    }
    const edit: ContextItem[] = [
      { label: t.cut, keys: "Ctrl+X", action: () => { copySelection(); deleteSelection(); }, disabled: frozen || !selection.length },
      { label: t.copy, keys: "Ctrl+C", action: copySelection, disabled: !selection.length },
      paste,
      { label: t.delete, keys: "Del", action: deleteSelection, disabled: frozen },
    ];
    if (selection.length > 1) {
      return { title: format(t.elements, { n: selection.length }), items: [...edit, "-", { label: t.saveAsView, action: saveView }] };
    }
    if (selection.length === 1) {
      const id = selection[0];
      const isProcess = !!processes(model)[id];
      return { title: label(model, id), subtitle: id, items: [
        ...(isProcess && id !== zoomProcess ? [{ label: t.openZoom, keys: "Enter", action: () => void openZoom(id) }] : []),
        ...(isProcess ? [] : [{ label: t.newState, keys: "S", action: () => addState(id), disabled: frozen }]),
        { label: t.rename, action: () => startEdit(id), disabled: frozen },
        "-", ...edit,
        "-", { label: t.showInJson, action: () => post({ type: "revealInText", id, open: true }) }, properties,
      ] };
    }
    const l = selectedEdge?.link;
    if (!l) return undefined;
    const canReverse = allowedKinds(model, l.to, l.from).includes(l.kind);
    return { title: words[l.kind] ?? l.kind, subtitle: `${label(model, l.from)} → ${label(model, l.to)}`, items: [
      ...(canReverse ? [{ label: `⇄ ${t.reverse}`, action: () => void run({ op: "updateLink", id: l.id, reverse: true }), disabled: frozen }] : []),
      { label: t.delete, keys: "Del", action: deleteSelection, disabled: frozen },
      "-", { label: t.properties, action: () => setDrawer(true) },
    ] };
  })();

  /* ---------- render ---------- */

  return (
    <div className={`opm-app${drawer && hasSelection ? " with-drawer" : ""}`}>
      <div className="opm-canvas" ref={wrapper}
           style={{ "--opl-h": `${oplExpanded ? oplHeight : OPL_COLLAPSED}px` } as CSSProperties}
           onPointerDownCapture={(e) => {
             if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY };
             if (!(e.target as HTMLElement).closest(".opm-context")) setContext(null);
           }}
           onContextMenu={openContext}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onPaneClick={() => { setMenu(null); setContext(null); }}
          onMoveEnd={(_e, vp) => {
            viewports.current = { ...viewports.current, [viewId]: vp };
            saveTabState({ viewId, drawer, oplExpanded, oplMode, labelsOn, viewports: viewports.current, drawerWidth, oplHeight } satisfies TabState);
          }}
          zIndexMode="manual"
          connectionMode={ConnectionMode.Loose}
          connectionLineType={ConnectionLineType.Straight}
          connectionLineStyle={{ strokeDasharray: "5 4" }}
          connectOnClick={false}
          nodesConnectable={!frozen}
          nodesDraggable={!frozen}
          deleteKeyCode={null}
          disableKeyboardA11y
          zoomOnDoubleClick={false}
          panOnDrag={[1, 2]}
          selectionOnDrag
          selectionMode={SelectionMode.Full}
          onSelectionStart={() => { boxSelecting.current = true; }}
          onSelectionEnd={() => { boxSelecting.current = false; }}
          minZoom={0.1}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opm-grid" />
          <ViewportPortal><ThingLabels nodes={nodes} /></ViewportPortal>
        </ReactFlow>

        {view && (
          <Toolbar
            t={t}
            trail={trail}
            disabled={frozen}
            onView={(id) => id !== viewId && goTo(id)}
            onAddObject={() => void addElement("object")}
            onAddProcess={() => void addElement("process")}
            onAddState={selectedObject ? () => addState() : undefined}
            manual={manual}
            onAutoLayout={() => void autoLayoutNow()}
            onResetLayout={() => void run({ op: "setLayout", viewId, positions: null })}
            menu={[
              { label: t.exportPng, action: () => void exportImage("png") },
              { label: t.exportSvg, action: () => void exportImage("svg") },
              { label: t.exportMarkdown, action: () => post({ type: "exportMarkdown" }) },
              { label: t.saveAsView, action: saveView, disabled: !selection.length },
              { label: t.linkLabels, action: () => setLabelsOn(!labelsOn), checked: labelsOn },
              { label: t.openTextBeside, action: () => post({ type: "openTextBeside" }) },
            ]}
          />
        )}

        {layingOut && <div className="opm-busy">ELK…</div>}

        {parseError !== null && (
          <div className="opm-banner error">
            {format(t.parseErrorBanner, { line: parseError })}
            <button className="link" onClick={() => post({ type: "openTextBeside" })}>{t.openTextBeside}</button>
          </div>
        )}
        {content && content.nodes.length > LARGE_VIEW && (
          <div className="opm-banner">{format(t.largeView, { n: content.nodes.length })}</div>
        )}

        {empty && !frozen && (
          <div className="opm-empty">
            <div>{t.emptyHint}</div>
            <div className="opm-actions">
              <button className="opm-button primary" onClick={() => void addElement("object")}>▭ {t.object}</button>
              <button className="opm-button primary" onClick={() => void addElement("process")}>◯ {t.process}</button>
            </div>
          </div>
        )}

        {menu && model && (
          <LinkMenu
            t={t}
            language={language}
            x={Math.min(menu.x, size.w - 220)}
            y={Math.min(menu.y, size.h - 40 - 28 * (menu.kinds.length + 2))}
            kinds={menu.kinds}
            effectTargets={menu.effectTargets}
            onPick={(kind, target) => { setMenu(null); void run(linkOperation(model, menu, kind, target)); }}
            onCancel={() => setMenu(null)}
          />
        )}

        {context && contextMenu && (
          <ContextMenu x={context.x} y={context.y} {...contextMenu} onClose={closeContext} />
        )}

        {confirm && (
          <div className="opm-confirm">
            <div>{confirm.text}</div>
            <div className="opm-actions">
              <button className="opm-button primary" onClick={() => { confirm.run(); setConfirm(null); }}>{confirm.action}</button>
              <button className="opm-button" onClick={() => setConfirm(null)}>{t.cancel}</button>
            </div>
          </div>
        )}

        {toast && <Toast text={toast.text} error={toast.error} />}

        <Zoom t={t} />

        <OplBar
          t={t}
          sentences={useFocus ? focusSentences : viewSentences}
          expanded={oplExpanded}
          mode={oplMode}
          selectionActive={useFocus}
          selected={useFocus ? NONE : focus}
          onToggle={() => setOplExpanded(!oplExpanded)}
          onMode={setOplMode}
          onSelect={(refs) => {
            const inView = refs.filter((r) => shownIds.has(r));
            if (inView.length) { setSelection(inView); setEdgeSel(null); }
          }}
        />
        {oplExpanded && (
          <Splitter
            axis="y"
            onReset={() => setOplHeight(OPL_HEIGHT)}
            onDrag={(d, end) => {
              if (!dragBase.current) dragBase.current = oplHeight;
              setOplHeight(Math.round(Math.max(80, Math.min(size.h * 0.7, dragBase.current - d))));
              if (end) dragBase.current = 0;
            }}
          />
        )}
      </div>
      {drawer && hasSelection && inspectorProps && (
        <>
          <Splitter
            axis="x"
            onReset={() => setDrawerWidth(DRAWER_WIDTH)}
            onDrag={(d, end) => {
              if (!dragBase.current) dragBase.current = drawerWidth;
              setDrawerWidth(Math.round(Math.max(220, Math.min(window.innerWidth * 0.6, dragBase.current - d))));
              if (end) dragBase.current = 0;
            }}
          />
          <div className="opm-drawer-pane" style={{ width: drawerWidth }}><Inspector {...inspectorProps} /></div>
        </>
      )}
    </div>
  );
}
