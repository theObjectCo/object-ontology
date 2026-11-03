import { StudioIconRail } from "@object/kit/components/studio/StudioIconRail";
import { selectPreset } from "./chromeActions";
import { useChromeRevision } from "./chromeState";
import {
  explorerOpen,
  jsonPaneOpen,
  oplPanelActive,
  toggleExplorerPane,
  toggleJsonPane,
  toggleOplFromRail,
  triggerMethodView,
} from "./chromeView";
import { toggleCloudModal } from "./cloudModal";
import { exportMarkdown } from "./exports";
import { openFileFromDisk, saveModelToDisk } from "./files";
import { send } from "./messages";
import { PRESETS } from "./presets";
import { session } from "./session";

interface ParsedModelSummary {
  views: { id: string; label: string }[];
  stories: { id: string; title: string }[];
}

function parseModelSummary(text: string): ParsedModelSummary {
  try {
    const parsed = JSON.parse(text || "{}") as {
      views?: Record<string, { label?: string }>;
      stories?: Record<string, { title?: string }>;
    };
    const views = Object.entries(parsed.views ?? {}).map(([id, v]) => ({
      id,
      label: v?.label || id,
    }));
    if (!views.some((v) => v.id === "system")) {
      views.unshift({ id: "system", label: "System Diagram (SD)" });
    }
    const stories = Object.entries(parsed.stories ?? {}).map(([id, s]) => ({
      id,
      title: s?.title || id,
    }));
    return { views, stories };
  } catch {
    return { views: [{ id: "system", label: "System Diagram (SD)" }], stories: [] };
  }
}

export function WebAppRail() {
  useChromeRevision();
  const pl = session.lang === "pl";
  const summary = parseModelSummary(session.text);

  return (
    <>
      <StudioIconRail
        className="opm-icon-rail"
        ariaLabel={pl ? "Widoki" : "Views"}
        topItems={[
          {
            id: "explorer",
            label: pl ? "Eksplorator modelu" : "Explorer",
            active: explorerOpen,
            onClick: () => toggleExplorerPane(),
            icon: (
              <svg viewBox="0 0 24 24">
                <path d="M14 3H6v18h12V7z" />
                <path d="M14 3v4h4" />
              </svg>
            ),
          },
          {
            id: "source",
            label: pl ? "Źródło (.opm.json)" : "Source (.opm.json)",
            active: jsonPaneOpen,
            onClick: () => toggleJsonPane(),
            icon: (
              <svg viewBox="0 0 24 24">
                <path d="M8 7l-5 5 5 5" />
                <path d="M16 7l5 5-5 5" />
                <path d="M13.5 4l-3 16" />
              </svg>
            ),
          },
          {
            id: "inspector",
            label: pl ? "Właściwości i OPL" : "Properties & OPL",
            active: oplPanelActive,
            onClick: () => toggleOplFromRail(),
            icon: (
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" />
                <path d="M15 4v16" />
              </svg>
            ),
          },
        ]}
        bottomItems={[
          {
            id: "examples",
            label: pl ? "Przykłady i Chmura" : "Examples & Cloud",
            active: false,
            onClick: () => toggleCloudModal(),
            icon: (
              <svg viewBox="0 0 24 24">
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="10" width="7" height="11" />
                <rect x="8.5" y="3" width="7" height="7" />
              </svg>
            ),
          },
          {
            id: "methods",
            label: pl
              ? "Metody inżynierskie (IDEF0 / SIPOC / DSM)"
              : "Engineering Methods (IDEF0 / SIPOC / DSM)",
            active: false,
            onClick: () => triggerMethodView(),
            icon: (
              <svg viewBox="0 0 24 24">
                <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
                <path d="M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" />
              </svg>
            ),
          },
        ]}
      />
      <aside
        id="opm-webapp-explorer"
        className="pane opm-explorer-pane"
        hidden={!explorerOpen}
        aria-label={pl ? "Eksplorator modelu" : "Model Explorer"}
      >
        <header className="band">
          <span className="cap">{pl ? "Eksplorator" : "Explorer"}</span>
          <span className="detail">{session.fileName}</span>
          <span className="actions">
            <button
              type="button"
              title={pl ? "Otwórz .opm.json" : "Open .opm.json"}
              aria-label={pl ? "Otwórz .opm.json" : "Open .opm.json"}
              onClick={openFileFromDisk}
            >
              <svg viewBox="0 0 24 24">
                <path d="M3 5h6l2 2h10v12H3z" />
                <path d="M12 16v-6" />
                <path d="M9 13l3-3 3 3" />
              </svg>
            </button>
            <button
              type="button"
              title={pl ? "Zapisz .opm.json" : "Save .opm.json"}
              aria-label={pl ? "Zapisz .opm.json" : "Save .opm.json"}
              onClick={saveModelToDisk}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 4v11" />
                <path d="M7 10l5 5 5-5" />
                <path d="M5 19h14" />
              </svg>
            </button>
            <button
              type="button"
              title={pl ? "Eksportuj .md" : "Export .md"}
              aria-label={pl ? "Eksportuj .md" : "Export .md"}
              onClick={exportMarkdown}
            >
              <svg viewBox="0 0 24 24">
                <path d="M14 3H6v18h12V7z" />
                <path d="M14 3v4h4" />
              </svg>
            </button>
          </span>
        </header>
        <div id="opm-tree" className="opm-tree" role="tree">
          <div className="row opm-tree-group" role="treeitem">
            <span className="chevron">▾</span>
            <span className="ext">opm</span>
            <span className="name">{pl ? "Widoki modelu" : "Views"}</span>
          </div>
          {summary.views.map((v) => (
            <div
              key={v.id}
              className="row"
              style={{ paddingLeft: "20px" }}
              role="treeitem"
              onClick={() => {
                const trailFirst = document.querySelector(".opm-trail button") as HTMLButtonElement | null;
                if (v.id === "system" && trailFirst) trailFirst.click();
              }}
            >
              <span className="chevron" />
              <span className="ext">sd</span>
              <span className="name">{v.label}</span>
            </div>
          ))}
          {summary.stories.length > 0 && (
            <>
              <div className="row opm-tree-group" role="treeitem">
                <span className="chevron">▾</span>
                <span className="ext">mkg</span>
                <span className="name">{pl ? "Historie (Makigami)" : "Stories (Makigami)"}</span>
              </div>
              {summary.stories.map((s) => (
                <div
                  key={s.id}
                  className="row"
                  style={{ paddingLeft: "20px" }}
                  role="treeitem"
                  onClick={() => send({ type: "reveal", storyId: s.id })}
                >
                  <span className="chevron" />
                  <span className="ext">sty</span>
                  <span className="name">{s.title}</span>
                </div>
              ))}
            </>
          )}
          <div className="row opm-tree-group" role="treeitem">
            <span className="chevron">▾</span>
            <span className="ext">lib</span>
            <span className="name">{pl ? "Szablony i przykłady" : "Examples"}</span>
          </div>
          {PRESETS.map((p) => (
            <div
              key={p.id}
              className={`row${session.presetId === p.id ? " current" : ""}`}
              style={{ paddingLeft: "20px" }}
              role="treeitem"
              onClick={() => selectPreset(p.id)}
            >
              <span className="chevron" />
              <span className="ext">json</span>
              <span className="name">{pl ? p.labelPl : p.labelEn}</span>
            </div>
          ))}
        </div>
      </aside>
      <div
        id="opm-webapp-explorer-splitter"
        className="splitter"
        hidden={!explorerOpen}
        role="separator"
        aria-orientation="vertical"
      />
    </>
  );
}
