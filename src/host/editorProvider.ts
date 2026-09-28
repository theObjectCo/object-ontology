import * as vscode from "vscode";
import { ParseError, findNodeAtLocation, getLocation, parseTree } from "jsonc-parser";
import { EditError, Operation, applyOperation, minimalEdit } from "../core/edit";
import { Model } from "../core/model";
import { HostMessage, ThemeKind, UiDefaults, WebviewMessage } from "../shared/protocol";
import { Diagnostics } from "./diagnostics";
import { SchemaIndex } from "./schemas";

const DEFAULTS_KEY = "opm.uiDefaults";

export function themeKind(): ThemeKind {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Dark: return "dark";
    case vscode.ColorThemeKind.HighContrast: return "highContrast";
    case vscode.ColorThemeKind.HighContrastLight: return "highContrastLight";
    default: return "light";
  }
}

/** The object or process whose definition contains an offset of the text. */
export function elementAt(text: string, offset: number): string | undefined {
  const { path } = getLocation(text, offset);
  return (path[0] === "objects" || path[0] === "processes") && typeof path[1] === "string" ? path[1] : undefined;
}

/** Applies a semantic operation to a document as one edit, so that one Ctrl+Z undoes it. */
export async function applyToDocument(doc: vscode.TextDocument, op: Operation) {
  const before = doc.getText();
  const result = applyOperation(before, op);
  const change = minimalEdit(before, result.text);
  if (change) {
    const [start, end, text] = change;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(start), doc.positionAt(end)), text);
    if (!(await vscode.workspace.applyEdit(edit))) throw new EditError("VS Code did not apply the edit.");
  }
  return result;
}

interface Editor {
  doc: vscode.TextDocument;
  panel: vscode.WebviewPanel;
}

export class OpmEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = "opm.diagram";
  private editors = new Set<Editor>();
  private activeEditor?: Editor;
  private changeListeners = new Set<() => void>();
  /** Reveals waiting for a diagram that is still opening. */
  private pending = new Map<string, { elementId?: string; viewId?: string }>();
  /** When the diagram last moved the cursor of a text editor, per document, so that the move is not echoed back. */
  private ownSelection = new Map<string, number>();

  /** True if the latest selection change in the text of a document came from the diagram. */
  causedSelection(uri: vscode.Uri): boolean {
    return Date.now() - (this.ownSelection.get(uri.toString()) ?? 0) < 400;
  }

  constructor(private context: vscode.ExtensionContext, private diagnostics: Diagnostics, private schemas: SchemaIndex) {}

  /** The document of the focused diagram, if any. */
  get active(): Editor | undefined {
    return this.activeEditor;
  }

  onDidChangeActive(listener: () => void): vscode.Disposable {
    this.changeListeners.add(listener);
    return { dispose: () => this.changeListeners.delete(listener) };
  }

  async resolveCustomTextEditor(doc: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const editor: Editor = { doc, panel };
    this.editors.add(editor);
    const webview = panel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist"), vscode.Uri.joinPath(this.context.extensionUri, "media")] };
    webview.html = this.html(webview);
    const post = (m: HostMessage) => webview.postMessage(m);

    let timer: NodeJS.Timeout | undefined;
    const sendModel = () => {
      const text = doc.getText();
      const errors: ParseError[] = [];
      parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
      if (errors.length || !text.trim()) {
        if (!text.trim()) return post({ type: "model", model: {} as Model, version: doc.version });
        return post({ type: "parseError", message: "syntax", line: doc.positionAt(errors[0].offset).line + 1, version: doc.version });
      }
      try {
        post({ type: "model", model: JSON.parse(text) as Model, version: doc.version });
      } catch (e) {
        post({ type: "parseError", message: String(e), line: 1, version: doc.version });
      }
    };
    const sendSchemas = async () => post({ type: "schemas", files: await this.schemas.forModel(doc.uri) });

    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== doc.uri.toString() || !e.contentChanges.length) return;
        clearTimeout(timer);
        timer = setTimeout(sendModel, 50);
      }),
      this.diagnostics.onChange((uri, items) => { if (uri.toString() === doc.uri.toString()) post({ type: "diagnostics", items }); }),
      this.schemas.onChange(() => void sendSchemas()),
      vscode.window.onDidChangeActiveColorTheme(() => post({ type: "theme", theme: themeKind() })),
      panel.onDidChangeViewState(() => {
        if (panel.active) this.activeEditor = editor;
        else if (this.activeEditor === editor) this.activeEditor = undefined;
        this.changeListeners.forEach((l) => l());
      }),
      webview.onDidReceiveMessage((m: WebviewMessage) => this.handle(editor, m, post, sendModel, sendSchemas)),
    ];
    panel.onDidDispose(() => {
      clearTimeout(timer);
      subscriptions.forEach((s) => s.dispose());
      this.editors.delete(editor);
      if (this.activeEditor === editor) this.activeEditor = undefined;
      this.changeListeners.forEach((l) => l());
    });
    if (panel.active) this.activeEditor = editor;
    this.diagnostics.refresh(doc);
    this.changeListeners.forEach((l) => l());
  }

  private async handle(editor: Editor, m: WebviewMessage, post: (m: HostMessage) => void, sendModel: () => void, sendSchemas: () => Promise<unknown>) {
    const { doc } = editor;
    switch (m.type) {
      case "ready":
        post({
          type: "init", language: vscode.env.language, fileName: doc.fileName.split(/[\\/]/).pop()!, theme: themeKind(),
          defaults: this.context.workspaceState.get<UiDefaults>(DEFAULTS_KEY, {}),
        });
        sendModel();
        post({ type: "diagnostics", items: this.diagnostics.forDocument(doc.uri) });
        void sendSchemas();
        if (this.pending.has(doc.uri.toString())) {
          post({ type: "reveal", ...this.pending.get(doc.uri.toString())! });
          this.pending.delete(doc.uri.toString());
        }
        return;
      case "op":
        try {
          const result = await applyToDocument(doc, m.operation);
          post({ type: "result", requestId: m.requestId, ok: true, select: result.select, message: result.message });
        } catch (e) {
          const message = e instanceof EditError ? e.message : `Unexpected error: ${String(e)}`;
          post({ type: "result", requestId: m.requestId, ok: false, error: message });
          if (!(e instanceof EditError)) console.error(e);
        }
        return;
      case "revealInText":
        return void this.revealInText(doc, m.id, m.open ?? true);
      case "openTextBeside":
        return void vscode.commands.executeCommand("vscode.openWith", doc.uri, "default", vscode.ViewColumn.Beside);
      case "export":
        return void this.saveExport(doc, m.format, m.data, m.viewId);
      case "exportMarkdown":
        return void vscode.commands.executeCommand("opm.exportMarkdown", doc.uri);
      case "saveViewFromSelection": {
        if (!m.ids.length) return;
        const name = await vscode.window.showInputBox({ prompt: vscode.l10n.t("Name of the new view"), value: vscode.l10n.t("New view") });
        if (!name) return;
        try {
          const result = await applyToDocument(doc, { op: "saveView", name, ids: m.ids, positions: m.positions });
          if (result.message) vscode.window.setStatusBarMessage(result.message, 4000);
        } catch (e) {
          vscode.window.showErrorMessage(String(e instanceof Error ? e.message : e));
        }
        return;
      }
      case "defaults":
        return void this.context.workspaceState.update(DEFAULTS_KEY, m.defaults);
      case "notify":
        return void vscode.window.setStatusBarMessage(m.message, 4000);
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
    const uri = (...p: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, ...p));
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; worker-src blob:; connect-src ${webview.cspSource};">
<link rel="stylesheet" href="${uri("dist", "webview.css")}">
</head><body>
<div id="root" data-elk-worker="${uri("media", "elk-worker.min.js")}"></div>
<script nonce="${nonce}" src="${uri("dist", "webview.js")}"></script>
</body></html>`;
  }

  private async revealInText(doc: vscode.TextDocument, id: string, open: boolean) {
    const tree = parseTree(doc.getText());
    const node = tree && (findNodeAtLocation(tree, ["objects", id]) ?? findNodeAtLocation(tree, ["processes", id]));
    const target = node?.parent?.children?.[0] ?? node;
    const range = target ? new vscode.Range(doc.positionAt(target.offset), doc.positionAt(target.offset + target.length)) : new vscode.Range(0, 0, 0, 0);
    const visible = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === doc.uri.toString());
    if (!visible && !open) return;
    const editor = visible ?? await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
    this.ownSelection.set(doc.uri.toString(), Date.now());
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private async saveExport(doc: vscode.TextDocument, format: "png" | "svg", data: string, viewId: string) {
    const base = doc.uri.fsPath.replace(/\.opm\.json$/, "");
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${base}-${viewId}.${format}`),
      filters: format === "png" ? { PNG: ["png"] } : { SVG: ["svg"] },
    });
    if (!target) return;
    const bytes = format === "png" ? Buffer.from(data.replace(/^data:image\/png;base64,/, ""), "base64") : Buffer.from(data, "utf-8");
    await vscode.workspace.fs.writeFile(target, bytes);
    vscode.window.setStatusBarMessage(vscode.l10n.t("Exported {0}", target.fsPath), 4000);
  }

  /** Shows a view or selects an element in the diagrams of a document. */
  reveal(uri: vscode.Uri, message: { elementId?: string; viewId?: string }, focus = true): boolean {
    const editors = [...this.editors].filter((e) => e.doc.uri.toString() === uri.toString());
    for (const e of editors) {
      e.panel.webview.postMessage({ type: "reveal", ...message } satisfies HostMessage);
      if (focus) e.panel.reveal(undefined, false);
    }
    return editors.length > 0;
  }

  /** Reveals in an open diagram, or opens the diagram and reveals when it is ready. */
  async revealOrOpen(uri: vscode.Uri, message: { elementId?: string; viewId?: string }): Promise<void> {
    if (this.reveal(uri, message)) return;
    this.pending.set(uri.toString(), message);
    await vscode.commands.executeCommand("vscode.openWith", uri, OpmEditorProvider.viewType);
  }

  requestSaveView(): boolean {
    if (!this.activeEditor) return false;
    this.activeEditor.panel.webview.postMessage({ type: "requestSaveView" } satisfies HostMessage);
    return true;
  }
}
