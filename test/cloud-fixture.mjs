import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['vendor/object-kit/cloud/index.ts'], bundle: true, write: false,
  platform: 'browser', format: 'cjs', target: 'es2022',
});

export function cloudFixture() {
  const storage = new Map(), listeners = new Set(), timers = new Set();
  const requests = [], responses = [], notifications = [];
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  const window = {
    location: { origin: 'https://opm.example.test', search: '', hash: '' },
    setInterval: fn => (timers.add(fn), fn), clearInterval: fn => timers.delete(fn),
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const module = { exports: {} };
  runInNewContext(outputFiles[0].text, {
    module, exports: module.exports, window, localStorage, sessionStorage: localStorage,
    crypto: webcrypto, URL, URLSearchParams, TextEncoder, btoa,
    BroadcastChannel: class {
      postMessage(value) { notifications.push(value); }
      close() {}
    },
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), ...options });
      assert.ok(responses.length, `unexpected request: ${url}`);
      const { ok = true, data = {} } = responses.shift();
      return { ok, json: async () => data, text: async () => String(data) };
    },
  });
  return {
    api: module.exports, window, storage, requests, responses, notifications, listeners, timers,
    send(source, origin = window.location.origin) {
      for (const fn of [...listeners]) fn({ origin, source,
        data: { type: 'PHENOME_OAUTH_CALLBACK', search: '?code=fixture', hash: '' } });
    },
  };
}

export const session = provider => ({
  provider, accessToken: 'synthetic-fixture-token', expiresAt: Date.now() + 60000,
  userName: 'Fixture', userEmail: '', folderName: 'my plans', folderId: 'folder-id',
});
