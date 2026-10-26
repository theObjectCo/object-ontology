import { CloudUserSession, loadCloudConfig } from "../cloudDrive";
import { session } from "./session";

// Treat cloud names, account labels and stored configuration as text.
export const escapeHtml = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]!));

export const cloudLink = (value: string | undefined): string => {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? escapeHtml(url.href) : "";
  } catch { return ""; }
};

export function closeCloudModal() {
  document.getElementById("opm-webapp-cloud-modal")?.classList.remove("open");
}

export function cloudModalMarkup(cfg: ReturnType<typeof loadCloudConfig>, cs: CloudUserSession | null): string {
  return `
    <div class="opm-wa-modal" role="dialog" aria-modal="true">
      <div class="opm-wa-modal-head">
        <div>
          <strong>☁ Chmura Konsultanta (OneDrive / Google Drive) — 100% Client-Side</strong>
          <div class="opm-wa-modal-sub">Wspólny folder z map.phenome.object.pl (domyślnie <code>/${escapeHtml(cfg.folderName)}</code>)</div>
        </div>
        <button type="button" id="opm-wa-cloud-close" class="opm-wa-btn">✕</button>
      </div>
      <div class="opm-wa-modal-body">
        <div class="opm-wa-cloud-grid">
          <label>
            <span>Nazwa folderu na OneDrive / Google Drive</span>
            <input id="opm-wa-cloud-folder" class="opm-wa-input" value="${escapeHtml(cfg.folderName)}" placeholder="phenome" />
          </label>
          <label>
            <span>Microsoft Entra Client ID (opcjonalnie SPA)</span>
            <input id="opm-wa-cloud-entra" class="opm-wa-input" value="${escapeHtml(cfg.entraClientId)}" placeholder="00000000-0000-0000-0000-000000000000" />
          </label>
          <label>
            <span>Google OAuth Client ID (opcjonalnie Web)</span>
            <input id="opm-wa-cloud-google" class="opm-wa-input" value="${escapeHtml(cfg.googleClientId)}" placeholder="1234567890-abc.apps.googleusercontent.com" />
          </label>
        </div>

        <div class="opm-wa-cloud-providers">
          <button type="button" id="opm-wa-login-ms" class="opm-wa-btn opm-wa-btn-primary">⊞ Zaloguj Microsoft (OneDrive)</button>
          <button type="button" id="opm-wa-login-google" class="opm-wa-btn opm-wa-btn-primary">◉ Zaloguj Google (Google Drive)</button>
          <button type="button" id="opm-wa-login-local" class="opm-wa-btn">📁 Wskaż folder lokalny OneDrive / GDrive</button>
          ${cs ? `<button type="button" id="opm-wa-cloud-logout" class="opm-wa-btn">Wyloguj (${escapeHtml(cs.userName)})</button>` : ""}
        </div>

        <div id="opm-wa-cloud-status" class="opm-wa-cloud-status">
          ${cs ? `Połączono: ${escapeHtml(cs.userName)} • Folder: /${escapeHtml(cs.folderName)}` : "Nie połączono z dyskiem chmurowym."}
        </div>

        ${
          cs
            ? `<div class="opm-wa-cloud-save-bar">
                <button type="button" id="opm-wa-save-opm-cloud" class="opm-wa-btn opm-wa-btn-primary">☁ Zapisz ${escapeHtml(session.fileName)} w /${escapeHtml(cs.folderName)}</button>
                <button type="button" id="opm-wa-save-md-cloud" class="opm-wa-btn">☁ Zapisz dokumentację .md w /${escapeHtml(cs.folderName)}</button>
                <button type="button" id="opm-wa-refresh-cloud" class="opm-wa-btn">↻ Odśwież listę</button>
              </div>`
            : ""
        }

        <div id="opm-wa-cloud-files" class="opm-wa-cloud-files"></div>
      </div>
    </div>
  `;
}
