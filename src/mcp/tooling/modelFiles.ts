import { Parsed, check } from "../../core/load";
import { Model } from "../../core/model";
import { OutDiagnostic, ToolError } from "./contracts";
import { count, outDiagnostics, plural } from "./diagnostics";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------- files and diagnostics

export const SKIP_DIRS = new Set(["node_modules", "dist", "out", ".git"]);

export const MODEL_FILE = /\.opm\.json$/i;

/** The absolute path of an existing *.opm.json file, or a refusal that says what is wrong with the argument. */
export function modelFile(p: unknown): string {
  if (typeof p !== "string" || !p.trim()) throw new ToolError("\"path\" is required: the absolute path of a *.opm.json file.");
  if (!path.isAbsolute(p)) throw new ToolError(`"${p}" is not an absolute path. Pass the full path of the *.opm.json file.`);
  if (!MODEL_FILE.test(p)) throw new ToolError(`"${p}" is not a *.opm.json file; these tools read and edit OPM model files only.`);
  const full = path.resolve(p);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(full);
  } catch {
    throw new ToolError(`${full} does not exist.`);
  }
  if (!stat.isFile()) throw new ToolError(`${full} is not a file.`);
  return full;
}

export interface Loaded extends Parsed {
  file: string;
  text: string;
  diagnostics: OutDiagnostic[];
}

export function load(file: string): Loaded {
  const text = fs.readFileSync(file, "utf-8");
  const parsed = check(file, text);
  return { file, text, ...parsed, diagnostics: outDiagnostics(text, parsed) };
}

/** A loaded model that parsed; a file that is not JSON is refused with the parser's messages. */
export function loadModel(p: unknown): Loaded & { model: Model } {
  const loaded = load(modelFile(p));
  if (!loaded.model) {
    const where = loaded.diagnostics.map((d) => `line ${d.line}, column ${d.column}: ${d.message}`).join("; ");
    throw new ToolError(`${loaded.file} is not valid JSON (${where}). Fix the text first; opm_validate lists the positions.`);
  }
  return loaded as Loaded & { model: Model };
}

/** Rendering needs a model without errors, as on the command line. */
export function loadClean(p: unknown): Loaded & { model: Model } {
  const loaded = loadModel(p);
  const errors = count(loaded.diagnostics, "error");
  if (errors) throw new ToolError(`${loaded.file} has ${plural(errors, "error")}; fix them first (opm_validate lists them).`);
  return loaded;
}

// ---------------------------------------------------------------- read helpers

export function walkModels(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) visit(path.join(dir, e.name));
      } else if (e.isFile() && MODEL_FILE.test(e.name)) out.push(path.join(dir, e.name));
    }
  };
  visit(root);
  return out.sort();
}
