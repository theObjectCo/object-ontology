import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

/** Serve the actual built standalone editor, blocking requests outside the fixture. */
export async function openBrowserApp(query = '') {
  const root = resolve('dist/web');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
      res.end(readFileSync(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  const close = async () => {
    let timer;
    const started = performance.now();
    const trace = (...args) => {
      if (process.env.BROWSER_CLOSE_TRACE) console.error(Math.round(performance.now() - started), ...args);
    };
    try {
      if (browser) await Promise.race([
        (async () => {
          // Let Chrome coordinate target and process shutdown in one operation.
          // Closing pages first timed out on Windows, and enumerating workers
          // adds lifecycle races without resolving that shutdown failure.
          trace('Closing test browser process');
          await browser.close();
          trace('Test browser closed');
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => {
          browser.process()?.kill();
          reject(new Error('Test browser did not exit within 10 seconds'));
        }, 10_000); }),
      ]);
    } finally {
      clearTimeout(timer);
      server.closeAllConnections();
      await new Promise(r => server.close(r));
    }
  };
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'),
      headless: true,
    });
    if (process.env.BROWSER_CLOSE_TRACE) browser.process()?.once('exit', code => console.error('Test browser process exited:', code));
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1000 });
    if (process.env.BROWSER_CPU_RATE) await page.emulateCPUThrottling(Number(process.env.BROWSER_CPU_RATE));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', req => req.url().startsWith('http://127.0.0.1:') ? req.continue() : req.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/${query}`);
    return { page, errors, close };
  } catch (error) {
    await close();
    throw error;
  }
}
