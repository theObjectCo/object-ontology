import { Parsed, lineColumn, locate } from "../../core/load";
import { OutDiagnostic } from "./contracts";

export function outDiagnostics(text: string, parsed: Parsed): OutDiagnostic[] {
  return parsed.errors.map((d) => {
    const { line, column } = lineColumn(text, locate(parsed.tree, d.path).offset);
    return { severity: d.severity, code: d.code, message: d.message, path: d.path, ...(d.element ? { element: d.element } : {}), line, column };
  });
}

export function count(diags: { severity: string }[], severity: string): number {
  return diags.filter((d) => d.severity === severity).length;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "OK: no errors or warnings (2 infos)" or "1 error, 3 warnings, 0 infos". */
export function summaryLine(diags: { severity: string }[]): string {
  const e = count(diags, "error"), w = count(diags, "warning"), i = count(diags, "info");
  if (!e && !w) return `OK: no errors or warnings${i ? ` (${plural(i, "info")})` : ""}.`;
  return `${plural(e, "error")}, ${plural(w, "warning")}, ${plural(i, "info")}.`;
}
