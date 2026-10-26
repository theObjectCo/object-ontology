import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cloudFixture, session } from './cloud-fixture.mjs';

test('OneDrive adapter preserves list/read/save transport and metadata', async () => {
  const f = cloudFixture(), connected = session('microsoft');
  f.responses.push({ data: { id: 'folder-id' } }, { data: { value: [
    { id: 'a/b', name: 'plan.json', size: 42, lastModifiedDateTime: '2026-01-01' },
  ] } });
  const [entry] = await f.api.listCloudFolderFiles(connected);
  assert.equal(entry.size, 42);
  assert.match(f.requests[1].url, /my%20plans.*children/);
  f.responses.push({ data: '{"name":"plan"}' });
  assert.equal(await f.api.readFileFromCloudFolder(connected, entry), '{"name":"plan"}');
  assert.match(f.requests[2].url, /items\/a%2Fb\/content$/);
  f.responses.push({ data: { id: 'folder-id' } }, { data: { id: 'saved', name: 'my plan.json', size: 99 } });
  const saved = await f.api.saveFileToCloudFolder(connected, 'my plan.json', '{}');
  assert.equal(saved.id, 'saved');
  assert.equal(saved.size, 99);
  assert.equal(f.requests[4].method, 'PUT');
  assert.match(f.requests[4].url, /my%20plans\/my%20plan.json/);
  assert.equal(f.requests[4].body, '{}');
  assert.equal(f.requests[4].headers.Authorization, 'Bearer synthetic-fixture-token');
  assert.equal(f.notifications.length, 1);
});

test('Google adapter lists and reads in the existing folder', async () => {
  const f = cloudFixture(), connected = session('google');
  f.responses.push({ data: { files: [{ id: 'a/b', name: 'plan.json', size: '17' }] } });
  const [entry] = await f.api.listCloudFolderFiles(connected);
  assert.equal(entry.size, 17);
  assert.equal(new URL(f.requests[0].url).searchParams.get('q'), "'folder-id' in parents and trashed = false");
  f.responses.push({ data: 'fixture' });
  assert.equal(await f.api.readFileFromCloudFolder(connected, entry), 'fixture');
  assert.match(f.requests[1].url, /files\/a%2Fb\?alt=media$/);
});

for (const existing of [true, false]) test(`Google save ${existing ? 'updates' : 'creates'} a file`, async () => {
  const f = cloudFixture();
  f.responses.push({ data: { files: existing ? [{ id: 'existing/id' }] : [] } },
    { data: { id: 'saved', name: 'plan.json', size: '25' } });
  const saved = await f.api.saveFileToCloudFolder(session('google'), 'plan.json', '{"name":"plan"}');
  assert.equal(saved.size, 25);
  assert.equal(f.requests[1].method, existing ? 'PATCH' : 'POST');
  if (existing) assert.match(f.requests[1].url, /existing%2Fid/);
  assert.match(f.requests[1].headers['Content-Type'], /^multipart\/related; boundary=/);
  assert.match(f.requests[1].body, /\{"name":"plan"\}/);
  assert.equal(f.requests[1].body.includes('"parents":["folder-id"]'), !existing);
  assert.equal(f.notifications[0].fileName, 'plan.json');
  assert.equal(f.responses.length, 0);
});

test('failed cloud saves propagate the error and emit no success notification', async () => {
  for (const provider of ['microsoft', 'google']) {
    const f = cloudFixture();
    f.responses.push({ data: provider === 'microsoft' ? { id: 'folder-id' } : { files: [] } },
      { ok: false, data: 'quota exceeded' });
    await assert.rejects(f.api.saveFileToCloudFolder(session(provider), 'plan.json', '{}'), /quota exceeded/);
    assert.equal(f.notifications.length, 0);
  }
});
