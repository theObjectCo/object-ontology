import * as vscode from "vscode";
import { Model, label, objects, parents, processes } from "../core/model";
import { listViews } from "../core/viewmodel";
import { Diagnostics, isModel } from "./diagnostics";
import { OpmEditorProvider } from "./editorProvider";

/** The model the side bar shows: the focused diagram, or the active text editor of a model file. */
export class CurrentModel implements vscode.Disposable {
  private listeners = new Set<() => void>();
  private subscriptions: vscode.Disposable[];
  private lastUri?: vscode.Uri;

  constructor(private provider: OpmEditorProvider, diagnostics: Diagnostics) {
    const fire = () => this.listeners.forEach((l) => l());
    this.subscriptions = [
      provider.onDidChangeActive(fire),
      vscode.window.onDidChangeActiveTextEditor(fire),
      vscode.workspace.onDidChangeTextDocument((e) => { if (isModel(e.document) && e.document.uri.toString() === this.uri?.toString()) fire(); }),
      diagnostics.onChange(fire),
    ];
  }

  onChange(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  get document(): vscode.TextDocument | undefined {
    const doc = this.provider.active?.doc
      ?? (vscode.window.activeTextEditor && isModel(vscode.window.activeTextEditor.document) ? vscode.window.activeTextEditor.document : undefined)
      ?? vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.lastUri?.toString());
    if (doc) this.lastUri = doc.uri;
    return doc;
  }

  get uri(): vscode.Uri | undefined {
    return this.document?.uri;
  }

  get model(): Model | undefined {
    try {
      return this.document ? (JSON.parse(this.document.getText()) as Model) : undefined;
    } catch {
      return undefined;
    }
  }

  dispose(): void {
    this.subscriptions.forEach((s) => s.dispose());
  }
}

type ModelItem =
  | { kind: "group"; group: "objects" | "processes"; count: number }
  | { kind: "object" | "process"; id: string }
  | { kind: "state"; object: string; state: string };

export class ModelTree implements vscode.TreeDataProvider<ModelItem> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private current: CurrentModel, private diagnostics: Diagnostics) {
    current.onChange(() => this.emitter.fire());
  }

  getChildren(item?: ModelItem): ModelItem[] {
    const model = this.current.model;
    if (!model) return [];
    if (!item) {
      return [
        { kind: "group", group: "objects", count: Object.keys(objects(model)).length },
        { kind: "group", group: "processes", count: Object.keys(processes(model)).length },
      ];
    }
    if (item.kind === "group") {
      if (item.group === "objects") return Object.keys(objects(model)).map((id) => ({ kind: "object", id }));
      const parentOf = parents(model);
      return Object.keys(processes(model)).filter((id) => !parentOf.has(id)).map((id) => ({ kind: "process", id }));
    }
    if (item.kind === "object") return (objects(model)[item.id]?.states ?? []).map((state) => ({ kind: "state", object: item.id, state }));
    if (item.kind === "process") return (processes(model)[item.id]?.zoomsInto ?? []).filter((id) => processes(model)[id]).map((id) => ({ kind: "process", id }));
    return [];
  }

  getTreeItem(item: ModelItem): vscode.TreeItem {
    const model = this.current.model ?? {};
    const uri = this.current.uri;
    if (item.kind === "group") {
      const t = new vscode.TreeItem(`${item.group === "objects" ? vscode.l10n.t("Objects") : vscode.l10n.t("Processes")} (${item.count})`, vscode.TreeItemCollapsibleState.Expanded);
      t.contextValue = "group";
      return t;
    }
    if (item.kind === "state") {
      const t = new vscode.TreeItem(item.state, vscode.TreeItemCollapsibleState.None);
      t.iconPath = new vscode.ThemeIcon("circle-outline");
      t.command = { command: "opm.revealElement", title: "", arguments: [uri, item.object] };
      return t;
    }
    const hasChildren = item.kind === "object" ? !!objects(model)[item.id]?.states?.length : !!processes(model)[item.id]?.zoomsInto?.length;
    const t = new vscode.TreeItem(label(model, item.id), hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    t.description = item.id;
    const issues = uri ? this.diagnostics.forDocument(uri).filter((d) => d.element === item.id && d.severity !== "info") : [];
    const error = issues.some((d) => d.severity === "error");
    t.iconPath = issues.length
      ? new vscode.ThemeIcon(error ? "error" : "warning", new vscode.ThemeColor(error ? "list.errorForeground" : "list.warningForeground"))
      : new vscode.ThemeIcon(item.kind === "object" ? "symbol-class" : "symbol-event");
    t.tooltip = issues.map((d) => d.message).join("\n") || undefined;
    t.command = { command: "opm.revealElement", title: "", arguments: [uri, item.id] };
    t.contextValue = item.kind;
    return t;
  }
}

type ViewItem = { kind: "group"; group: "system" | "zoom" | "custom" } | { kind: "view"; id: string };

export class ViewsTree implements vscode.TreeDataProvider<ViewItem> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private current: CurrentModel) {
    current.onChange(() => this.emitter.fire());
  }

  getChildren(item?: ViewItem): ViewItem[] {
    const model = this.current.model;
    if (!model) return [];
    const views = listViews(model);
    if (!item) {
      const groups: ViewItem[] = [{ kind: "group", group: "system" }];
      if (views.some((v) => v.kind === "zoom")) groups.push({ kind: "group", group: "zoom" });
      if (views.some((v) => v.kind === "custom")) groups.push({ kind: "group", group: "custom" });
      return groups;
    }
    if (item.kind === "view") return [];
    const kinds = item.group === "system" ? ["system", "structure"] : [item.group];
    return views.filter((v) => kinds.includes(v.kind)).map((v) => ({ kind: "view", id: v.id }));
  }

  getTreeItem(item: ViewItem): vscode.TreeItem {
    if (item.kind === "group") {
      const names = { system: vscode.l10n.t("System"), zoom: vscode.l10n.t("Zooms"), custom: vscode.l10n.t("Custom") };
      return new vscode.TreeItem(names[item.group], vscode.TreeItemCollapsibleState.Expanded);
    }
    const view = listViews(this.current.model ?? {}).find((v) => v.id === item.id);
    const t = new vscode.TreeItem(view ? `${view.code} · ${view.title}` : item.id, vscode.TreeItemCollapsibleState.None);
    t.iconPath = new vscode.ThemeIcon(view?.kind === "zoom" ? "zoom-in" : view?.kind === "custom" ? "eye" : "type-hierarchy");
    t.command = { command: "opm.openView", title: "", arguments: [this.current.uri, item.id] };
    return t;
  }
}
