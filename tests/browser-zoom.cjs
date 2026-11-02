/* Real touch input: zoom must never turn a page or zoom Safari's controls. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const makeFixture = require('./make-fixture.cjs');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: points.map(([x, y, identifier], id) => ({ x, y, id: identifier === undefined ? id : identifier }))
    });
    async function tap(x, y) { await touch('touchStart', [[x,y]]); await touch('touchEnd', []); }
    async function doubleTap(x, y) { await tap(x,y); await page.waitForTimeout(90); await tap(x,y); await page.waitForTimeout(380); }
    async function loaded(n) {
      await page.waitForFunction(n => document.querySelector('.page-image')?.alt.startsWith('Page '+n+':'), n);
    }
    async function matrix() {
      return page.locator('.page-image').evaluate(el => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return { scale: m.a, x: m.e, y: m.f };
      });
    }
    async function atPage57() {
      assert.equal(await page.locator('#page-count').textContent(), '57 / 120');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cbz-reader.v1')).books[0].page), 56);
    }
    await page.goto(process.env.READER_URL || 'http://127.0.0.1:8080/');
    await page.locator('#file-input').setInputFiles(await makeFixture()); await loaded(1);
    await page.locator('#page-slider').evaluate(el => { el.value = '57'; el.dispatchEvent(new Event('input')); }); await loaded(57);
    // A side double tap used to advance twice. It must now enlarge this page.
    await doubleTap(620, 400);
    assert.equal((await matrix()).scale, 2, 'double tap enlarges the page'); await atPage57();
    assert.equal(await page.evaluate(() => visualViewport.scale), 1, 'browser controls stay at normal scale');
    await doubleTap(620, 400);
    assert.deepEqual(await matrix(), { scale: 1, x: 0, y: 0 }); await atPage57();
    await doubleTap(120,400); assert.equal((await matrix()).scale, 2); await atPage57();
    await doubleTap(120,400); assert.equal((await matrix()).scale, 1); await atPage57();
    await touch('touchStart', [[234,400],[334,400]]);
    await touch('touchMove', [[234,450],[434,450]]); await touch('touchEnd', []);
    assert.deepEqual(await matrix(), { scale: 2, x: 150, y: 162 }, 'pinch follows its moving midpoint');
    await doubleTap(400,400);
    // Two fingers enlarge around their midpoint; lifting one finger continues panning.
    await touch('touchStart', [[284,512],[484,512]]);
    await touch('touchMove', [[184,512],[584,512]]);
    assert.equal((await matrix()).scale, 2);
    await touch('touchEnd', [[584,512,1]]);
    await touch('touchMove', [[284,612]]);
    await touch('touchEnd', []);
    assert.deepEqual(await matrix(), { scale: 2, x: 100, y: 100 }); await atPage57();
    await touch('touchStart', [[300,300]]);
    await touch('touchMove', [[740,900]]); await touch('touchEnd', []);
    // 900x1280 scan fits at 720x1024: at 2x its horizontal pan limit is 336.
    assert.deepEqual(await matrix(), { scale: 2, x: 336, y: 512 }); await atPage57();
    const shown = await page.locator('#toolbar').isVisible();
    await tap(384,450); await page.waitForTimeout(380);
    assert.equal(await page.locator('#toolbar').isVisible(), !shown);
    await tap(650,400); await page.waitForTimeout(380); await atPage57();
    await page.screenshot({ path: path.join(__dirname, 'zoom.png') });
    // Shrinking stops at fit; the remaining finger cannot accidentally navigate.
    await touch('touchStart', [[184,512],[584,512]]);
    await touch('touchMove', [[370,512],[398,512]]);
    await touch('touchEnd', [[398,512,1]]);
    await touch('touchMove', [[650,512]]); await touch('touchEnd', []);
    assert.deepEqual(await matrix(), { scale: 1, x: 0, y: 0 }); await atPage57();
    await tap(650,400); await loaded(58);
    await doubleTap(400,400); assert.equal((await matrix()).scale, 2);
    await page.keyboard.press('ArrowLeft'); await loaded(57);
    assert.deepEqual(await matrix(), { scale: 1, x: 0, y: 0 });
    await doubleTap(400,400);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForFunction(() => document.getElementById('reader').style.width === '1024px');
    assert.deepEqual(await matrix(), { scale: 1, x: 0, y: 0 }); await atPage57();
    await doubleTap(450,350);
    await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); });
    await loaded(57); assert.deepEqual(await matrix(), { scale: 1, x: 0, y: 0 });
    await touch('touchStart', [[440,300],[460,300]]);
    await touch('touchMove', [[100,300],[900,300]]); await touch('touchEnd', []);
    assert.equal((await matrix()).scale, 4, 'zoom is bounded'); await atPage57();
    await touch('touchStart', [[400,300]]); await touch('touchCancel', []);
    await doubleTap(400,300); assert.equal((await matrix()).scale, 1);
    await doubleTap(400,300);
    await page.locator('#next').focus(); await page.keyboard.press('Enter'); await loaded(58);
    assert.deepEqual(await matrix(), { scale: 1, x: 0, y: 0 }, 'keyboard page buttons remain usable when enlarged');
    assert.deepEqual(errors, []);
    console.log('Touch zoom passed: double tap, pinch/pan/bounds, remaining finger, controls, unchanged progress, page/rotation/resume reset.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
