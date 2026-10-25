// Client-side Cloud Drive connector for Phenome tools (map.phenome.object.pl, opm.phenome.object.pl, etc.)
// Supports:
//  1. Microsoft Entra ID (MSAL / OAuth 2.0 PKCE SPA) -> Microsoft Graph OneDrive API
//  2. Google Identity (OAuth 2.0 SPA) -> Google Drive API v3 (drive.file scope)
//  3. Local Synced Drive Folder (File System Access API showDirectoryPicker) -> OneDrive/GDrive desktop sync
// 100% browser-only (zero server backend).

export type CloudProvider = 'microsoft' | 'google' | 'local_fs';

export interface CloudUserSession {
  provider: CloudProvider;
  accessToken: string;
  expiresAt: number;
  userName: string;
  userEmail: string;
  folderName: string;
  folderId?: string;
}

export interface CloudOAuthConfig {
  entraClientId: string;
  entraTenantId: string;
  googleClientId: string;
  folderName: string;
}

export interface CloudFileEntry {
  id: string;
  name: string;
  lastModified: string;
  size: number;
  webUrl?: string;
}

const CONFIG_STORAGE_KEY = 'phenome_cloud_oauth_config_v1';
const SESSION_STORAGE_KEY = 'phenome_cloud_session_v1';
const PKCE_VERIFIER_KEY = 'phenome_pkce_verifier_v1';

export function handleOAuthPopupCallbackIfPresent(): boolean {
  if (typeof window === 'undefined' || !window.opener || window.opener === window) return false;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  if (search.has('code') || search.has('error') || hash.has('access_token') || hash.has('error')) {
    window.opener.postMessage(
      {
        type: 'PHENOME_OAUTH_CALLBACK',
        search: window.location.search,
        hash: window.location.hash,
        href: window.location.href,
      },
      window.location.origin,
    );
    window.close();
    return true;
  }
  return false;
}

export function loadCloudConfig(): CloudOAuthConfig {
  const defaults: CloudOAuthConfig = {
    entraClientId: '',
    entraTenantId: 'common',
    googleClientId: '',
    folderName: 'phenome',
  };
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CloudOAuthConfig>;
      return {
        entraClientId: parsed.entraClientId ?? defaults.entraClientId,
        entraTenantId: parsed.entraTenantId || 'common',
        googleClientId: parsed.googleClientId ?? defaults.googleClientId,
        folderName: sanitizeFolderName(parsed.folderName || 'phenome'),
      };
    }
  } catch {
    // ignore
  }
  return defaults;
}

export function saveCloudConfig(cfg: CloudOAuthConfig): CloudOAuthConfig {
  const normalized: CloudOAuthConfig = {
    entraClientId: cfg.entraClientId.trim(),
    entraTenantId: cfg.entraTenantId.trim() || 'common',
    googleClientId: cfg.googleClientId.trim(),
    folderName: sanitizeFolderName(cfg.folderName || 'phenome'),
  };
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore
  }
  return normalized;
}

export function loadCloudSession(): CloudUserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudUserSession;
    if (parsed.provider !== 'local_fs' && parsed.expiresAt && Date.now() > parsed.expiresAt) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCloudSession(session: CloudUserSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore
  }
}

export function sanitizeFolderName(name: string): string {
  const cleaned = name.trim().replace(/[\\:*?"<>|]+/g, '-').replace(/^\/+|\/+$/g, '');
  return cleaned || 'phenome';
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64UrlEncode(random);
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

function waitForPopupCallback(popup: Window): Promise<{ search: string; hash: string }> {
  return new Promise((resolve, reject) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        window.removeEventListener('message', onMsg);
        reject(new Error('Okno logowania zostało zamknięte przed zakończeniem autoryzacji.'));
      }
    }, 500);

    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data && ev.data.type === 'PHENOME_OAUTH_CALLBACK') {
        window.clearInterval(timer);
        window.removeEventListener('message', onMsg);
        resolve({ search: ev.data.search || '', hash: ev.data.hash || '' });
      }
    };

    window.addEventListener('message', onMsg);
  });
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
    throw new Error(tokenData.error_description || tokenData.error || 'Nie udało się wymienić kodu PKCE na token Microsoft Graph.');
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

export async function loginWithGoogleDrive(cfg: CloudOAuthConfig): Promise<CloudUserSession> {
  if (!cfg.googleClientId.trim()) {
    throw new Error('Wpisz Google OAuth Client ID (Web application) w ustawieniach połączenia.');
  }

  const redirectUri = `${window.location.origin}/`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', cfg.googleClientId.trim());
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set(
    'scope',
    'openid profile email https://www.googleapis.com/auth/drive.file',
  );
  authUrl.searchParams.set('prompt', 'select_account');

  const popup = window.open(authUrl.toString(), 'phenome_google_login', 'width=520,height=680');
  if (!popup) {
    throw new Error('Przeglądarka zablokowała wyskakujące okno logowania Google.');
  }

  const { hash } = await waitForPopupCallback(popup);
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const err = params.get('error_description') || params.get('error');
  if (err) throw new Error(`Błąd logowania Google: ${err}`);

  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error('Brak tokenu dostępowego z Google OAuth.');
  const expiresIn = Number(params.get('expires_in')) || 3600;

  const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const user = userResp.ok ? await userResp.json() : {};

  const folderName = sanitizeFolderName(cfg.folderName);
  const folderId = await ensureGoogleDriveFolder(accessToken, folderName);

  const session: CloudUserSession = {
    provider: 'google',
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    userName: user.name || user.email || 'Użytkownik Google',
    userEmail: user.email || '',
    folderName,
    folderId,
  };
  saveCloudSession(session);
  return session;
}

export async function ensureGoogleDriveFolder(accessToken: string, folderName: string): Promise<string> {
  const clean = sanitizeFolderName(folderName).replace(/'/g, '');
  const q = `name = '${clean}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;
  const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
  searchUrl.searchParams.set('q', q);
  searchUrl.searchParams.set('fields', 'files(id, name)');

  const searchResp = await fetch(searchUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (searchResp.ok) {
    const data = await searchResp.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: clean,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    }),
  });
  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`Nie udało się utworzyć folderu „${clean}” na Google Drive: ${errText}`);
  }
  const created = await createResp.json();
  return created.id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let localRootHandle: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let localTargetSubfolderHandle: any = null;

export async function connectLocalSyncedFolder(folderName: string): Promise<CloudUserSession> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as unknown as { showDirectoryPicker?: (opts?: unknown) => Promise<any> };
  if (!w.showDirectoryPicker) {
    throw new Error('Twoja przeglądarka nie obsługuje bezpośredniego dostępu do folderów (użyj Chrome/Edge lub logowania OAuth).');
  }
  const parentHandle = await w.showDirectoryPicker({ mode: 'readwrite' });
  const clean = sanitizeFolderName(folderName);
  const subHandle = await parentHandle.getDirectoryHandle(clean, { create: true });
  localRootHandle = parentHandle;
  localTargetSubfolderHandle = subHandle;

  const session: CloudUserSession = {
    provider: 'local_fs',
    accessToken: 'local_fs',
    expiresAt: Date.now() + 12 * 3600 * 1000,
    userName: `Dysk lokalny (${parentHandle.name})`,
    userEmail: `${parentHandle.name}/${clean}`,
    folderName: clean,
    folderId: clean,
  };
  saveCloudSession(session);
  return session;
}

export async function listCloudFolderFiles(session: CloudUserSession): Promise<CloudFileEntry[]> {
  const folderName = sanitizeFolderName(session.folderName);

  if (session.provider === 'microsoft') {
    await ensureOneDriveFolder(session.accessToken, folderName);
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(folderName)}:/children?$select=id,name,size,lastModifiedDateTime,webUrl`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    );
    if (!resp.ok) throw new Error('Nie udało się pobrać listy plików z OneDrive.');
    const data = await resp.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.value || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      lastModified: item.lastModifiedDateTime || '',
      size: item.size || 0,
      webUrl: item.webUrl,
    }));
  }

  if (session.provider === 'google') {
    const folderId = session.folderId || (await ensureGoogleDriveFolder(session.accessToken, folderName));
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
    url.searchParams.set('fields', 'files(id,name,size,modifiedTime,webViewLink)');
    url.searchParams.set('orderBy', 'modifiedTime desc');

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!resp.ok) throw new Error('Nie udało się pobrać listy plików z Google Drive.');
    const data = await resp.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      lastModified: f.modifiedTime || '',
      size: Number(f.size) || 0,
      webUrl: f.webViewLink,
    }));
  }

  if (session.provider === 'local_fs') {
    if (!localTargetSubfolderHandle) {
      throw new Error('Wskaż ponownie folder dysku lokalnego (uprawnienia sesji przeglądarki wygasły po przeładowaniu).');
    }
    const out: CloudFileEntry[] = [];
    for await (const [name, handle] of localTargetSubfolderHandle.entries()) {
      if (handle.kind === 'file') {
        const file = await handle.getFile();
        out.push({
          id: name,
          name,
          lastModified: new Date(file.lastModified).toISOString(),
          size: file.size,
        });
      }
    }
    return out.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  }

  return [];
}

export async function saveFileToCloudFolder(
  session: CloudUserSession,
  fileName: string,
  content: string,
  mimeType = 'application/json',
): Promise<CloudFileEntry> {
  const folderName = sanitizeFolderName(session.folderName);

  if (session.provider === 'microsoft') {
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

  if (session.provider === 'google') {
    const folderId = session.folderId || (await ensureGoogleDriveFolder(session.accessToken, folderName));
    const cleanFile = fileName.replace(/'/g, '');
    const qUrl = new URL('https://www.googleapis.com/drive/v3/files');
    qUrl.searchParams.set('q', `'${folderId}' in parents and name = '${cleanFile}' and trashed = false`);
    qUrl.searchParams.set('fields', 'files(id,name)');
    const qResp = await fetch(qUrl.toString(), {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const qData = qResp.ok ? await qResp.json() : { files: [] };
    const existingId: string | undefined = qData.files?.[0]?.id;

    const boundary = 'phenome_multipart_boundary_' + Date.now();
    const metadata = existingId
      ? { name: fileName, mimeType }
      : { name: fileName, mimeType, parents: [folderId] };

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const uploadUrl = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id,name,size,modifiedTime,webViewLink`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime,webViewLink';

    const upResp = await fetch(uploadUrl, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    if (!upResp.ok) {
      const err = await upResp.text();
      throw new Error(`Błąd zapisu na Google Drive: ${err}`);
    }
    const saved = await upResp.json();
    return {
      id: saved.id,
      name: saved.name,
      lastModified: saved.modifiedTime || new Date().toISOString(),
      size: Number(saved.size) || content.length,
      webUrl: saved.webViewLink,
    };
  }

  if (session.provider === 'local_fs') {
    if (!localTargetSubfolderHandle && localRootHandle) {
      localTargetSubfolderHandle = await localRootHandle.getDirectoryHandle(folderName, { create: true });
    }
    if (!localTargetSubfolderHandle) {
      throw new Error('Połącz ponownie folder dysku lokalnego przed zapisem.');
    }
    const fileHandle = await localTargetSubfolderHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return {
      id: fileName,
      name: fileName,
      lastModified: new Date().toISOString(),
      size: content.length,
    };
  }

  throw new Error('Nieznany dostawca chmury.');
}

export async function readFileFromCloudFolder(session: CloudUserSession, fileEntry: CloudFileEntry): Promise<string> {
  if (session.provider === 'microsoft') {
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileEntry.id)}/content`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    );
    if (!resp.ok) throw new Error(`Nie udało się odczytać pliku ${fileEntry.name} z OneDrive.`);
    return await resp.text();
  }

  if (session.provider === 'google') {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileEntry.id)}?alt=media`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } },
    );
    if (!resp.ok) throw new Error(`Nie udało się odczytać pliku ${fileEntry.name} z Google Drive.`);
    return await resp.text();
  }

  if (session.provider === 'local_fs') {
    if (!localTargetSubfolderHandle) {
      throw new Error('Połącz ponownie folder dysku lokalnego.');
    }
    const fileHandle = await localTargetSubfolderHandle.getFileHandle(fileEntry.name);
    const file = await fileHandle.getFile();
    return await file.text();
  }

  throw new Error('Nieznany dostawca chmury.');
}
