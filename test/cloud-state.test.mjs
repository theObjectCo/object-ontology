import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloudFixture, session } from './cloud-fixture.mjs';

test('existing configuration and session storage remain compatible', () => {
  const { api, storage } = cloudFixture();
  assert.equal(api.loadCloudConfig().folderName, 'phenome');
  storage.set('phenome_cloud_oauth_config_v1', '{bad JSON');
  assert.equal(api.loadCloudConfig().entraTenantId, 'common');
  const cfg = api.saveCloudConfig({ entraClientId: ' id ', entraTenantId: '',
    googleClientId: ' google ', folderName: ' /plans?/' });
  assert.equal(cfg.folderName, 'plans-');
  assert.equal(api.loadCloudConfig().entraClientId, 'id');
  api.saveCloudSession({ ...session('google'), expiresAt: 1 });
  assert.equal(api.loadCloudSession(), null);
  assert.equal(storage.has('phenome_cloud_session_v1'), false);
  api.saveCloudSession({ ...session('local_fs'), expiresAt: 1 });
  assert.equal(api.loadCloudSession().provider, 'local_fs');
  api.saveCloudSession(null);
  assert.equal(api.loadCloudSession(), null);
});

test('popup callbacks remain isolated across concurrent logins', async () => {
  const f = cloudFixture();
  const first = { closed: false }, second = { closed: false };
  let receivedFirst = false, receivedSecond = false;
  const a = f.api.waitForPopupCallback(first).then(() => { receivedFirst = true; });
  const b = f.api.waitForPopupCallback(second).then(() => { receivedSecond = true; });
  f.send(first, 'https://other.example.test');
  f.send({ closed: false });
  await Promise.resolve();
  assert.equal(receivedFirst, false);
  assert.equal(receivedSecond, false);
  f.send(first);
  await a;
  assert.equal(receivedSecond, false);
  second.closed = true;
  for (const tick of [...f.timers]) tick();
  await assert.rejects(b, /zamknięte/);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
});

test('local folder lists, writes and reads without network access', async () => {
  const f = cloudFixture();
  await assert.rejects(f.api.listCloudFolderFiles(session('local_fs')), /ponownie/);
  const files = new Map([['older.json', { content: '{}', time: 1000 }]]);
  const handle = name => ({ kind: 'file',
    getFile: async () => ({ size: files.get(name).content.length,
      lastModified: files.get(name).time, text: async () => files.get(name).content }),
    createWritable: async () => ({
      write: async content => files.set(name, { content, time: 2000 }), close: async () => {},
    }),
  });
  f.window.showDirectoryPicker = async options => {
    assert.equal(options.mode, 'readwrite');
    return { name: 'Synced drive', getDirectoryHandle: async (name, options) => {
      assert.equal(name, 'plans');
      assert.equal(options.create, true);
      return {
        getFileHandle: async name => handle(name),
        async *entries() {
          yield ['directory', { kind: 'directory' }];
          for (const name of files.keys()) yield [name, handle(name)];
        },
      };
    } };
  };
  const connected = await f.api.connectLocalSyncedFolder('/plans/');
  const saved = await f.api.saveFileToCloudFolder(connected, 'new.json', '{"name":"fixture"}');
  assert.equal(await f.api.readFileFromCloudFolder(connected, saved), '{"name":"fixture"}');
  const listed = await f.api.listCloudFolderFiles(connected);
  assert.deepEqual(Array.from(listed, file => file.name), ['new.json', 'older.json']);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].type, 'PHENOME_WORKSPACE_FILE_SAVED');
  assert.equal(f.notifications[0].content, '{"name":"fixture"}');
  assert.equal(f.requests.length, 0);
});
