/**
 * A stand-in for the VS Code webview API: keeps the model text, applies operations with the real edit
 * engine and answers like the extension does. Used to run the editor in a browser for screenshots.
 */
import { applyOperation } from "../../src/core/edit";
import { Model } from "../../src/core/model";
import { validate } from "../../src/core/validate";
import type { HostMessage, WebviewMessage } from "../../src/shared/protocol";

interface Harness {
  text: string;
  history: string[];
  messages: WebviewMessage[];
  setText(text: string): void;
  undo(): void;
}

const params = new URLSearchParams(location.search);
const initial = (document.getElementById("model") as HTMLScriptElement).textContent ?? "{}";
let state: unknown = undefined;
let version = 1;

const send = (m: HostMessage) => window.postMessage(m, "*");

function sendModel() {
  try {
    const model = JSON.parse(harness.text || "{}") as Model;
    send({ type: "model", model, version });
    const items = validate(model).map((d) => ({ element: d.element, severity: d.severity, message: d.message, code: d.code }));
    send({ type: "diagnostics", items });
  } catch (e) {
    send({ type: "parseError", message: String(e), line: 1, version });
  }
}

const harness: Harness = {
  text: initial.trim(),
  history: [],
  messages: [],
  setText(text: string) {
    this.history.push(this.text);
    this.text = text;
    version++;
    setTimeout(sendModel, 50);
  },
  undo() {
    const prev = this.history.pop();
    if (prev === undefined) return;
    this.text = prev;
    version++;
    setTimeout(sendModel, 50);
  },
};
(window as unknown as { harness: Harness }).harness = harness;

(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  getState: () => state,
  setState: (s: unknown) => { state = s; },
  postMessage(m: WebviewMessage) {
    harness.messages.push(m);
    switch (m.type) {
      case "ready":
        send({ type: "init", language: params.get("lang") ?? "en", fileName: "model.opm.json", defaults: {}, theme: "dark" });
        sendModel();
        send({
          type: "schemas",
          files: [{ file: "contracts.schema.json", defs: [
            { ref: "contracts.schema.json#/$defs/decision", name: "decision", enums: ["passed", "rejected", "applied"] },
            { ref: "contracts.schema.json#/$defs/snapshot", name: "snapshot", enums: ["valid", "expired", "archived"] },
          ] }],
        });
        return;
      case "op":
        try {
          const r = applyOperation(harness.text, m.operation);
          harness.history.push(harness.text);
          harness.text = r.text;
          version++;
          send({ type: "result", requestId: m.requestId, ok: true, select: r.select, message: r.message });
          setTimeout(sendModel, 50);
        } catch (e) {
          send({ type: "result", requestId: m.requestId, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        return;
    }
  },
});
