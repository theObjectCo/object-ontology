// Shared cloud implementation, pinned and verified in vendor/object-kit/SOURCE.json.
export {
  handleOAuthPopupCallbackIfPresent, loadCloudConfig, saveCloudConfig,
  loadCloudSession, saveCloudSession, sanitizeFolderName,
  loginWithMicrosoftEntra, loginWithGoogleDrive,
  ensureOneDriveFolder, ensureGoogleDriveFolder, connectLocalSyncedFolder,
  listCloudFolderFiles, saveFileToCloudFolder, readFileFromCloudFolder,
  type CloudProvider, type CloudUserSession, type CloudOAuthConfig, type CloudFileEntry,
} from '../../vendor/object-kit/cloud';
