import { StudioHeader } from "../../../vendor/object-kit/components/studio/StudioHeader";
import { loadCloudSession } from "../cloudDrive";
import { saveToCloud, selectPreset, toggleLanguage, toggleTheme } from "./chromeActions";
import { useChromeRevision } from "./chromeState";
import { jsonPaneOpen, toggleJsonPane } from "./chromeView";
import { toggleCloudModal } from "./cloudModal";
import { redo, undo } from "./document";
import { exportMarkdown } from "./exports";
import { openFileFromDisk, saveModelToDisk } from "./files";
import { PRESETS } from "./presets";
import { redoStack, session, undoStack } from "./session";

export function WebAppHeader() {
  useChromeRevision();
  const pl = session.lang === "pl";
  const cloud = loadCloudSession();
  const provider = cloud?.provider === "microsoft" ? "OneDrive"
    : cloud?.provider === "google" ? "GDrive" : "Dysk";
  const cloudLabel = cloud ? `☁ ${provider}: /${cloud.folderName}` : pl ? "☁ Chmura" : "☁ Cloud";
  return <StudioHeader
    className="opm-studio-header"
    logo={<strong>OPM / Makigami Studio</strong>}
    breadcrumb={<div className="opm-wa-model">
      <select id="opm-webapp-preset" className="opm-wa-select" title="Model / Template"
        value={PRESETS.some(p => p.id === session.presetId) ? session.presetId : "custom"}
        onChange={event => selectPreset(event.target.value)}>
        {PRESETS.map(p => <option key={p.id} value={p.id}>{pl ? p.labelPl : p.labelEn}</option>)}
        <option value="custom" hidden>Custom File</option>
      </select>
      <span id="opm-webapp-filename" className="opm-wa-filename">{session.fileName}</span>
    </div>}
    rightTools={<>
      <button id="opm-webapp-btn-undo" className="opm-wa-btn" title="Undo (Ctrl+Z)"
        disabled={!undoStack.length} onClick={undo}>↶</button>
      <button id="opm-webapp-btn-redo" className="opm-wa-btn" title="Redo (Ctrl+Y)"
        disabled={!redoStack.length} onClick={redo}>↷</button>
      <span className="opm-wa-sep" />
      <button id="opm-webapp-btn-open" className="opm-wa-btn" onClick={openFileFromDisk}>
        {pl ? "Otwórz .opm.json" : "Open .opm.json"}</button>
      <button id="opm-webapp-btn-save" className="opm-wa-btn opm-wa-btn-primary" onClick={saveModelToDisk}>
        {pl ? "Zapisz .opm.json" : "Save .opm.json"}</button>
      {cloud && <button id="opm-webapp-btn-cloud-save" className="opm-wa-btn opm-wa-btn-primary" onClick={saveToCloud}>
        {pl ? "☁ Zapisz w chmurze" : "☁ Save to Cloud"}</button>}
      <button id="opm-webapp-btn-cloud" className={`opm-wa-btn${cloud ? " active" : ""}`}
        title="OneDrive (Microsoft Entra) / Google Drive" onClick={() => toggleCloudModal()}>{cloudLabel}</button>
      <button id="opm-webapp-btn-md" className="opm-wa-btn" onClick={exportMarkdown}>
        {pl ? "Eksportuj .md" : "Export .md"}</button>
      <button id="opm-webapp-btn-json" className={`opm-wa-btn${jsonPaneOpen ? " active" : ""}`}
        aria-pressed={jsonPaneOpen} title="Live .opm.json source editor" onClick={() => toggleJsonPane()}>{"{ } JSON"}</button>
      <span className="opm-wa-sep" />
      <button id="opm-webapp-btn-lang" className="opm-wa-btn" title="Switch language (PL / EN)"
        onClick={toggleLanguage}>{session.lang.toUpperCase()}</button>
      <button id="opm-webapp-btn-theme" className="opm-wa-btn" title="Switch theme (Dark / Light)"
        onClick={toggleTheme}>{session.theme === "vscode-light" ? "☀" : "☾"}</button>
    </>}
  />;
}
