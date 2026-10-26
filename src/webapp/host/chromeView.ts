import { flushSync } from "react-dom";
import { notifyChromeChange } from "./chromeState";
import { session } from "./session";

export let jsonPaneOpen = false;

export function revealIdInJsonPane(id?: string, open = true) {
  if (!jsonPaneOpen) {
    if (!open) return;
    toggleJsonPane(true);
  }
  const ta = document.getElementById("opm-webapp-json-editor") as HTMLTextAreaElement | null;
  if (!ta) return;
  if (open) ta.focus();
  if (!id) return;
  const needle = `"${id}":`;
  const idx = ta.value.indexOf(needle);
  if (idx >= 0) {
    ta.setSelectionRange(idx, idx + needle.length);
    const line = ta.value.slice(0, idx).split("\n").length;
    const lineHeight = 18;
    ta.scrollTop = Math.max(0, (line - 5) * lineHeight);
  }
}

// ---------------------------------------------------------------- Web App Top Bar & Live JSON Drawer

export function showToast(msg: string) {
  let el = document.getElementById("opm-webapp-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "opm-webapp-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("visible");
  setTimeout(() => el?.classList.remove("visible"), 2600);
}

export function toggleJsonPane(force?: boolean) {
  jsonPaneOpen = force !== undefined ? force : !jsonPaneOpen;
  flushSync(notifyChromeChange);
  if (jsonPaneOpen) syncJsonTextarea();
}

export function syncJsonTextarea() {
  const ta = document.getElementById("opm-webapp-json-editor") as HTMLTextAreaElement | null;
  if (!ta || document.activeElement === ta) return;
  ta.value = session.text;
}

export function updateHeaderUi() {
  notifyChromeChange();
}
