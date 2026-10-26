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
export const PKCE_VERIFIER_KEY = 'phenome_pkce_verifier_v1';

export function sanitizeFolderName(name: string): string {
  const cleaned = name.trim().replace(/[\\:*?"<>|]+/g, '-').replace(/^\/+|\/+$/g, '');
  return cleaned || 'phenome';
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
    // ignore storage errors
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
    // ignore storage errors
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
    // ignore storage errors
  }
}
