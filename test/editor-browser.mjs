import assert from 'node:assert/strict';
import { openBrowserApp } from './browser-fixture.mjs';

const app = await openBrowserApp('?preset=blank&lang=en');
const { page, errors } = app;
try {
  const waitModel = predicate => page.waitForFunction(`(() => {
    const saved = localStorage.getItem('opm.webapp.state.v1');
    return saved && (${predicate.toString()})(JSON.parse(JSON.parse(saved).text));
  })()`).catch(async error => {
    console.error(await page.evaluate(() => ({ saved: localStorage.getItem('opm.webapp.state.v1'), active: document.activeElement?.outerHTML })));
    throw error;
  });
  const blur = () => page.evaluate(() => document.activeElement?.blur());
  const replace = async (selector, text) => {
    await page.waitForSelector(selector);
    await page.focus(selector);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.sendCharacter(text);
    await page.keyboard.press('Enter');
  };
  const add = async (key, text) => {
    await blur();
    await page.keyboard.press(key);
    await replace('.opm-label-input', text);
    await page.waitForSelector('.opm-label-input', { hidden: true });
  };
  const select = async id => {
    await page.waitForSelector('.opm-busy', { hidden: true });
    await page.click(`[data-thing="${id}"]`);
    await page.waitForSelector(`.react-flow__node[data-id="${id}"].selected`);
  };
  await page.waitForSelector('.opm-empty');
  await add('o', 'Order packet');
  await waitModel(m => !!m.objects.orderPacket);
  await add('p', 'Review packet');
  await waitModel(m => !!m.processes.reviewPacket);
  await select('orderPacket');
  assert.equal(await page.$eval('#opm-webapp-json-pane', el => getComputedStyle(el).display), 'none', 'Passive diagram selection must not open JSON');
  await page.keyboard.press('F2');
  await page.waitForSelector('#opm-id-field');
  assert.equal(await page.$eval('#opm-id-field', el => el.value), 'orderPacket');
  await replace('#opm-id-field', 'orderRecord');
  await waitModel(m => !!m.objects.orderRecord && !m.objects.orderPacket);

  console.log('PASS editor creation and inspector rename');

  // Text fields consume shortcuts; the same key edits the model after focus leaves them.
  await page.keyboard.press('s');
  await page.keyboard.press('Escape');
  await blur();
  await select('orderRecord');
  await page.keyboard.press('s');
  await waitModel(m => m.objects.orderRecord.states?.length === 1);

  const clipboard = await page.evaluate(() => {
    const data = new DataTransfer();
    const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data });
    document.dispatchEvent(event);
    return { text: data.getData('text/plain'), handled: event.defaultPrevented };
  });
  assert(clipboard.handled);
  assert(JSON.parse(clipboard.text).objects.orderRecord);
  await page.evaluate(text => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, clipboard.text);
  await waitModel(m => !!m.objects.orderRecord2);
  await page.waitForSelector('.react-flow__node[data-id="orderRecord2"].selected');
  await blur();
  await page.evaluate(() => document.dispatchEvent(new ClipboardEvent('cut', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() })));
  await waitModel(m => !m.objects.orderRecord2);
  await page.click('#opm-webapp-btn-undo');
  await waitModel(m => !!m.objects.orderRecord2);

  console.log('PASS editor state, clipboard, cut and undo');

  // Process zoom and subprocess creation retain the correct parent/view routing.
  await select('reviewPacket');
  await blur();
  await page.keyboard.press('Enter');
  await waitModel(m => Array.isArray(m.processes.reviewPacket.zoomsInto));
  await page.waitForFunction(() => document.querySelectorAll('.opm-trail button').length === 2);
  await add('p', 'Check packet');
  await waitModel(m => m.processes.reviewPacket.zoomsInto.includes('checkPacket'));
  await blur();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.querySelectorAll('.opm-trail button').length === 1);

  console.log('PASS editor process zoom and subprocess creation');

  // Context commands use the current selection and close after invoking an action.
  await select('orderRecord');
  await page.click('[data-thing="orderRecord"]', { button: 'right' });
  await page.waitForSelector('.opm-context');
  assert(await page.$eval('.opm-context', el => el.textContent.includes('Copy')));
  const rename = await page.evaluateHandle(() => [...document.querySelectorAll('.opm-context button')].find(el => el.textContent.includes('Rename')));
  await rename.asElement().click();
  await replace('.opm-label-input', 'Approved order');
  await waitModel(m => m.objects.orderRecord.label === 'Approved order');

  // Passive selection can scroll an existing JSON pane without stealing focus.
  await page.click('#opm-webapp-btn-json');
  await select('reviewPacket');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.$eval('#opm-webapp-json-editor', el => el === document.activeElement), false);
  await select('orderRecord');
  await page.click('[data-thing="orderRecord"]', { button: 'right' });
  await page.waitForSelector('.opm-context');
  const showJson = await page.evaluateHandle(() => [...document.querySelectorAll('.opm-context button')].find(el => el.textContent.includes('JSON')));
  await showJson.asElement().click();
  await page.waitForFunction(() => document.activeElement?.id === 'opm-webapp-json-editor');
  assert.equal(await page.$eval('#opm-webapp-json-editor', el => el.value.slice(el.selectionStart, el.selectionEnd)), '"orderRecord":');
  await page.click('#opm-webapp-json-close');

  // Selection shortcuts and read-only parse errors go through the extracted keyboard hook.
  await blur();
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node.selected').length >= 3);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node.selected').length === 0);
  await page.evaluate(() => window.postMessage({ type: 'parseError', line: 7, version: 9000, message: 'Fixture invalid JSON' }, '*'));
  await page.waitForSelector('.opm-banner.error');
  const before = await page.evaluate(() => localStorage.getItem('opm.webapp.state.v1'));
  await page.keyboard.press('o');
  assert.equal(await page.$('.opm-label-input'), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('opm.webapp.state.v1')), before);
  assert.deepEqual(errors, []);
  console.log('PASS diagram editor: keyboard creation/rename/state, inspector, clipboard/cut/undo, zoom/subprocesses, context menu, selection and frozen editing');
} finally {
  await app.close();
}

