import type { CloudOAuthConfig } from "../cloudDrive";

export function CloudSettings({ config, onChange, disabled }: {
  config: CloudOAuthConfig; onChange: (config: CloudOAuthConfig) => void; disabled: boolean;
}) {
  return <fieldset className="opm-wa-cloud-grid" disabled={disabled}>
    <legend className="opm-wa-sr-only">Ustawienia połączenia</legend>
    <label><span>Nazwa folderu na OneDrive / Google Drive</span>
      <input id="opm-wa-cloud-folder" className="opm-wa-input" value={config.folderName} placeholder="phenome"
        onChange={e => onChange({ ...config, folderName: e.target.value })} /></label>
    <label><span>Microsoft Entra Client ID (opcjonalnie SPA)</span>
      <input id="opm-wa-cloud-entra" className="opm-wa-input" value={config.entraClientId} placeholder="00000000-0000-0000-0000-000000000000"
        onChange={e => onChange({ ...config, entraClientId: e.target.value })} /></label>
    <label><span>Google OAuth Client ID (opcjonalnie Web)</span>
      <input id="opm-wa-cloud-google" className="opm-wa-input" value={config.googleClientId} placeholder="1234567890-abc.apps.googleusercontent.com"
        onChange={e => onChange({ ...config, googleClientId: e.target.value })} /></label>
  </fieldset>;
}
