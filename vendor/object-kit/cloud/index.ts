import {
  sanitizeFolderName,
  type CloudFileEntry,
  type CloudUserSession,
} from './cloudTypes';
import {
  listOneDriveFiles,
  readOneDriveFile,
  saveOneDriveFile,
} from './microsoftEntraClient';
import {
  listGoogleDriveFiles,
  readGoogleDriveFile,
  saveGoogleDriveFile,
} from './googleDriveClient';
import {
  listLocalFolderFiles,
  readLocalFolderFile,
  saveLocalFolderFile,
} from './localFolderClient';
import { publishWorkspaceSync } from './workspaceSyncChannel';

export * from './cloudTypes';
export * from './oauthPopup';
export * from './microsoftEntraClient';
export * from './googleDriveClient';
export * from './localFolderClient';
export * from './workspaceSyncChannel';

export async function listCloudFolderFiles(session: CloudUserSession): Promise<CloudFileEntry[]> {
  const folderName = sanitizeFolderName(session.folderName);
  if (session.provider === 'microsoft') {
    return listOneDriveFiles(session, folderName);
  }
  if (session.provider === 'google') {
    return listGoogleDriveFiles(session, folderName);
  }
  if (session.provider === 'local_fs') {
    return listLocalFolderFiles();
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
  let entry: CloudFileEntry;
  if (session.provider === 'microsoft') {
    entry = await saveOneDriveFile(session, folderName, fileName, content, mimeType);
  } else if (session.provider === 'google') {
    entry = await saveGoogleDriveFile(session, folderName, fileName, content, mimeType);
  } else if (session.provider === 'local_fs') {
    entry = await saveLocalFolderFile(folderName, fileName, content);
  } else {
    throw new Error('Nieznany dostawca chmury.');
  }

  publishWorkspaceSync({
    type: 'PHENOME_WORKSPACE_FILE_SAVED',
    fileName,
    folderName,
    content,
  });

  return entry;
}

export async function readFileFromCloudFolder(
  session: CloudUserSession,
  fileEntry: CloudFileEntry,
): Promise<string> {
  if (session.provider === 'microsoft') {
    return readOneDriveFile(session, fileEntry);
  }
  if (session.provider === 'google') {
    return readGoogleDriveFile(session, fileEntry);
  }
  if (session.provider === 'local_fs') {
    return readLocalFolderFile(fileEntry);
  }
  throw new Error('Nieznany dostawca chmury.');
}
