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
  const malicious = '<img src=x onerror="window.__injected=1">';
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().startsWith('https://www.googleapis.com/drive/v3/files')) {
      return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization', 'access-control-allow-methods': 'GET, OPTIONS' }, body: JSON.stringify({ files: [{ id: 'fixture', name: malicious + '.json', size: 100, webViewLink: 'javascript:window.__injected=2' }] }) });
    }
    if (request.url().startsWith('http://127.0.0.1:')) return request.continue();
    return request.abort();
  });
  await page.evaluateOnNewDocument(value => {
    localStorage.setItem('phenome_cloud_session_v1', JSON.stringify({ provider: 'google', accessToken: 'synthetic-only', expiresAt: Date.now() + 3600000, userName: value, userEmail: '', folderName: 'phenome', folderId: 'fixture' }));
  }, malicious);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.click('#opm-webapp-btn-cloud');
  await page.waitForSelector('.opm-wa-cloud-row');
  assert.equal(await page.$eval('#opm-webapp-cloud-modal', el => el.querySelectorAll('img,script').length), 0, 'cloud strings must remain text');
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  assert.equal(await page.$eval('.opm-wa-cloud-row strong', el => el.textContent), malicious + '.json');
  assert.equal(await page.$eval('.opm-wa-cloud-row', el => el.querySelectorAll('a[href^="javascript:"]').length), 0);
  await page.click('#opm-wa-cloud-close');
  await page.click('#opm-webapp-btn-json');
  assert(await page.$eval('#opm-webapp-json-editor', el => JSON.parse(el.value).name));
  console.log('PASS standalone model/JSON and untrusted cloud text/URL browser regression');
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
