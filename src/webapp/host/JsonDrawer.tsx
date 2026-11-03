import { useEffect, useLayoutEffect, useRef } from "react";
import { useChromeRevision } from "./chromeState";
import {
  jsonPaneOpen,
  jsonSplitFlipped,
  jsonSplitMode,
  syncJsonTextarea,
  toggleJsonPane,
  toggleJsonSplitFlip,
  toggleJsonSplitMode,
} from "./chromeView";
import { setText } from "./document";
import { session } from "./session";

export function JsonDrawer() {
  const revision = useChromeRevision();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(syncJsonTextarea, [revision]);

  const isHoriz = jsonSplitMode === "horizontal";

  return (
    <>
      <aside
        id="opm-webapp-json-pane"
        className="pane"
        style={{ display: jsonPaneOpen ? "flex" : "none" }}
      >
        <header className="band opm-wa-json-head">
          <span className="cap">Source</span>
          <span id="opm-json-tab" className="detail">
            {session.fileName || "model.opm.json"}
          </span>
          <span className="actions">
            <button
              id="opm-webapp-json-flip"
              type="button"
              className={jsonSplitFlipped ? "active" : ""}
              title="Swap code and diagram positions"
              aria-label="Swap code and diagram positions"
              aria-pressed={jsonSplitFlipped}
              onClick={() => toggleJsonSplitFlip()}
            >
              <svg viewBox="0 0 24 24">
                <path d="M7 4v16" />
                <path d="M3 8l4-4 4 4" />
                <path d="M17 20V4" />
                <path d="M13 16l4 4 4-4" />
              </svg>
            </button>
            <button
              id="opm-webapp-json-split"
              type="button"
              title={
                isHoriz
                  ? "Split editor vertically (side by side)"
                  : "Split editor horizontally (top and bottom)"
              }
              aria-label="Toggle editor split"
              onClick={() => toggleJsonSplitMode()}
            >
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" />
                <path d={isHoriz ? "M3 12h18" : "M12 4v16"} />
              </svg>
            </button>
            <button
              id="opm-webapp-json-close"
              type="button"
              title="Close JSON editor"
              aria-label="Close JSON editor"
              onClick={() => toggleJsonPane(false)}
            >
              ×
            </button>
          </span>
        </header>
        <textarea
          id="opm-webapp-json-editor"
          spellCheck={false}
          aria-label="OPM JSON source"
          onInput={(event) => {
            clearTimeout(timer.current);
            const text = event.currentTarget.value;
            timer.current = setTimeout(() => setText(text, true), 300);
          }}
        />
      </aside>
      <div
        id="opm-stage-splitter"
        className="splitter"
        style={{ display: jsonPaneOpen ? "block" : "none" }}
        role="separator"
        aria-orientation={isHoriz ? "horizontal" : "vertical"}
      />
    </>
  );
}
