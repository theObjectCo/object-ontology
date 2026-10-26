export interface WorkspaceSyncMessage {
  type: 'PHENOME_WORKSPACE_FILE_SAVED' | 'PHENOME_WORKSPACE_SESSION_CHANGED';
  fileName?: string;
  folderName?: string;
  content?: string;
  timestamp: number;
  sourceApp?: string;
}

const CHANNEL_NAME = 'phenome-workspace';

export function publishWorkspaceSync(msg: Omit<WorkspaceSyncMessage, 'timestamp'>): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ ...msg, timestamp: Date.now() });
    ch.close();
  } catch {
    // ignore BroadcastChannel errors
  }
}

export function subscribeWorkspaceSync(onMessage: (msg: WorkspaceSyncMessage) => void): () => void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return () => {};
  }
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    const handler = (ev: MessageEvent<WorkspaceSyncMessage>) => {
      if (ev.data && typeof ev.data.type === 'string') {
        onMessage(ev.data);
      }
    };
    ch.addEventListener('message', handler);
    return () => {
      ch.removeEventListener('message', handler);
      ch.close();
    };
  } catch {
    return () => {};
  }
}
