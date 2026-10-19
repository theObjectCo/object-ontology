import * as vscode from "vscode";
import { METHODS, MethodId, methodProcesses } from "../core/methods/index";
import { label } from "../core/model";
import { CurrentModel } from "./trees";

type MethodItem = { kind: "method"; method: MethodId } | { kind: "process"; method: MethodId; process: string };

const ICONS: Record<MethodId, string> = { idef0: "symbol-structure", sipoc: "list-flat", dsm: "table", flow: "arrow-right" };

/** The other methods of describing processes, each with the processes it can show; a click opens it in the diagram. */
export class MethodsTree implements vscode.TreeDataProvider<MethodItem> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private current: CurrentModel) {
    current.onChange(() => this.emitter.fire());
  }

  getChildren(item?: MethodItem): MethodItem[] {
    const model = this.current.model;
    if (!model) return [];
    if (!item) return METHODS.map((method) => ({ kind: "method", method }));
    if (item.kind === "process") return [];
    return methodProcesses(model, item.method).map((process) => ({ kind: "process", method: item.method, process }));
  }

  getTreeItem(item: MethodItem): vscode.TreeItem {
    const uri = this.current.uri;
    if (item.kind === "process") {
      const t = new vscode.TreeItem(label(this.current.model ?? {}, item.process), vscode.TreeItemCollapsibleState.None);
      t.description = item.process;
      t.iconPath = new vscode.ThemeIcon("symbol-event");
      t.command = { command: "opm.openMethod", title: "", arguments: [uri, item.method, item.process] };
      return t;
    }
    const names: Record<MethodId, string> = {
      idef0: "IDEF0", sipoc: "SIPOC", dsm: vscode.l10n.t("N² matrix of modules"), flow: vscode.l10n.t("Process flow"),
    };
    const t = new vscode.TreeItem(names[item.method], item.method === "dsm" ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
    t.iconPath = new vscode.ThemeIcon(ICONS[item.method]);
    t.command = { command: "opm.openMethod", title: "", arguments: [uri, item.method] };
    return t;
  }
}
