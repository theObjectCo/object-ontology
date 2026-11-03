import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { WebAppHeader } from "./WebAppHeader";
import { WebAppRail } from "./WebAppRail";
import { JsonDrawer } from "./JsonDrawer";
import { installChromeEvents } from "./chromeEvents";
import { syncStageSplitClasses } from "./chromeView";
import { session } from "./session";
import "./chrome.css";

let mounted = false;
export function mountWebAppChrome() {
  const bar = document.getElementById("opm-webapp-bar");
  const drawer = document.getElementById("opm-webapp-json-mount");
  const rail = document.getElementById("opm-webapp-rail-mount");
  if (!bar || !drawer || mounted) return;
  mounted = true;
  document.documentElement.dataset.theme = session.theme === "vscode-light" ? "light" : "dark";
  syncStageSplitClasses();
  // Mount before the editor's first bridge message can request JSON selection.
  flushSync(() => {
    createRoot(bar).render(<WebAppHeader />);
    if (rail) createRoot(rail).render(<WebAppRail />);
    createRoot(drawer).render(<JsonDrawer />);
  });
  installChromeEvents();
}
