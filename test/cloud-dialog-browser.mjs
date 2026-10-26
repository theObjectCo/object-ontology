import assert from 'node:assert/strict';

// Real React controls, synthetic local-file handles: no cloud account or disk writes.
export async function checkCloudDialog(page) {
  await page.click('#opm-webapp-btn-cloud');
  await page.waitForSelector('#opm-webapp-cloud-modal');
  if (await page.$('#opm-wa-cloud-logout')) {
    await page.click('#opm-wa-cloud-logout');
    await page.waitForFunction(() => !document.getElementById('opm-wa-cloud-logout'));
  }
  assert.equal(await page.evaluate(() => localStorage.getItem('phenome_cloud_session_v1')), null);
  assert.equal(await page.$('#opm-wa-save-opm-cloud'), null);
  await page.evaluate(() => {
    const contents = new Map();
    window.__cloudSaved = {};
    window.__cloudFail = false;
    const fileHandle = name => ({
      kind: 'file',
      getFile: async () => new File([contents.get(name) || ''], name),
      createWritable: async () => ({
        write: async text => {
          if (window.__cloudFail) throw new Error('Fixture write denied');
          contents.set(name, text);
          window.__cloudSaved[name] = text;
        },
        close: async () => {},
      }),
    });
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => ({
      name: 'Synthetic folder',
      getDirectoryHandle: async name => {
        window.__cloudFolder = name;
        return {
          getFileHandle: async name => fileHandle(name),
          async *entries() { for (const name of contents.keys()) yield [name, fileHandle(name)]; },
        };
      },
    }) });
  });
  await page.click('#opm-wa-cloud-folder', { clickCount: 3 });
  await page.type('#opm-wa-cloud-folder', ' /plans?review/ ');
  await page.click('#opm-wa-login-local');
  await page.waitForSelector('#opm-wa-save-opm-cloud');
  assert.equal(await page.evaluate(() => window.__cloudFolder), 'plans-review');
  await page.click('#opm-wa-save-opm-cloud');
  await page.waitForFunction(() => window.__cloudSaved['native-fixture.opm.json']);
  assert.equal(await page.evaluate(() => JSON.parse(window.__cloudSaved['native-fixture.opm.json']).name), 'Native fixture');
  await page.waitForFunction(() => !document.getElementById('opm-wa-save-md-cloud').disabled);
  await page.click('#opm-wa-save-md-cloud');
  await page.waitForFunction(() => window.__cloudSaved['native-fixture.md']);
  assert(await page.evaluate(() => window.__cloudSaved['native-fixture.md'].includes('Native fixture')));
  await page.waitForFunction(() => document.querySelectorAll('.opm-wa-cloud-row').length === 2);
  await page.evaluate(() => { window.__cloudFail = true; });
  await page.click('#opm-wa-save-opm-cloud');
  await page.waitForFunction(() => document.getElementById('opm-wa-cloud-status').textContent.includes('Fixture write denied'));
  assert.equal(await page.$eval('#opm-wa-save-opm-cloud', el => el.disabled), false);
  await page.click('#opm-wa-cloud-close');
  await page.waitForFunction(() => !document.getElementById('opm-webapp-cloud-modal'));
  await page.click('#opm-webapp-btn-cloud');
  await page.waitForFunction(() => document.querySelectorAll('.opm-wa-cloud-row').length === 2);
  await page.click('[data-cloud-load]');
  await page.waitForFunction(() => !document.getElementById('opm-webapp-cloud-modal'));
  assert.equal(await page.$eval('#opm-webapp-filename', el => el.textContent), 'native-fixture.opm.json');
  console.log('PASS cloud dialog focus, local connection, normalized config, JSON/Markdown save, error recovery and reopening');
}
