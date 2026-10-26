import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import puppeteer from 'puppeteer-core';

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
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'),
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith('http://127.0.0.1:') ? req.continue() : req.abort());
  const waitStory = predicate => page.waitForFunction(`(() => {
    const saved = localStorage.getItem('opm.webapp.state.v1');
    if (!saved) return false;
    const model = JSON.parse(JSON.parse(saved).text);
    return (${predicate.toString()})(model.stories.quoteProcedure, model);
  })()`);
  const replace = async (selector, text) => {
    await page.click(selector);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.sendCharacter(text);
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/?preset=makigami&lang=en`);
  await page.waitForSelector('.opm-mk-card');
  await page.waitForSelector('[data-testid="opm-story"] > .v2-panel-header .opm-story-tools[role="toolbar"]');
  assert.equal(await page.$$eval('.opm-mk-card', nodes => nodes.length), 4);
  assert.equal(await page.$$eval('.opm-mk-lane-head', nodes => nodes.length), 3);
  await page.click('.opm-story-tools [aria-label="+ Lane"]');
  await page.waitForSelector('.opm-mk-bar');
  assert.equal(await page.$eval('.opm-story-tools [aria-label="+ Lane"]', el => el.getAttribute('aria-pressed')), 'true');
  await page.click('.opm-story-tools [aria-label="+ Lane"]');
  await page.waitForSelector('.opm-mk-bar', { hidden: true });

  // Controlled inputs keep focus across model updates and component rerenders.
  await page.click('.opm-mk-card');
  await page.waitForSelector('[data-testid="opm-story-step"] .v2-panel-body');
  assert(await page.$eval('.opm-mk-step-btns button[title="Move left"]', el => el.disabled));
  await page.waitForSelector('.opm-mk-inline-does');
  await replace('.opm-mk-inline-does', 'Review customer requirements');
  await waitStory(s => s.steps[0].does === 'Review customer requirements');
  assert.equal(await page.$eval('.opm-mk-inline-does', el => el === document.activeElement), true);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.opm-mk-inline-does', { hidden: true });

  const bandHeight = await page.$eval('.opm-mk-band', el => el.getBoundingClientRect().height);
  await replace('.opm-mk-editor input[placeholder="e.g. 2 min"]', '15 min');
  await waitStory(s => s.steps[0].waits === '15 min');
  await replace('.opm-mk-editor input[placeholder="Kaizen / bottleneck…"]', 'Missing approval');
  await waitStory(s => s.steps[0].waits === '15 min' && s.steps[0].problem === 'Missing approval');
  assert(await page.$eval('.opm-mk-band', el => el.getBoundingClientRect().height) > bandHeight);

  await page.click('.opm-mk-handover');
  await page.waitForSelector('.opm-mk-handover-pop');
  await replace('.opm-mk-handover-pop input[list="opm-mk-states"]', 'verified');
  await waitStory(s => s.steps[0].handsOver.state === 'verified');
  await page.click('.opm-mk-handover-pop button');

  await page.click('.opm-story-title', { clickCount: 2 });
  await replace('.opm-story-title-block input', 'Acceptance procedure');
  await page.keyboard.press('Enter');
  await waitStory(s => s.title === 'Acceptance procedure');
  await page.click('.opm-story-title', { clickCount: 2 });
  await replace('.opm-story-title-block input', 'Discard this title');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.opm-story-title-block input', { hidden: true });
  await waitStory(s => s.title === 'Acceptance procedure');

  await page.click('.opm-story-done > button');
  await replace('.opm-story-done input', 'Customer accepts the quote');
  await page.keyboard.press('Enter');
  await waitStory(s => s.doneWhen.includes('Customer accepts the quote'));

  await page.click('.opm-mk-add-lane-row button');
  await replace('.opm-mk-bar input', 'Quality review');
  await page.click('.opm-mk-bar button.primary');
  await waitStory((s, m) => s.lanes.length === 4 && m.objects[s.lanes[3]].role === 'module');
  await page.waitForFunction(() => document.querySelectorAll('.opm-mk-lane-head').length === 4);
  const ghosts = await page.$$('.opm-mk-ghost-card');
  await ghosts.at(-1).click();
  await waitStory(s => s.steps.length === 5 && s.steps[4].lane === s.lanes[3]);
  await page.waitForFunction(() => [...document.querySelectorAll('.opm-mk-card')].findIndex(el => el.classList.contains('selected')) === 4);
  await replace('.opm-mk-inline-does', 'Final quality review');
  await page.keyboard.press('Enter');
  await waitStory(s => s.steps[4].does === 'Final quality review');

  // Dispatch native drag events in separate turns so React commits drag state first.
  await page.evaluate(() => {
    const card = document.querySelectorAll('.opm-mk-card')[4];
    window.__drag = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: window.__drag }));
  });
  await page.waitForSelector('.opm-mk-card.dragging');
  await page.evaluate(() => {
    const band = document.querySelector('.opm-mk-band');
    const rect = band.getBoundingClientRect();
    band.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__drag, clientX: rect.left + 10 }));
  });
  await page.waitForSelector('.opm-mk-drop-preview');
  await page.evaluate(() => {
    const band = document.querySelector('.opm-mk-band');
    const rect = band.getBoundingClientRect();
    band.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__drag, clientX: rect.left + 10 }));
    delete window.__drag;
  });
  await waitStory(s => s.steps[0].does === 'Final quality review' && s.steps[0].lane === s.lanes[0]);
  await page.waitForSelector('.opm-mk-drop-preview', { hidden: true });

  // Lane order and deletion keep step assignments coherent.
  const laneHeaders = await page.$$('.opm-mk-lane-head');
  await (await laneHeaders.at(-1).$('button[title="Move lane up"]')).click();
  await waitStory(s => s.lanes[2] === 'qualityReview');
  // Persistence precedes the React model message; wait for the reordered DOM too.
  await page.waitForFunction(() =>
    document.querySelectorAll('.opm-mk-lane-head')[2]?.querySelector('.opm-mk-thing-label')?.textContent === 'Quality review');
  await page.click('.opm-mk-lane-head:nth-child(4) .opm-mk-lane-tools button:last-child');
  await waitStory(s => s.lanes.length === 3 && !s.lanes.includes('qualityReview'));
  await page.click('.opm-mk-sync');
  await waitStory((s, m) => s.steps.every(step => step.process && m.processes[step.process]));
  await page.waitForSelector('.opm-busy', { hidden: true });
  await page.click('.opm-mk-card');
  await page.waitForSelector('[data-testid="opm-story-step"]');
  mkdirSync('dist/makigami-shots', { recursive: true });
  for (const [name, width, height] of [['desktop', 1600, 1000], ['tablet', 900, 700]]) {
    await page.setViewport({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const bounds = await page.$eval('.opm-mk-scroll', el => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, right: box.right, height: box.height };
    });
    assert(bounds.top >= 0 && bounds.bottom <= height + 1 && bounds.right <= width + 1);
    assert(bounds.height >= 60, 'Story canvas must retain a scrollable viewing area');
    await page.screenshot({ path: `dist/makigami-shots/${name}.png` });
  }
  await page.evaluate(() => window.postMessage({ type: 'parseError', line: 1, version: 9000, message: 'Invalid JSON fixture' }, '*'));
  await page.waitForSelector('.opm-story-actions', { hidden: true });
  await page.waitForSelector('.opm-mk-editor', { hidden: true });
  await page.click('.opm-story-title', { clickCount: 2 });
  assert.equal(await page.$('.opm-story-title-block input'), null);
  assert.deepEqual(errors, []);
  console.log('PASS Makigami: shared panels/toolbar, editing, handovers, lane/step order, sync, read-only state and viewport bounds');
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
