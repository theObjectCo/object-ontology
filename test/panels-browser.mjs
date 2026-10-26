import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { openBrowserApp } from './browser-fixture.mjs';

const app = await openBrowserApp('?preset=blank&lang=en');
const { page, errors } = app;
try {
  const waitModel = predicate => page.waitForFunction(`(() => {
    const saved = localStorage.getItem('opm.webapp.state.v1');
    return saved && (${predicate.toString()})(JSON.parse(JSON.parse(saved).text));
  })()`);
  const replace = async (selector, text) => {
    await page.focus(selector);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.sendCharacter(text);
    await page.keyboard.press('Tab');
  };
  const clickText = async (selector, text) => {
    const handle = await page.evaluateHandle((s, t) =>
      [...document.querySelectorAll(s)].find(el => el.textContent.trim().startsWith(t)), selector, text);
    assert(handle.asElement(), `Missing control: ${text}`);
    await handle.asElement().click();
    await handle.dispose();
  };
  await page.waitForSelector('.opm-empty');
  await page.click('.opm-create-tools [aria-label="Object"]');
  await page.waitForSelector('.opm-label-input');
  await page.keyboard.sendCharacter('Panel object');
  await page.keyboard.press('Enter');
  await waitModel(m => !!m.objects.panelObject);
  await page.waitForSelector('[data-thing="panelObject"]');
  await page.waitForSelector('.opm-busy', { hidden: true });
  await page.click('[data-thing="panelObject"]');
  await page.keyboard.press('F2');
  await page.waitForSelector('[data-testid="opm-inspector"] .v2-panel-body #opm-id-field');
  assert.equal(await page.$eval('.opm-drawer .v2-panel-title', el => el.textContent), 'Panel object');

  await replace('.opm-note-input', 'A **persistent** note');
  await waitModel(m => m.objects.panelObject.note === 'A **persistent** note');
  await page.waitForSelector('.opm-note b');
  assert.equal(await page.$eval('.opm-note b', el => el.textContent), 'persistent');
  await clickText('.opm-section-head', '▸ CLASSIFICATION');
  await page.click('.opm-choices input[type="checkbox"]');
  await waitModel(m => m.objects.panelObject.role === 'module');
  await clickText('.opm-section-head', '▸ CAPABILITIES & DEPLOYMENT (P28)');
  await page.waitForSelector('.opm-input[placeholder="panelObject_v1.0.0"]');
  await replace('.opm-input[placeholder="panelObject_v1.0.0"]', 'panel_v1');
  await waitModel(m => m.objects.panelObject.deploymentName === 'panel_v1');

  // The scrollable shared panel stays inside the host at both supported sizes.
  mkdirSync('dist/panel-shots', { recursive: true });
  for (const [name, width, height] of [['desktop', 1500, 1000], ['tablet', 900, 700]]) {
    await page.setViewport({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const bounds = await page.$eval('.opm-drawer', el => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, right: box.right, width: box.width };
    });
    assert(bounds.top >= 0 && bounds.bottom <= height + 1 && bounds.right <= width + 1);
    assert(bounds.width >= 220, 'Inspector must retain usable width');
    await page.screenshot({ path: `dist/panel-shots/${name}.png` });
  }
  await clickText('.opm-drawer .v2-panel-actions button', '‹ Less');
  await page.waitForSelector('.opm-drawer', { hidden: true });

  // Parse errors disable the shared controls as well as diagram shortcuts.
  await page.evaluate(() => window.postMessage({ type: 'parseError', line: 1, version: 9000, message: 'Invalid JSON fixture' }, '*'));
  await page.waitForSelector('.opm-banner.error');
  assert(await page.$eval('.opm-create-tools [aria-label="Object"]', el => el.disabled));
  assert(await page.$eval('.opm-create-tools [aria-label="Process"]', el => el.disabled));
  assert.deepEqual(errors, []);
  console.log('PASS shared toolbar creation/freeze; inspector note, classification, capabilities, close and viewport bounds');
} finally {
  await app.close();
}
