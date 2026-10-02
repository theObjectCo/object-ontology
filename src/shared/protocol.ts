import type { Operation } from "../core/edit";
import type { Model } from "../core/model";
import type { Severity } from "../core/validate";

export interface ElementDiagnostic {
  element?: string;
  severity: Severity;
  message: string;
  code: string;
}

export interface SchemaDef {
  /** Value for the schema field of an object: file#/$defs/name, relative to the model file. */
  ref: string;
  name: string;
  enums: string[];
}

export interface SchemaFile {
  file: string;
  defs: SchemaDef[];
}

export interface UiDefaults {
  drawerOpen?: boolean;
  oplExpanded?: boolean;
  oplMode?: "view" | "selection";
  labelsOn?: boolean;
  drawerWidth?: number;
  oplHeight?: number;
}

export type HostMessage =
  | { type: "init"; language: string; fileName: string; defaults: UiDefaults; theme: ThemeKind }
  | { type: "model"; model: Model; version: number }
  | { type: "parseError"; message: string; line: number; version: number }
  | { type: "diagnostics"; items: ElementDiagnostic[] }
  | { type: "schemas"; files: SchemaFile[] }
  | { type: "reveal"; elementId?: string; viewId?: string }
  | { type: "theme"; theme: ThemeKind }
  | { type: "result"; requestId: number; ok: boolean; error?: string; select?: string[]; message?: string }
  | { type: "requestSaveView" };

export type ThemeKind = "light" | "dark" | "highContrast" | "highContrastLight";

export type WebviewMessage =
  | { type: "ready" }
  | { type: "op"; requestId: number; operation: Operation }
  /** Selects the element in the text editor; open also opens the text beside when it is not visible. */
  | { type: "revealInText"; id: string; open?: boolean }
  | { type: "openTextBeside" }
  /** A link from a note: a web address, or a path relative to the model, optionally with #L<line>. */
  | { type: "openLink"; href: string }
  | { type: "export"; format: "png" | "svg"; data: string; viewId: string }
  | { type: "exportMarkdown" }
  | { type: "saveViewFromSelection"; ids: string[]; positions?: Record<string, [number, number]> }
  | { type: "defaults"; defaults: UiDefaults }
  | { type: "notify"; message: string };
