import { Node, useReactFlow, Viewport } from "@xyflow/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { EditorLinkKind } from "../../core/links";
import { Model } from "../../core/model";
import { listViews, ViewInfo } from "../../core/viewmodel";
import { LINK_WORDS, messages } from "../../shared/i18n";
import { ElementDiagnostic, SchemaFile } from "../../shared/protocol";
import { Positions } from "../layout";
import { MethodState } from "../methods/panel";
import { tabState } from "../vscode";
import { DRAWER_WIDTH, OPL_HEIGHT } from "./constants";
import { MenuState, TabState } from "./contracts";

export function useDiagramState() {

  const saved = useMemo(() => tabState<TabState>(), []);
  const [language, setLanguage] = useState("en");
  const t = useMemo(() => messages(language), [language]);
  const words = LINK_WORDS[language.toLowerCase().startsWith("pl") ? "pl" : "en"];
  const [model, setModel] = useState<Model | null>(null);
  const [parseError, setParseError] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<ElementDiagnostic[]>([]);
  const [schemas, setSchemas] = useState<SchemaFile[]>([]);
  const [viewId, setViewId] = useState(saved?.viewId ?? "system");
  const [storyId, setStoryId] = useState<string | null>(saved?.storyId ?? null);
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
  /** The view of another method shown over the diagram (IDEF0, SIPOC, N², flow), read-only. */
  const [method, setMethod] = useState<MethodState | null>(null);

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
  /** Positions of an arrangement just written; the view is fitted when they are on screen. */
  const fitAfterLayout = useRef<Positions | null>(null);
  const centerOn = useRef<string | null>(null);
  const pendingView = useRef<string | null>(null);
  const pendingEdge = useRef<{ kind: EditorLinkKind; from: string; to: string } | null>(null);
  const fresh = useRef(new Set<string>());
  const editingRef = useRef<string | null>(null);
  const fromHost = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  /** True while a story covers the diagram; the keyboard and the clipboard then leave the diagram alone. */
  const storyOpen = useRef(false);

  const frozen = parseError !== null || method !== null;
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

  const saveViewRef = useRef<() => void>(() => { });
  return {
    saved, language, setLanguage, t, words, model, setModel, parseError, setParseError, diagnostics,
    setDiagnostics, schemas, setSchemas, viewId, setViewId, storyId, setStoryId, selection, setSelection,
    edgeSel, setEdgeSel, drawer, setDrawer, oplExpanded, setOplExpanded, drawerWidth, setDrawerWidth,
    oplHeight, setOplHeight, dragBase, oplMode, setOplMode, labelsOn, setLabelsOn, editing, setEditing, extra,
    setExtra, positions, setPositions, layingOut, setLayingOut, settledView, setSettledView, toast, confirm,
    setConfirm, menu, setMenu, context, setContext, connecting, setConnecting, nodes, setNodes, rebuild,
    setRebuild, size, setSize, reveal, setReveal, exporting, setExporting, initialized, setInitialized,
    method, setMethod, flow, wrapper, rightDown, boxSelecting, copied, autoCache, viewports, needsFit,
    fitAfterLayout, centerOn, pendingView, pendingEdge, fresh, editingRef, fromHost, storyOpen, frozen, views,
    view, stored, manual, storedKey, showToast, saveViewRef
  };
}
