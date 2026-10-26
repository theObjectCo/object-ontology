import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve('dist/web');
const server = createServer((req, res) => {
  const file = resolve(root, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'), headless: true });
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const malicious = '<img src=x onerror="window.__injected=1">';
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().startsWith('https://www.googleapis.com/drive/v3/files')) {
      const payload = request.url().includes('alt=media')
        ? { name: 'Cloud fixture', objects: {}, processes: {} }
        : { files: [{ id: 'fixture', name: malicious + '.json', size: 100, webViewLink: 'javascript:window.__injected=2' }] };
      return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-allow-methods': 'GET, OPTIONS' }, body: JSON.stringify(payload) });
    }
    if (request.url().startsWith('http://127.0.0.1:')) return request.continue();
    return request.abort();
  });
  await page.evaluateOnNewDocument(value => {
    window.__hostMessages = [];
    window.addEventListener('message', event => window.__hostMessages.push(event.data));
    localStorage.setItem('phenome_cloud_session_v1', JSON.stringify({ provider: 'google', accessToken: 'synthetic-only', expiresAt: Date.now() + 3600000, userName: value, userEmail: '', folderName: 'phenome', folderId: 'fixture' }));
  }, malicious);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.click('#opm-webapp-btn-cloud');
  await page.waitForSelector('.opm-wa-cloud-row');
  assert.equal(await page.$eval('#opm-webapp-cloud-modal', el => el.querySelectorAll('img,script').length), 0, 'cloud strings must remain text');
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  assert.equal(await page.$eval('.opm-wa-cloud-row strong', el => el.textContent), malicious + '.json');
  assert.equal(await page.$eval('.opm-wa-cloud-row', el => el.querySelectorAll('a[href^="javascript:"]').length), 0);
  await page.click('[data-cloud-load="0"]');
  await page.waitForFunction(() => !document.getElementById('opm-webapp-cloud-modal').classList.contains('open'));
  await page.click('#opm-webapp-btn-json');
  assert.equal(await page.$eval('#opm-webapp-json-editor', el => JSON.parse(el.value).name), 'Cloud fixture');

  const editJson = async text => {
    await page.$eval('#opm-webapp-json-editor', (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
    await page.waitForFunction(value => JSON.parse(localStorage.getItem('opm.webapp.state.v1')).text === value, {}, text);
    await page.$eval('#opm-webapp-json-editor', el => el.blur());
  };
  const edited = JSON.stringify({ name: 'Edited fixture', objects: {}, processes: {} });
  await editJson(edited);
  await page.click('#opm-webapp-btn-undo');
  assert.equal(await page.$eval('#opm-webapp-json-editor', el => JSON.parse(el.value).name), 'Cloud fixture');
  await page.click('#opm-webapp-btn-redo');
  assert.equal(await page.$eval('#opm-webapp-json-editor', el => JSON.parse(el.value).name), 'Edited fixture');
  await editJson('{broken JSON');
  await page.waitForFunction(() => window.__hostMessages.some(m => m.type === 'parseError'));
  await page.click('#opm-webapp-btn-undo');
  assert.equal(await page.$eval('#opm-webapp-json-editor', el => el.value), edited);

  // Exercise the same bridge contract used by the editor, including shared version state.
  const beforeVersion = await page.evaluate(() => window.__hostMessages.filter(m => m.type === 'model').at(-1).version);
  await page.evaluate(() => window.acquireVsCodeApi().postMessage({ type: 'op', requestId: 900001, operation: { op: 'addElement', kind: 'object', viewId: 'system', label: 'Parcel' } }));
  await page.waitForFunction(() => window.__hostMessages.some(m => m.type === 'result' && m.requestId === 900001 && m.ok));
  await page.waitForFunction(previous => window.__hostMessages.some(m => m.type === 'model' && m.version > previous && m.model.objects?.parcel), {}, beforeVersion);
  assert(await page.evaluate(previous => {
    const messages = window.__hostMessages;
    const modelIndex = messages.findIndex(m => m.type === 'model' && m.version > previous && m.model.objects?.parcel);
    const resultIndex = messages.findIndex(m => m.type === 'result' && m.requestId === 900001);
    return modelIndex >= 0 && modelIndex < resultIndex;
  }, beforeVersion), 'The updated model must arrive before a successful edit acknowledgement');
  await page.click('#opm-webapp-btn-lang');
  await page.click('#opm-webapp-btn-theme');
  const savedSession = await page.evaluate(() => JSON.parse(localStorage.getItem('opm.webapp.state.v1')));
  await page.reload();
  await page.waitForSelector('#opm-webapp-btn-json');
  await page.click('#opm-webapp-btn-json');
  assert.equal(await page.$eval('#opm-webapp-json-editor', el => el.value), savedSession.text);
  assert.equal(await page.$eval('body', el => el.className), savedSession.theme);
  assert.equal(await page.$eval('#opm-webapp-btn-lang', el => el.textContent), savedSession.lang.toUpperCase());

  // A selected native file handle must survive until Save in another host module.
  await page.evaluate(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: async () => [{
      name: 'native-fixture.opm.json',
      getFile: async () => new File([JSON.stringify({ name: 'Native fixture', objects: {}, processes: {} })], 'native-fixture.opm.json'),
      createWritable: async () => ({ write: async text => { window.__savedFile = text; }, close: async () => { window.__fileClosed = true; } }),
    }] });
  });
  await page.click('#opm-webapp-btn-open');
  await page.waitForFunction(() => document.getElementById('opm-webapp-filename').textContent === 'native-fixture.opm.json');
  await page.click('#opm-webapp-btn-save');
  await page.waitForFunction(() => window.__fileClosed === true);
  assert.equal(await page.evaluate(() => JSON.parse(window.__savedFile).name), 'Native fixture');
  assert.deepEqual(pageErrors, []);
  console.log('PASS cloud safety/load, JSON edits/undo/redo, editor bridge, persisted session and native file save');
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
