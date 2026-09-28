import * as path from "path";
import * as vscode from "vscode";
import { collectEnumValues } from "../core/validate";
import { SchemaFile } from "../shared/protocol";

interface Found {
  uri: vscode.Uri;
  /** $defs, or definitions in older drafts. */
  key: string;
  defs: { name: string; enums: string[] }[];
}

/** Definitions of every JSON Schema file in the workspace, for the schema picker and state suggestions. */
export class SchemaIndex implements vscode.Disposable {
  private files = new Map<string, Found>();
  private watcher?: vscode.FileSystemWatcher;
  private listeners = new Set<() => void>();
  private ready: Promise<void>;

  constructor() {
    this.ready = this.scan();
    const pattern = vscode.workspace.getConfiguration("opm").get<string>("schemaGlob", "**/*.schema.json");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const reload = (uri: vscode.Uri) => this.load(uri).then(() => this.emit());
    this.watcher.onDidCreate(reload);
    this.watcher.onDidChange(reload);
    this.watcher.onDidDelete((uri) => { this.files.delete(uri.toString()); this.emit(); });
  }

  onChange(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private async scan() {
    const pattern = vscode.workspace.getConfiguration("opm").get<string>("schemaGlob", "**/*.schema.json");
    const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 500);
    await Promise.all(uris.map((u) => this.load(u)));
  }

  private async load(uri: vscode.Uri) {
    try {
      const doc = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf-8"));
      const key = doc.$defs ? "$defs" : "definitions";
      const defs = Object.entries((doc[key] ?? {}) as Record<string, unknown>).map(([name, node]) => ({
        name, enums: [...collectEnumValues(doc, node)],
      }));
      this.files.set(uri.toString(), { uri, key, defs });
    } catch {
      this.files.delete(uri.toString());
    }
  }

  /** Definitions with references relative to a model file. */
  async forModel(modelUri: vscode.Uri): Promise<SchemaFile[]> {
    await this.ready;
    const base = path.dirname(modelUri.fsPath);
    return [...this.files.values()]
      .map((f) => {
        const rel = path.relative(base, f.uri.fsPath).split(path.sep).join("/");
        return { file: rel, defs: f.defs.map((d) => ({ ref: `${rel}#/${f.key}/${d.name}`, name: d.name, enums: d.enums })) };
      })
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  dispose(): void {
    this.watcher?.dispose();
  }
}
