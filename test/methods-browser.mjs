import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { openBrowserApp } from './browser-fixture.mjs';

const app = await openBrowserApp('?preset=window-pricing&lang=en');
const { page, errors } = app;
try {
  page.setDefaultTimeout(10000);
  const clickText = async (selector, text) => {
    const handle = await page.evaluateHandle((s, t) =>
      [...document.querySelectorAll(s)].find(el => el.textContent.trim() === t), selector, text);
    assert(handle.asElement(), `Missing control: ${text}`);
    await handle.asElement().click();
    await handle.dispose();
  };
  const modelText = () => page.evaluate(() => JSON.parse(localStorage.getItem('opm.webapp.state.v1')).text);
  const open = async () => {
    await page.click('.opm-more');
    await clickText('.opm-menu button', 'View as IDEF0');
    await page.waitForSelector('.opm-method .opm-m-svg');
  };
  await page.waitForSelector('.react-flow__node');
  await page.waitForSelector('.opm-busy', { hidden: true });
  const original = await modelText();
  await open();
  await page.waitForSelector('[data-testid="opm-method"] > .v2-panel-header');
  assert.equal(await page.$eval('.opm-method [aria-pressed="true"]', el => el.textContent), 'IDEF0');
  await page.select('.opm-method select', 'pricing');
  await page.waitForFunction(() => document.querySelector('.opm-method-body').textContent.toLowerCase().includes('product pricing'));
  assert((await page.$$('.opm-method .opm-m-svg')).length > 0);

  await clickText('.opm-method .opm-seg button', 'SIPOC');
  await page.waitForSelector('.opm-m-sipoc');
  assert.deepEqual(await page.$$eval('.opm-m-sipoc thead th', nodes => nodes.map(n => n.textContent)),
    ['Suppliers', 'Inputs', 'Process', 'Outputs', 'Customers']);
  assert.equal(await page.$eval('.opm-method select', el => el.value), 'pricing');

  await clickText('.opm-method .opm-seg button', 'N² matrix');
  await page.waitForSelector('.opm-m-dsm');
  const withAgents = (await page.$$('.opm-m-dsm tbody tr')).length;
  await page.click('.opm-method-option input[type="checkbox"]');
  await page.waitForFunction(count => document.querySelectorAll('.opm-m-dsm tbody tr').length < count, {}, withAgents);
  assert((await page.$$('.opm-m-dsm tbody tr')).length > 0);
  await clickText('.opm-method .opm-seg button', 'Process flow');
  await page.waitForSelector('.opm-method .opm-m-activity');
  assert.equal(await page.$eval('.opm-method select', el => el.value), 'pricing');

  mkdirSync('dist/method-shots', { recursive: true });
  for (const [name, width, height] of [['desktop', 1500, 1000], ['tablet', 900, 700]]) {
    await page.setViewport({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const bounds = await page.$eval('.opm-method', el => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, right: box.right };
    });
    assert(bounds.top >= 0 && bounds.bottom <= height + 1 && bounds.right <= width + 1);
    await page.screenshot({ path: `dist/method-shots/${name}.png` });
  }
  await page.keyboard.press('Delete');
  assert.equal(await modelText(), original, 'Derived method views must not edit the model');
  await clickText('.opm-method button', 'Back to the diagram');
  await page.waitForSelector('.opm-method', { hidden: true });
  await open();
  await clickText('.opm-method .opm-seg button', 'SIPOC');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.opm-method', { hidden: true });
  assert.equal(await modelText(), original);
  await page.goto(page.url().replace('lang=en', 'lang=pl'));
  await page.waitForSelector('.react-flow__node');
  await page.click('.opm-more');
  await clickText('.opm-menu button', 'Widok IDEF0');
  await page.waitForSelector('[data-testid="opm-method"] .opm-m-svg');
  await clickText('.opm-method button', 'Wróć do diagramu');
  await page.waitForSelector('.opm-method', { hidden: true });
  assert.deepEqual(errors, []);
  console.log('PASS shared method panel: projections, process selection, agents, read-only data, EN/PL close, Escape and bounds');
} catch (error) {
  mkdirSync('dist/method-shots', { recursive: true });
  await page.screenshot({ path: 'dist/method-shots/failure.png' });
  console.error('Method text:', await page.$eval('.opm-method', el => el.textContent).catch(() => '(closed)'));
  console.error('Browser errors:', errors);
  throw error;
} finally { await app.close(); }
