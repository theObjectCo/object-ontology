import { applyOperation } from "../../core/edit";
import { WebviewMessage } from "../../shared/protocol";
import { revealIdInJsonPane, toggleJsonPane } from "./chromeView";
import { broadcastModel } from "./document";
import { downloadBlob, downloadDataUrl } from "./downloads";
import { exportJsonSchema } from "./exports";
import { send } from "./messages";
import { PRESETS } from "./presets";
import { redoStack, runtime, session, undoStack } from "./session";

export let webviewState: unknown = undefined;

export function installBrowserBridge() {
// Install acquireVsCodeApi before webview.js runs
(window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  getState: () => webviewState,
  setState: (s: unknown) => { webviewState = s; },
  postMessage(m: WebviewMessage) {
    switch (m.type) {
      case "ready": {
        document.body.className = session.theme;
        send({
          type: "init",
          language: session.lang,
          fileName: session.fileName,
          defaults: {},
          theme: session.theme === "vscode-light" ? "light" : "dark",
        });
        broadcastModel();
        send({ type: "schemas", files: [] });
        const params = new URLSearchParams(location.search);
        const storyParam = params.get("story") ?? PRESETS.find((p) => p.id === session.presetId)?.openStory;
        if (storyParam) {
          setTimeout(() => send({ type: "reveal", storyId: storyParam }), 150);
        }
        return;
      }
      case "op": {
        try {
          const r = applyOperation(session.text, m.operation);
          undoStack.push(session.text);
          if (undoStack.length > 100) undoStack.shift();
          redoStack.length = 0;
          session.text = r.text;
          runtime.version++;
          // The editor must see created/pasted identifiers before selecting them
          // from the operation result; an older model can prune that selection.
          broadcastModel();
          send({ type: "result", requestId: m.requestId, ok: true, select: r.select, message: r.message });
        } catch (e) {
          send({ type: "result", requestId: m.requestId, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      case "export": {
        const base = (session.fileName || "model.opm.json").replace(/\.opm\.json$/i, "");
        if (m.format === "svg") {
          downloadBlob(new Blob([m.data], { type: "image/svg+xml;charset=utf-8" }), `${base}-${m.viewId}.svg`);
        } else if (m.format === "png") {
          downloadDataUrl(m.data, `${base}-${m.viewId}.png`);
        }
        return;
      }
      case "createSchema":
        exportJsonSchema();
        return;
      case "openTextBeside":
        toggleJsonPane();
        return;
      case "revealInText":
        revealIdInJsonPane(m.id, m.open);
        return;
      case "openLink":
        if (/^https?:\/\//i.test(m.href)) window.open(m.href, "_blank", "noopener,noreferrer");
        return;
    }
  },
});
}
