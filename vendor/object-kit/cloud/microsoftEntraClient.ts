import {
  PKCE_VERIFIER_KEY,
  sanitizeFolderName,
  saveCloudSession,
  type CloudFileEntry,
  type CloudOAuthConfig,
  type CloudUserSession,
} from './cloudTypes';
import { generatePkcePair, waitForPopupCallback } from './oauthPopup';

export async function ensureOneDriveFolder(accessToken: string, folderName: string): Promise<string> {
  const clean = sanitizeFolderName(folderName);
  const checkResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(clean)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (checkResp.ok) {
    const existing = await checkResp.json();
    return existing.id;
  }

  const createResp = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: clean,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'Open',
    }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`Nie udało się utworzyć folderu „${clean}” na OneDrive: ${errText}`);
  }
  const created = await createResp.json();
  return created.id;
}

export async function loginWithMicrosoftEntra(cfg: CloudOAuthConfig): Promise<CloudUserSession> {
  if (!cfg.entraClientId.trim()) {
    throw new Error('Wpisz Microsoft Entra Client ID (Application ID typu SPA) w ustawieniach połączenia.');
  }

  const redirectUri = `${window.location.origin}/`;
  const { verifier, challenge } = await generatePkcePair();
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);

  const authUrl = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(cfg.entraTenantId || 'common')}/oauth2/v2.0/authorize`,
  );
  authUrl.searchParams.set('client_id', cfg.entraClientId.trim());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('scope', 'openid profile email User.Read Files.ReadWrite');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  const popup = window.open(authUrl.toString(), 'phenome_entra_login', 'width=520,height=680');
  if (!popup) {
    throw new Error('Przeglądarka zablokowała wyskakujące okno logowania Microsoft.');
  }

  const { search } = await waitForPopupCallback(popup);
  const params = new URLSearchParams(search);
  const err = params.get('error_description') || params.get('error');
  if (err) throw new Error(`Błąd Microsoft Entra: ${err}`);

  const code = params.get('code');
  if (!code) throw new Error('Brak kodu autoryzacyjnego z Microsoft Entra.');

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(cfg.entraTenantId || 'common')}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.entraClientId.trim(),
    scope: 'openid profile email User.Read Files.ReadWrite',
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });

  const tokenResp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description || tokenData.error || 'Nie udało się wymienić kodu PKCE na token Microsoft Graph.',
    );
  }

  const accessToken: string = tokenData.access_token;
  const expiresIn: number = Number(tokenData.expires_in) || 3600;

  const meResp = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const me = meResp.ok ? await meResp.json() : {};

  const folderName = sanitizeFolderName(cfg.folderName);
  const folderId = await ensureOneDriveFolder(accessToken, folderName);

  const session: CloudUserSession = {
    provider: 'microsoft',
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    userName: me.displayName || me.userPrincipalName || 'Użytkownik Microsoft',
    userEmail: me.mail || me.userPrincipalName || '',
    folderName,
    folderId,
  };
  saveCloudSession(session);
  return session;
}

export async function listOneDriveFiles(session: CloudUserSession, folderName: string): Promise<CloudFileEntry[]> {
  await ensureOneDriveFolder(session.accessToken, folderName);
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(folderName)}:/children?$select=id,name,size,lastModifiedDateTime,webUrl`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } },
  );
  if (!resp.ok) throw new Error('Nie udało się pobrać listy plików z OneDrive.');
  const data = await resp.json();
  return (data.value || []).map((item: Record<string, unknown>) => ({
    id: String(item.id || ''),
    name: String(item.name || ''),
    lastModified: String(item.lastModifiedDateTime || ''),
    size: Number(item.size) || 0,
    webUrl: item.webUrl ? String(item.webUrl) : undefined,
  }));
}

export async function saveOneDriveFile(
  session: CloudUserSession,
  folderName: string,
  fileName: string,
  content: string,
  mimeType: string,
): Promise<CloudFileEntry> {
  await ensureOneDriveFolder(session.accessToken, folderName);
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': `${mimeType};charset=utf-8`,
      },
      body: content,
    },
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Błąd zapisu na OneDrive: ${err}`);
  }
  const item = await resp.json();
  return {
    id: item.id,
    name: item.name,
    lastModified: item.lastModifiedDateTime || new Date().toISOString(),
    size: item.size || content.length,
    webUrl: item.webUrl,
  };
}

export async function readOneDriveFile(session: CloudUserSession, fileEntry: CloudFileEntry): Promise<string> {
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileEntry.id)}/content`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Nie udało się odczytać pliku ${fileEntry.name} z OneDrive.`);
  return await resp.text();
}
