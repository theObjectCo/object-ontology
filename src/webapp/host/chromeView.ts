import { flushSync } from "react-dom";
import { notifyChromeChange } from "./chromeState";
import { session } from "./session";

export let jsonPaneOpen = false;
export let explorerOpen =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("preset") !== "blank"
    : true;
export let jsonSplitMode: "horizontal" | "vertical" =
  (typeof localStorage !== "undefined" &&
    localStorage.getItem("opm-split-mode") === "vertical")
    ? "vertical"
    : "horizontal";
export let jsonSplitFlipped: boolean =
  typeof localStorage !== "undefined"
    ? localStorage.getItem("opm-split-flipped") === "true"
    : false;
export let oplPanelActive = true;

export function syncStageSplitClasses() {
  const stage = document.getElementById("opm-webapp-stage");
  if (!stage) return;
  stage.classList.toggle("split-horizontal", jsonSplitMode === "horizontal");
  stage.classList.toggle("split-vertical", jsonSplitMode === "vertical");
  stage.classList.toggle("split-flipped", jsonSplitFlipped);
}

export function toggleExplorerPane(force?: boolean) {
  explorerOpen = force !== undefined ? force : !explorerOpen;
  flushSync(notifyChromeChange);
}

export function toggleJsonSplitMode() {
  jsonSplitMode = jsonSplitMode === "horizontal" ? "vertical" : "horizontal";
  try {
    localStorage.setItem("opm-split-mode", jsonSplitMode);
  } catch {
    // ignore storage errors
  }
  syncStageSplitClasses();
  flushSync(notifyChromeChange);
}

export function toggleJsonSplitFlip(force?: boolean) {
  jsonSplitFlipped = force !== undefined ? force : !jsonSplitFlipped;
  try {
    localStorage.setItem("opm-split-flipped", String(jsonSplitFlipped));
  } catch {
    // ignore storage errors
  }
  syncStageSplitClasses();
  flushSync(notifyChromeChange);
}

export function toggleOplFromRail() {
  const closeDrawerBtn = document.querySelector(".opm-drawer .v2-panel-actions button") as HTMLButtonElement | null;
  if (closeDrawerBtn) {
    closeDrawerBtn.click();
    oplPanelActive = false;
    flushSync(notifyChromeChange);
    return;
  }
  const openDrawerHudBtn = document.querySelector(".opm-node-hud button:last-child") as HTMLButtonElement | null;
  if (openDrawerHudBtn) {
    openDrawerHudBtn.click();
    oplPanelActive = true;
    flushSync(notifyChromeChange);
    return;
  }
  const oplToggle = document.querySelector(".opm-opl-toggle") as HTMLButtonElement | null;
  if (oplToggle) {
    oplToggle.click();
    oplPanelActive = !oplPanelActive;
    flushSync(notifyChromeChange);
  }
}

export function triggerMethodView() {
  const closeMethodBtn = document.querySelector(".opm-method .v2-panel-actions button") as HTMLButtonElement | null;
  if (closeMethodBtn) {
    closeMethodBtn.click();
    return;
  }
  const moreBtn = document.querySelector(".opm-more") as HTMLButtonElement | null;
  if (moreBtn) {
    moreBtn.click();
    setTimeout(() => {
      const idefBtn = [...document.querySelectorAll(".opm-menu button")].find((el) =>
        el.textContent?.includes("IDEF0"),
      ) as HTMLButtonElement | undefined;
      idefBtn?.click();
    }, 0);
  }
}

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
  syncStageSplitClasses();
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
