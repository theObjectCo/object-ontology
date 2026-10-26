import { useSyncExternalStore } from "react";

// The document bridge owns session/undo state outside React. A revision notifies
// both chrome roots after a bridge operation, cloud login or settings change.
let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => revision;

export function notifyChromeChange() {
  revision++;
  for (const listener of listeners) listener();
}

export function useChromeRevision() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
