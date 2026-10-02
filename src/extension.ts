import * as fs from "fs";
import * as vscode from "vscode";
import { check } from "./core/load";
import { label, objects, processes } from "./core/model";
import { markdown } from "./core/render";
import { Diagnostics, LayoutFixes, isModel } from "./host/diagnostics";
import { OpmEditorProvider, applyToDocument, elementAt } from "./host/editorProvider";
import { SchemaIndex } from "./host/schemas";
import { draftSchema, schemaFileFor } from "./core/schemagen";
import { modelName, starterModel } from "./core/template";
import { CurrentModel, ModelTree, ModelsTree, ViewsTree, modelFolder } from "./host/trees";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new Diagnostics();
  const schemas = new SchemaIndex();
  const provider = new OpmEditorProvider(context, diagnostics, schemas);
  const current = new CurrentModel(provider, diagnostics);
  const lastChange = new Map<string, number>();
  const models = new ModelsTree(current);
  const modelView = vscode.window.createTreeView("opm.model", { treeDataProvider: new ModelTree(current, diagnostics) });
  const viewsView = vscode.window.createTreeView("opm.views", { treeDataProvider: new ViewsTree(current) });
  // the file name next to the section titles says which model the side bar shows
  const describe = () => {
    const uri = current.uri;
    const name = uri ? uri.path.slice(uri.path.lastIndexOf("/") + 1) : undefined;
    const folder = uri ? modelFolder(uri) : "";
    modelView.description = name && (folder ? `${name} — ${folder}` : name);
    viewsView.description = name;
  };
  current.onChange(describe);
  describe();
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
    modelView, viewsView,
    models, vscode.window.registerTreeDataProvider("opm.models", models),
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
    vscode.commands.registerCommand("opm.openModel", (uri: vscode.Uri) =>
      vscode.commands.executeCommand("vscode.openWith", uri, OpmEditorProvider.viewType)),
    vscode.commands.registerCommand("opm.newModel", (folder?: vscode.Uri) => newModel(folder, current.uri)),
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
    vscode.commands.registerCommand("opm.createSchema", async (uri?: vscode.Uri) => {
      const doc = await docFor(uri ?? vscode.window.activeTextEditor?.document.uri);
      if (!doc || !isModel(doc)) return vscode.window.showWarningMessage(vscode.l10n.t("Open a *.opm.json model first."));
      const { model } = check(doc.fileName, doc.getText(), false);
      if (!model) return void vscode.window.showErrorMessage(vscode.l10n.t("The OPM model is not valid JSON."));
      const file = schemaFileFor(model, doc.fileName);
      const target = vscode.Uri.joinPath(doc.uri, "..", file);
      const existing = await vscode.workspace.fs.readFile(target).then((b) => Buffer.from(b).toString("utf-8"), () => undefined);
      const draft = draftSchema(model, file, existing);
      if (!Object.keys(draft.links).length) {
        return void vscode.window.showInformationMessage(vscode.l10n.t("Every informatical object already has a schema."));
      }
      if (draft.added.length) await vscode.workspace.fs.writeFile(target, Buffer.from(draft.text, "utf-8"));
      await applyToDocument(doc, { op: "setSchemas", schemas: draft.links });
      await vscode.window.showTextDocument(target, { preview: false, viewColumn: vscode.ViewColumn.Beside });
      vscode.window.showInformationMessage(vscode.l10n.t("{0}: {1} new definition(s), {2} object(s) linked.", file, draft.added.length, Object.keys(draft.links).length));
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

/** Creates a model file with a starter content and opens it in the diagram editor. */
async function newModel(folder: vscode.Uri | undefined, currentModel: vscode.Uri | undefined): Promise<void> {
  let target: vscode.Uri | undefined;
  if (folder) {
    // from the explorer: only the file name is asked, the folder is the one clicked
    const name = await vscode.window.showInputBox({
      prompt: vscode.l10n.t("Name of the new model file"), value: "model.opm.json", valueSelection: [0, 5],
      validateInput: (v) => (/^[^\\/:*?"<>|]+$/.test(v.trim()) ? undefined : vscode.l10n.t("Enter a file name without a folder.")),
    });
    if (!name) return;
    target = vscode.Uri.joinPath(folder, name.trim());
  } else {
    const base = currentModel ? vscode.Uri.joinPath(currentModel, "..") : vscode.workspace.workspaceFolders?.[0]?.uri;
    target = await vscode.window.showSaveDialog({
      defaultUri: base ? vscode.Uri.joinPath(base, "model.opm.json") : undefined,
      filters: { [vscode.l10n.t("OPM model")]: ["json"] },
      title: vscode.l10n.t("New OPM model"),
    });
    if (!target) return;
  }
  if (!/\.opm\.json$/i.test(target.path)) target = target.with({ path: target.path.replace(/(\.json)?$/i, ".opm.json") });
  if (folder) {
    const exists = await vscode.workspace.fs.stat(target).then(() => true, () => false);
    if (exists) return void vscode.window.showErrorMessage(vscode.l10n.t("{0} already exists.", vscode.workspace.asRelativePath(target)));
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(starterModel(modelName(target.path)), "utf-8"));
  await vscode.commands.executeCommand("vscode.openWith", target, OpmEditorProvider.viewType);
}

export function deactivate(): void {}
