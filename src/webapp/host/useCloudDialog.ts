import { useEffect, useRef, useState } from "react";
import {
  type CloudFileEntry, type CloudUserSession, connectLocalSyncedFolder,
  listCloudFolderFiles, loadCloudConfig, loadCloudSession, loginWithGoogleDrive,
  loginWithMicrosoftEntra, saveCloudConfig, saveCloudSession,
} from "../cloudDrive";
import { updateHeaderUi } from "./chromeView";
import { loadCloudDocument, saveCloudDocument } from "./cloudDocument";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useCloudDialog(onClose: () => void) {
  const [config, setConfig] = useState(loadCloudConfig);
  const [cloud, setCloud] = useState(loadCloudSession);
  const [files, setFiles] = useState<CloudFileEntry[]>([]);
  const [status, setStatus] = useState("");
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const active = useRef(true);
  // Imperative guard also blocks a second click before React commits disabled.
  const operation = useRef(false);

  async function refresh(current: CloudUserSession | null = cloud) {
    const request = ++generation.current;
    setFiles([]);
    setListError("");
    if (!current) { setLoading(false); return; }
    setLoading(true);
    try {
      const next = await listCloudFolderFiles(current);
      if (active.current && request === generation.current) setFiles(next);
    } catch (error) {
      if (active.current && request === generation.current) setListError(message(error));
    } finally {
      if (active.current && request === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    active.current = true;
    void refresh(loadCloudSession());
    return () => { active.current = false; generation.current++; };
  }, []);

  async function run(action: () => Promise<void>, label = "") {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setStatus(label);
    try { await action(); }
    catch (error) { if (active.current) setStatus(message(error)); }
    finally {
      operation.current = false;
      if (active.current) setBusy(false);
    }
  }

  function connect(provider: "microsoft" | "google" | "local_fs") {
    // Start OAuth/picker synchronously inside the user gesture.
    void run(async () => {
      const nextConfig = saveCloudConfig(config);
      setConfig(nextConfig);
      const next = provider === "microsoft" ? await loginWithMicrosoftEntra(nextConfig)
        : provider === "google" ? await loginWithGoogleDrive(nextConfig)
          : await connectLocalSyncedFolder(nextConfig.folderName);
      updateHeaderUi();
      if (!active.current) return;
      setCloud(next);
      setStatus("");
      await refresh(next);
    }, provider === "local_fs" ? "Wybieranie folderu…" : "Logowanie…");
  }

  function logout() {
    saveCloudSession(null);
    setCloud(null);
    setStatus("");
    updateHeaderUi();
    void refresh(null);
  }

  function save(markdown: boolean) {
    const current = loadCloudSession();
    if (!current) return;
    void run(async () => {
      if (!markdown) {
        const nextConfig = saveCloudConfig(config);
        setConfig(nextConfig);
        current.folderName = nextConfig.folderName;
        saveCloudSession(current);
        setCloud(current);
      }
      const saved = await saveCloudDocument(current, markdown);
      if (!active.current) return;
      setStatus(saved);
      await refresh(current);
    }, "Zapisywanie…");
  }

  function load(entry: CloudFileEntry) {
    const current = loadCloudSession();
    if (!current) return;
    void run(async () => {
      await loadCloudDocument(current, entry);
      if (active.current) onClose();
    }, `Wczytywanie ${entry.name}…`);
  }

  return { config, setConfig, cloud, files, status, listError, loading, busy, connect, logout, save, load,
    refresh: () => void refresh() };
}
