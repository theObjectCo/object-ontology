import * as fs from "fs";
import * as vscode from "vscode";
import { check } from "./core/load";
import { label, objects, processes } from "./core/model";
import { markdown } from "./core/render";
import { Diagnostics, LayoutFixes, isModel } from "./host/diagnostics";
import { OpmEditorProvider, applyToDocument, elementAt } from "./host/editorProvider";
import { SchemaIndex } from "./host/schemas";
import { CurrentModel, ModelTree, ViewsTree } from "./host/trees";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new Diagnostics();
  const schemas = new SchemaIndex();
  const provider = new OpmEditorProvider(context, diagnostics, schemas);
  const current = new CurrentModel(provider, diagnostics);
  const lastChange = new Map<string, number>();
  const docFor = async (uri?: vscode.Uri) => {
    const target = uri ?? current.uri;
    return target ? vscode.workspace.openTextDocument(target) : undefined;
  };

  context.subscriptions.push(
    diagnostics, schemas, current,
    vscode.window.registerCustomEditorProvider(OpmEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: true,
    }),
    vscode.window.registerTreeDataProvider("opm.model", new ModelTree(current, diagnostics)),
    vscode.window.registerTreeDataProvider("opm.views", new ViewsTree(current)),
    vscode.languages.registerCodeActionsProvider({ pattern: "**/*.opm.json" },
      new LayoutFixes((doc) => applyToDocument(doc, { op: "removeStaleLayout" })), { providedCodeActionKinds: LayoutFixes.kinds }),

    vscode.workspace.onDidOpenTextDocument((doc) => diagnostics.refresh(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      lastChange.set(e.document.uri.toString(), Date.now());
      diagnostics.schedule(e.document);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => diagnostics.refresh(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (!vscode.workspace.textDocuments.some((d) => d.uri.toString() === doc.uri.toString())) diagnostics.clear(doc.uri);
    }),

    // the cursor in the JSON text selects the element on the diagram, also after a jump from Problems;
    // a cursor move made by the diagram itself is not sent back
    vscode.window.onDidChangeTextEditorSelection((e) => {
      const doc = e.textEditor.document;
      if (!isModel(doc) || provider.causedSelection(doc.uri)) return;
      // an edit shifts the cursor without the user moving it
      const byUser = e.kind === vscode.TextEditorSelectionChangeKind.Keyboard || e.kind === vscode.TextEditorSelectionChangeKind.Mouse;
      if (!byUser && Date.now() - (lastChange.get(doc.uri.toString()) ?? 0) < 150) return;
      const id = elementAt(doc.getText(), doc.offsetAt(e.selections[0].active));
      if (id) provider.reveal(doc.uri, { elementId: id }, false);
    }),

    vscode.commands.registerCommand("opm.openTextBeside", async (uri?: vscode.Uri) => {
      const target = uri ?? provider.active?.doc.uri;
      if (target) await vscode.commands.executeCommand("vscode.openWith", target, "default", vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand("opm.openDiagramBeside", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (target) await vscode.commands.executeCommand("vscode.openWith", target, OpmEditorProvider.viewType, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand("opm.revealElement", (uri: vscode.Uri | undefined, id: string) => {
      if (uri) return provider.revealOrOpen(uri, { elementId: id });
    }),
    vscode.commands.registerCommand("opm.openView", (uri: vscode.Uri | undefined, viewId: string) => {
      if (uri) return provider.revealOrOpen(uri, { viewId });
    }),
    vscode.commands.registerCommand("opm.findElement", async () => {
      const model = current.model;
      const uri = current.uri;
      if (!model || !uri) return vscode.window.showWarningMessage(vscode.l10n.t("Open a *.opm.json model first."));
      const items = [
        ...Object.keys(objects(model)).map((id) => ({ label: label(model, id), description: id, detail: vscode.l10n.t("Object"), id })),
        ...Object.keys(processes(model)).map((id) => ({ label: label(model, id), description: id, detail: vscode.l10n.t("Process"), id })),
      ];
      const pick = await vscode.window.showQuickPick(items, { placeHolder: vscode.l10n.t("Find an object or process"), matchOnDescription: true });
      if (pick) await provider.revealOrOpen(uri, { elementId: pick.id });
    }),
    vscode.commands.registerCommand("opm.saveSelectionAsView", () => {
      if (!provider.requestSaveView()) vscode.window.showInformationMessage(vscode.l10n.t("Select elements in an OPM diagram first."));
    }),
    vscode.commands.registerCommand("opm.removeStaleLayout", async (uri?: vscode.Uri) => {
      const doc = await docFor(uri);
      if (doc) await applyToDocument(doc, { op: "removeStaleLayout" });
    }),
    vscode.commands.registerCommand("opm.exportMarkdown", async (uri?: vscode.Uri) => {
      const doc = await docFor(uri ?? vscode.window.activeTextEditor?.document.uri);
      if (!doc || !isModel(doc)) return vscode.window.showWarningMessage(vscode.l10n.t("Open a *.opm.json model first."));
      const { model, errors } = check(doc.fileName, doc.getText(), false);
      if (!model) return void vscode.window.showErrorMessage(vscode.l10n.t("The OPM model is not valid JSON."));
      const fatal = errors.filter((e) => e.severity === "error").length;
      if (fatal) {
        const answer = await vscode.window.showWarningMessage(vscode.l10n.t("The model has {0} error(s). Export anyway?", fatal), vscode.l10n.t("Export"));
        if (!answer) return;
      }
      const target = doc.fileName.replace(/\.opm\.json$/, ".md");
      fs.writeFileSync(target, markdown(model), "utf-8");
      await vscode.window.showTextDocument(vscode.Uri.file(target), { preview: false, viewColumn: vscode.ViewColumn.Beside });
    }),
  );
  vscode.workspace.textDocuments.forEach((doc) => diagnostics.refresh(doc));
}

export function deactivate(): void {}
