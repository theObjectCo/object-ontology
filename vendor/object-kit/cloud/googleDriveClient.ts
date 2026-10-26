import {
  sanitizeFolderName,
  saveCloudSession,
  type CloudFileEntry,
  type CloudOAuthConfig,
  type CloudUserSession,
} from './cloudTypes';
import { waitForPopupCallback } from './oauthPopup';

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

export async function listGoogleDriveFiles(session: CloudUserSession, folderName: string): Promise<CloudFileEntry[]> {
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
  return (data.files || []).map((f: Record<string, unknown>) => ({
    id: String(f.id || ''),
    name: String(f.name || ''),
    lastModified: String(f.modifiedTime || ''),
    size: Number(f.size) || 0,
    webUrl: f.webViewLink ? String(f.webViewLink) : undefined,
  }));
}

export async function saveGoogleDriveFile(
  session: CloudUserSession,
  folderName: string,
  fileName: string,
  content: string,
  mimeType: string,
): Promise<CloudFileEntry> {
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

export async function readGoogleDriveFile(session: CloudUserSession, fileEntry: CloudFileEntry): Promise<string> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileEntry.id)}?alt=media`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } },
  );
  if (!resp.ok) throw new Error(`Nie udało się odczytać pliku ${fileEntry.name} z Google Drive.`);
  return await resp.text();
}
