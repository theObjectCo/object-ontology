import assert from 'node:assert/strict';
import { openBrowserApp } from './browser-fixture.mjs';

const app = await openBrowserApp('?preset=blank&lang=en');
const { page, errors } = app;
try {
  await page.waitForSelector('.opm-empty');
  // Inject a host response at the real operation boundary. The editor's run()
  // and toast lifecycle still execute normally; no React state is patched.
  await page.evaluate(() => {
    window.noticeReply = null;
    window.noticeResults = [];
    const post = window.postMessage.bind(window);
    window.postMessage = (message, ...options) => {
      if (message?.type === 'result') {
        if (window.noticeReply) message = { ...message, ...window.noticeReply };
        window.noticeReply = null;
        window.noticeResults.push(message);
      }
      return post(message, ...options);
    };
  });
  const message = 'Could not save <img src=x onerror=alert(1)>: ' + 'model-'.repeat(70);
  await page.evaluate(text => {
    document.body.style.setProperty('--vscode-inputValidation-errorBorder', 'rgb(210, 70, 40)');
    window.noticeReply = { ok: false, error: text };
  }, message);
  await page.click('.opm-create-tools [aria-label="Object"]');
  await page.waitForSelector('.opm-toast.v2-studio-notice[data-tone="error"]');
  assert.equal(await page.$eval('.opm-toast', el => el.textContent), message);
  assert.equal(await page.$eval('.opm-toast', el => el.getAttribute('role')), 'status');
  assert.equal(await page.$eval('.opm-toast', el => el.getAttribute('aria-live')), 'polite');
  assert.equal(await page.$eval('.opm-toast', el => getComputedStyle(el).borderTopColor), 'rgb(210, 70, 40)');
  assert.equal(await page.$('.opm-toast img'), null);
  for (const width of [1500, 640]) {
    await page.setViewport({ width, height: 1000 });
    assert.equal(await page.$eval('.opm-toast', el => {
      const notice = el.getBoundingClientRect();
      const canvas = el.closest('.opm-canvas').getBoundingClientRect();
      return notice.left >= canvas.left - 1 && notice.right <= canvas.right + 1 && el.scrollWidth <= el.clientWidth;
    }), true);
  }
  await page.evaluate(() => { window.noticeReply = { ok: true, message: 'Synthetic host confirmation' }; });
  await page.click('.opm-create-tools [aria-label="Object"]');
  await page.waitForSelector('.opm-toast[data-tone="info"]');
  assert.equal(await page.$eval('.opm-toast', el => el.textContent), 'Synthetic host confirmation');
  await page.waitForSelector('.opm-toast', { hidden: true, timeout: 9000 });
  assert.deepEqual(errors, []);
  console.log('PASS shared notice: host failure/success, escaped text, VS Code theme, bounds and existing dismissal');
} catch (error) {
  console.error('Notice integration failed:', error);
  console.error('Browser errors:', errors);
  console.error('Notice state:', await page.evaluate(() => ({
    reply: window.noticeReply, results: window.noticeResults,
    notices: [...document.querySelectorAll('[role="status"],.opm-toast')].map(el => el.outerHTML),
  })));
  throw error;
} finally {
  await app.close();
}
