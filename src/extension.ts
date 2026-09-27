import * as fs from "fs";
import * as vscode from "vscode";
import { check, locate } from "./core/load";
import { label } from "./core/model";
import { markdown, moduleSummaries, opl, stateDiagrams, views } from "./core/render";
import { Severity } from "./core/validate";

const isModel = (doc: vscode.TextDocument) => doc.fileName.endsWith(".opm.json");
const SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information,
};

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("opm");
  const timers = new Map<string, NodeJS.Timeout>();
  const previews = new Map<string, vscode.WebviewPanel>();

  const refresh = (doc: vscode.TextDocument) => {
    if (!isModel(doc)) return;
    // the format schema is applied by VS Code through jsonValidation; here only the OPM meaning is checked
    const { tree, errors } = check(doc.fileName, doc.getText(), false);
    diagnostics.set(doc.uri, errors.map((d) => {
      const { offset, length } = locate(tree, d.path);
      const range = new vscode.Range(doc.positionAt(offset), doc.positionAt(offset + length));
      const item = new vscode.Diagnostic(range, d.message, SEVERITY[d.severity]);
      item.source = "opm";
      item.code = d.code;
      return item;
    }));
    const panel = previews.get(doc.uri.toString());
    if (panel) panel.webview.postMessage({ html: previewBody(doc) });
  };
  const schedule = (doc: vscode.TextDocument) => {
    if (!isModel(doc)) return;
    const key = doc.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => refresh(doc), 300));
  };

  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidSaveTextDocument(refresh),
    vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri)),
    vscode.commands.registerCommand("opm.preview", async (uri?: vscode.Uri) => {
      const doc = await modelDocument(uri);
      if (!doc) return;
      const key = doc.uri.toString();
      const existing = previews.get(key);
      if (existing) return existing.reveal(vscode.ViewColumn.Beside);
      const panel = vscode.window.createWebviewPanel("opmPreview", `OPM: ${baseName(doc)}`, vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      });
      previews.set(key, panel);
      panel.onDidDispose(() => previews.delete(key));
      panel.webview.html = previewPage(panel.webview, context.extensionUri, previewBody(doc));
    }),
    vscode.commands.registerCommand("opm.exportMarkdown", async (uri?: vscode.Uri) => {
      const doc = await modelDocument(uri);
      if (!doc) return;
      const { model, errors } = check(doc.fileName, doc.getText(), false);
      if (!model) return void vscode.window.showErrorMessage("The OPM model is not valid JSON.");
      const fatal = errors.filter((e) => e.severity === "error").length;
      if (fatal && (await vscode.window.showWarningMessage(`The model has ${fatal} error(s). Export anyway?`, "Export", "Cancel")) !== "Export") return;
      const target = doc.fileName.replace(/\.opm\.json$/, ".md");
      fs.writeFileSync(target, markdown(model), "utf-8");
      await vscode.window.showTextDocument(vscode.Uri.file(target), { preview: false, viewColumn: vscode.ViewColumn.Beside });
    }),
  );
  vscode.workspace.textDocuments.forEach(refresh);
}

export function deactivate(): void {}

async function modelDocument(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  const doc = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
  if (!doc || !isModel(doc)) {
    vscode.window.showWarningMessage("Open a *.opm.json model first.");
    return undefined;
  }
  return doc;
}

const baseName = (doc: vscode.TextDocument) => doc.fileName.split(/[\\/]/).pop()!.replace(/\.opm\.json$/, "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function previewBody(doc: vscode.TextDocument): string {
  const { model, errors } = check(doc.fileName, doc.getText(), false);
  if (!model) return `<p class="error">The model is not valid JSON.</p>`;
  const L = (id: string) => esc(label(model, id));
  const parts: string[] = [`<h1>${esc(model.name ?? baseName(doc))}</h1>`];
  const counts = (["error", "warning"] as const).map((s) => [s, errors.filter((e) => e.severity === s).length] as const);
  if (counts.some(([, n]) => n)) {
    parts.push(`<p class="summary">${counts.map(([s, n]) => `${n} ${s}${n === 1 ? "" : "s"}`).join(", ")}. The Problems panel lists them.</p>`);
  }
  if (model.description) parts.push(`<p>${esc(model.description)}</p>`);
  for (const v of views(model)) {
    parts.push(`<h2>${esc(v.title)}</h2>`);
    if (v.description) parts.push(`<p>${esc(v.description)}</p>`);
    parts.push(`<pre class="mermaid">${esc(v.mermaid)}</pre>`);
  }
  const modules = moduleSummaries(model);
  if (modules.length) {
    const cell = (ids: string[]) => ids.map(L).join(", ") || "none";
    parts.push("<h2>Modules</h2><table><tr><th>Module</th><th>Performs</th><th>Takes</th><th>Gives</th><th>Changes</th></tr>",
      ...modules.map((m) => `<tr><td>${L(m.module)}</td><td>${cell(m.performs)}</td><td>${cell(m.takes)}</td><td>${cell(m.gives)}</td><td>${cell(m.changes)}</td></tr>`),
      "</table>");
  }
  const states = stateDiagrams(model);
  if (states.length) {
    parts.push("<h2>Object states</h2>");
    for (const s of states) parts.push(`<h3>${esc(s.title)}</h3><pre class="mermaid">${esc(s.mermaid)}</pre>`);
  }
  parts.push("<h2>OPL</h2><ul>", ...opl(model).map((s) => `<li>${esc(s)}</li>`), "</ul>");
  return parts.join("\n");
}

function previewPage(webview: vscode.Webview, root: vscode.Uri, body: string): string {
  const nonce = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
  const mermaid = webview.asWebviewUri(vscode.Uri.joinPath(root, "media", "mermaid.min.js"));
  const dark = [vscode.ColorThemeKind.Dark, vscode.ColorThemeKind.HighContrast].includes(vscode.window.activeColorTheme.kind);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 1.5em 2em; }
  pre.mermaid { background: transparent; }
  table { border-collapse: collapse; } td, th { border: 1px solid var(--vscode-panel-border); padding: 4px 8px; text-align: left; }
  .summary, .error { color: var(--vscode-errorForeground); }
</style>
<script nonce="${nonce}" src="${mermaid}"></script>
</head><body><div id="content">${body}</div>
<script nonce="${nonce}">
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "${dark ? "dark" : "default"}" });
  const render = () => mermaid.run({ querySelector: "pre.mermaid" }).catch((e) => console.error(e));
  window.addEventListener("message", (event) => {
    document.getElementById("content").innerHTML = event.data.html;
    render();
  });
  render();
</script></body></html>`;
}
