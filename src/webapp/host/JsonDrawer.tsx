import { useEffect, useLayoutEffect, useRef } from "react";
import { useChromeRevision } from "./chromeState";
import { jsonPaneOpen, syncJsonTextarea, toggleJsonPane } from "./chromeView";
import { setText } from "./document";

export function JsonDrawer() {
  const revision = useChromeRevision();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(syncJsonTextarea, [revision]);
  return <aside id="opm-webapp-json-pane" style={{ display: jsonPaneOpen ? "flex" : "none" }}>
    <div className="opm-wa-json-head">
      <span>Live <code>.opm.json</code> source</span>
      <button id="opm-webapp-json-close" title="Close JSON editor" onClick={() => toggleJsonPane(false)}>×</button>
    </div>
    <textarea id="opm-webapp-json-editor" spellCheck={false} aria-label="OPM JSON source"
      onInput={event => {
        clearTimeout(timer.current);
        const text = event.currentTarget.value;
        timer.current = setTimeout(() => setText(text, true), 300);
      }} />
  </aside>;
}
