import { METHODS, documentWithMethods } from "../../core/methods/index";
import { objects } from "../../core/model";
import { showToast } from "./chromeView";
import { parseCurrentModel } from "./document";
import { downloadBlob } from "./downloads";
import { session } from "./session";

export function exportMarkdown() {
  const model = parseCurrentModel();
  if (!model) {
    showToast(session.lang === "pl" ? "Napraw błędy JSON przed eksportem Markdown." : "Fix JSON syntax errors before exporting Markdown.");
    return;
  }
  const md = documentWithMethods(model, METHODS);
  const mdName = (session.fileName || "model.opm.json").replace(/\.opm\.json$/i, "") + ".md";
  downloadBlob(new Blob([md], { type: "text/markdown;charset=utf-8" }), mdName);
}

export function exportJsonSchema() {
  const model = parseCurrentModel();
  if (!model) return;
  const defs: Record<string, unknown> = {};
  for (const [id, o] of Object.entries(objects(model))) {
    if (o.role === "module") continue;
    defs[id] = {
      type: "object",
      ...(o.description ? { description: o.description } : {}),
      ...(o.states?.length ? { properties: { state: { type: "string", enum: o.states } }, required: ["state"] } : {}),
    };
  }
  const schemaDoc = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: model.name ?? "Contracts",
    $defs: defs,
  };
  downloadBlob(new Blob([JSON.stringify(schemaDoc, null, 2) + "\n"], { type: "application/schema+json;charset=utf-8" }), "contracts.schema.json");
}
