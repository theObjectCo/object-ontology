import {
  sanitizeFolderName,
  saveCloudSession,
  type CloudFileEntry,
  type CloudUserSession,
} from './cloudTypes';

let localRootHandle: any = null;
let localTargetSubfolderHandle: any = null;

export async function connectLocalSyncedFolder(folderName: string): Promise<CloudUserSession> {
  const w = window as unknown as { showDirectoryPicker?: (opts?: unknown) => Promise<any> };
  if (!w.showDirectoryPicker) {
    throw new Error(
      'Twoja przeglądarka nie obsługuje bezpośredniego dostępu do folderów (użyj Chrome/Edge lub logowania OAuth).',
    );
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

export async function listLocalFolderFiles(): Promise<CloudFileEntry[]> {
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

export async function saveLocalFolderFile(
  folderName: string,
  fileName: string,
  content: string,
): Promise<CloudFileEntry> {
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

export async function readLocalFolderFile(fileEntry: CloudFileEntry): Promise<string> {
  if (!localTargetSubfolderHandle) {
    throw new Error('Połącz ponownie folder dysku lokalnego.');
  }
  const fileHandle = await localTargetSubfolderHandle.getFileHandle(fileEntry.name);
  const file = await fileHandle.getFile();
  return await file.text();
}
