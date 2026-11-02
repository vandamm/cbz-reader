/* Optional integration checks: PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser.cjs */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const JSZip = require('../vendor/jszip.min.js');
const makeFixture = require('./make-fixture.cjs');

(async () => {
  const fixture = await makeFixture();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  const errors = [];
  await context.addInitScript(() => {
    window.liveURLs = new Set(); window.peakURLs = 0;
    const make = URL.createObjectURL.bind(URL), drop = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const u = make(blob); liveURLs.add(u); window.peakURLs = Math.max(peakURLs, liveURLs.size); return u; };
    URL.revokeObjectURL = u => { liveURLs.delete(u); drop(u); };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const url = process.env.READER_URL || 'http://127.0.0.1:8080/';
  async function loaded(number) {
    await page.waitForFunction(n => {
      const image = document.querySelector('.page-image');
      return image && image.complete && image.naturalWidth > 0 && image.alt.startsWith('Page ' + n + ':');
    }, number);
    assert.equal(await page.locator('#page-count').textContent(), number + ' / 120');
  }
  async function jump(number) {
    await page.locator('#page-slider').evaluate((el, n) => { el.value = String(n); el.dispatchEvent(new Event('input', { bubbles: true })); }, number);
    await loaded(number);
  }
  try {
    await page.goto(url);
    await page.screenshot({ path: path.join(__dirname, 'library.png') });
    await page.locator('#file-input').setInputFiles(fixture); await loaded(1);
    await page.locator('#next').click(); await loaded(2);
    await page.locator('#previous').click(); await loaded(1);
    await page.evaluate(() => {
      const stage = document.getElementById('stage');
      for (const [name, touches, changed] of [
        ['touchstart', [{ clientX: 200, clientY: 300 }], []],
        ['touchend', [], [{ clientX: 300, clientY: 300 }]]
      ]) {
        const event = new Event(name, { bubbles: true, cancelable: true });
        Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changed } });
        stage.dispatchEvent(event);
      }
    });
    await loaded(2);
    await page.locator('#swipe-direction').selectOption('left');
    await jump(57);
    await page.reload();
    assert.match(await page.locator('#library-status').textContent(), /page 57/);
    assert.equal(await page.locator('#swipe-direction').inputValue(), 'left');
    await page.locator('#file-input').setInputFiles(fixture); await loaded(57);
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
    assert.equal(await page.locator('.page-image').count(), 0);
    assert.equal(await page.evaluate(() => liveURLs.size), 0);
    await page.evaluate(() => { window.dispatchEvent(new Event('pageshow')); });
    await loaded(57);
    await page.evaluate(() => {
      const image = document.querySelector('.page-image'); URL.revokeObjectURL(image.src); image.dispatchEvent(new Event('error'));
    });
    await loaded(57);
    await page.locator('#toggle-controls').click();
    assert.equal(await page.locator('#toolbar').isHidden(), true);
    await page.locator('#toggle-controls').click();
    assert.equal(await page.locator('#toolbar').isVisible(), true);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForFunction(() => document.getElementById('reader').getBoundingClientRect().width === 1024);
    const bounds = await page.locator('.page-image').boundingBox();
    assert.equal(bounds.width, 1024); assert.equal(bounds.height, 768);
    await page.screenshot({ path: path.join(__dirname, 'reader.png') });
    for (let n = 1; n <= 120; n++) await jump(n);
    assert.equal(await page.evaluate(() => liveURLs.size), 1);
    assert.ok(await page.evaluate(() => peakURLs) <= 1);
    await page.evaluate(() => {
      const slider = document.getElementById('page-slider');
      for (let n = 1; n <= 57; n++) { slider.value = String(n); slider.dispatchEvent(new Event('input')); }
    });
    await loaded(57);
    // A pending archive replacement must neither accept page turns nor undo Library.
    await page.evaluate(() => {
      const open = CBZArchive.open;
      CBZArchive.open = function () {
        return open.apply(this, arguments).then(entries => new Promise(resolve => {
          window.finishOpening = () => { window.finishOpening = null; resolve(entries); };
        }));
      };
    });
    await page.locator('#file-input').setInputFiles(fixture);
    await page.waitForFunction(() => typeof window.finishOpening === 'function');
    await page.locator('#next').click();
    assert.equal(await page.locator('#page-count').textContent(), '57 / 120');
    await page.evaluate(() => window.finishOpening()); await loaded(57);
    await page.locator('#file-input').setInputFiles(fixture);
    await page.waitForFunction(() => typeof window.finishOpening === 'function');
    await page.locator('#back-library').click();
    await page.evaluate(() => window.finishOpening());
    await page.waitForFunction(() => !document.getElementById('open-file').disabled);
    assert.equal(await page.locator('#reader').isHidden(), true);
    const progressBeforeCheck = await page.evaluate(() => localStorage.getItem('cbz-reader.v1'));
    const mixed = new JSZip();
    mixed.file('cover.jpg', fs.readFileSync(path.join(__dirname, 'page.jpg')));
    for (let n = 1; n <= 120; n++) mixed.file(`pages/${n}.webp`, 'sample image data');
    const mixedData = await mixed.generateAsync({ type: 'nodebuffer' });
    page.once('filechooser', chooser => chooser.setFiles({ name: 'mixed-pages.cbz', mimeType: 'application/zip', buffer: mixedData }));
    await page.locator('#check-file').click();
    await page.waitForFunction(() => document.getElementById('archive-report').value.includes('WEBP: 120'));
    assert.match(await page.locator('#archive-report').inputValue(), /JPEG\/PNG\/WebP pages found: 121/);
    assert.equal(await page.locator('#reader').isHidden(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('cbz-reader.v1')), progressBeforeCheck);
    assert.equal(await page.evaluate(() => liveURLs.size), 0);
    await page.screenshot({ path: path.join(__dirname, 'archive-report.png') });
    const state = await context.storageState();
    await context.close();
    const restarted = await browser.newContext({ storageState: state });
    const fresh = await restarted.newPage(); fresh.on('pageerror', e => errors.push(e.message));
    await fresh.goto(url); assert.match(await fresh.locator('#library-status').textContent(), /page 57/);
    await fresh.locator('#file-input').setInputFiles(fixture);
    await fresh.waitForFunction(() => document.querySelector('.page-image')?.alt.startsWith('Page 57:'));
    await fresh.locator('#back-library').click();
    await fresh.locator('#file-input').setInputFiles({ name: 'bad.cbz', mimeType: 'application/zip', buffer: Buffer.from('bad zip') });
    await fresh.waitForFunction(() => document.getElementById('library-status').textContent.includes('Invalid or unsupported'));
    assert.match(await fresh.locator('#recent-list').textContent(), /Page 57 of 120/);
    const revised = new JSZip(), jpeg = fs.readFileSync(path.join(__dirname, 'page.jpg'));
    for (let i = 1; i <= 20; i++) revised.file(`Volume 1/${i}.jpg`, jpeg);
    const revisedData = await revised.generateAsync({ type: 'nodebuffer' });
    // Clicking a recent entry expresses that this revised file belongs to that book.
    fresh.once('filechooser', async chooser => chooser.setFiles({ name: path.basename(fixture), mimeType: 'application/zip', buffer: revisedData }));
    await fresh.locator('.recent-book').click();
    await fresh.waitForFunction(() => document.querySelector('.page-image')?.alt.startsWith('Page 20:'));
    assert.equal(await fresh.locator('#page-count').textContent(), '20 / 20');
    await restarted.close();
    const blocked = await browser.newContext();
    await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw Error('blocked'); }; });
    const denied = await blocked.newPage();
    await denied.goto(url); assert.equal(await denied.locator('#storage-warning').isVisible(), true);
    await denied.locator('#file-input').setInputFiles(fixture);
    await denied.waitForSelector('.page-image');
    await denied.locator('#next').click();
    await denied.waitForFunction(() => document.querySelector('.page-image')?.alt.startsWith('Page 2:'));
    assert.equal(await denied.locator('#save-state').textContent(), 'Progress not saved');
    await blocked.close();
    const timeouts = await browser.newContext();
    const timed = await timeouts.newPage(); timed.on('pageerror', e => errors.push(e.message));
    await timed.goto(url);
    await timed.locator('#file-input').setInputFiles(fixture);
    await timed.waitForSelector('.page-image');
    await timed.evaluate(() => {
      const originalTimeout = window.setTimeout;
      window.setTimeout = function (callback, delay) {
        if (delay === 30000) window.expireLoad = callback;
        return originalTimeout.apply(this, arguments);
      };
      window.activeLoads = 0; window.peakLoads = 0;
      CBZArchive.extract = function () {
        window.activeLoads++; window.peakLoads = Math.max(peakLoads, activeLoads);
        let cancel;
        const promise = new Promise((resolve, reject) => { cancel = () => { window.activeLoads--; reject(Error('cancelled')); }; });
        promise.cancel = cancel; return promise;
      };
      const slider = document.getElementById('page-slider');
      slider.value = '2'; slider.dispatchEvent(new Event('input'));
      slider.value = '3'; slider.dispatchEvent(new Event('input'));
      window.expireLoad();
    });
    await timed.waitForFunction(() => document.getElementById('page-count').textContent === '3 / 120' && activeLoads === 1);
    assert.equal(await timed.evaluate(() => peakLoads), 1);
    await timed.locator('#back-library').click();
    await timed.waitForFunction(() => activeLoads === 0);
    await timeouts.close();
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: 120 JPEG pages, taps/swipe, checkpoints/reselection, lifecycle recovery, toolbar, rotation, bounded URLs, rapid navigation, revised archives, storage refusal, opening races, timeout cancellation, local archive report without progress changes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
