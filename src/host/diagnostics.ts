import * as vscode from "vscode";
import { check, locate } from "../core/load";
import { Severity } from "../core/validate";
import { ElementDiagnostic } from "../shared/protocol";

const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

export const isModel = (doc: vscode.TextDocument) => doc.fileName.endsWith(".opm.json");

/** Runs the validator for model documents and keeps the Problems panel and the diagrams up to date. */
export class Diagnostics implements vscode.Disposable {
  readonly collection = vscode.languages.createDiagnosticCollection("opm");
  private timers = new Map<string, NodeJS.Timeout>();
  private latest = new Map<string, ElementDiagnostic[]>();
  private listeners = new Set<(uri: vscode.Uri, items: ElementDiagnostic[]) => void>();

  onChange(listener: (uri: vscode.Uri, items: ElementDiagnostic[]) => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  forDocument(uri: vscode.Uri): ElementDiagnostic[] {
    return this.latest.get(uri.toString()) ?? [];
  }

  refresh(doc: vscode.TextDocument): void {
    if (!isModel(doc)) return;
    // the format schema is applied by VS Code through jsonValidation; here only the OPM meaning is checked
    const { tree, errors } = check(doc.fileName, doc.getText(), false);
    this.collection.set(doc.uri, errors.map((d) => {
      const { offset, length } = locate(tree, d.path);
      const item = new vscode.Diagnostic(new vscode.Range(doc.positionAt(offset), doc.positionAt(offset + length)), d.message, SEVERITY[d.severity]);
      item.source = "opm";
      item.code = d.code;
      return item;
    }));
    const items = errors.map((d) => ({ element: d.element, severity: d.severity, message: d.message, code: d.code }));
    this.latest.set(doc.uri.toString(), items);
    for (const l of this.listeners) l(doc.uri, items);
  }

  schedule(doc: vscode.TextDocument, delay = 200): void {
    if (!isModel(doc)) return;
    const key = doc.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => this.refresh(doc), delay));
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
    this.latest.delete(uri.toString());
  }

  dispose(): void {
    this.collection.dispose();
    this.timers.forEach(clearTimeout);
  }
}

/** Quick fix for layout information: remove positions of things that are not in the view. */
export class LayoutFixes implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];

  constructor(private apply: (doc: vscode.TextDocument) => Thenable<unknown>) {}

  provideCodeActions(doc: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const stale = context.diagnostics.filter((d) => d.source === "opm" && (d.code === "layout-stale" || d.code === "layout-view"));
    if (!stale.length) return [];
    const action = new vscode.CodeAction(vscode.l10n.t("Remove stale positions"), vscode.CodeActionKind.QuickFix);
    action.diagnostics = stale;
    action.command = { command: "opm.removeStaleLayout", title: action.title, arguments: [doc.uri] };
    return [action];
  }
}
