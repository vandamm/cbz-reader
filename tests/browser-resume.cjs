/* Relaunch a real browser profile: localStorage alone cannot restore a CBZ. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const makeFixture = require('./make-fixture.cjs');

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cbz-resume-'));
  let context;
  const url = process.env.READER_URL || 'http://127.0.0.1:8080/';
  const errors = [];
  async function launch() {
    context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.BROWSER_EXECUTABLE, viewport: { width: 768, height: 1024 }, hasTouch: true });
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    const page = context.pages()[0]; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); return page;
  }
  async function loaded(page, n) {
    await page.waitForFunction(n => document.querySelector('.page-image')?.alt.startsWith('Page '+n+':'), n, { timeout: 5000 });
  }
  try {
    let page = await launch();
    const fixture = await makeFixture(), bytes = fs.readFileSync(fixture);
    const second = {name:'Second.cbz',mimeType:'application/zip',buffer:bytes};
    async function ready() { await page.waitForFunction(() => document.getElementById('resume-status').textContent.startsWith('Local copy ready.')); }
    async function library() {
      if(await page.locator('#toolbar').isHidden()) await page.locator('#toggle-controls').click();
      await page.locator('#back-library').click();
    }
    await page.locator('#file-input').setInputFiles(fixture); await loaded(page,1);
    await page.locator('#page-slider').evaluate(el => { el.value='57'; el.dispatchEvent(new Event('input')); }); await loaded(page,57);
    await ready();
    await page.reload(); await loaded(page,57);
    await context.close(); page = await launch(); await loaded(page,57);
    await page.locator('#toggle-controls').click(); await page.locator('#back-library').click();
    await page.reload(); assert.equal(await page.locator('#reader').isHidden(),true);
    await page.locator('.recent-action').filter({hasText:'Continue'}).waitFor();
    await page.locator('.recent-book').click(); await loaded(page,57);
    // OS/browser eviction of the cached file keeps the synchronous page checkpoint.
    await page.evaluate(() => CBZArchiveCache.create(indexedDB).clear());
    await page.reload();
    await page.waitForFunction(() => document.getElementById('library-status').textContent.includes('local copy is unavailable'));
    assert.match(await page.locator('#library-status').textContent(),/page 57/);
    await page.locator('#file-input').setInputFiles(fixture); await loaded(page,57); await ready();
    // A quota failure must neither overwrite the previous copy nor resume the wrong book.
    await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('Full','QuotaExceededError'); }; });
    await page.locator('#file-input').setInputFiles(second); await loaded(page,1);
    await page.locator('#page-slider').evaluate(el => {el.value='9';el.dispatchEvent(new Event('input'));}); await loaded(page,9);
    await page.waitForFunction(() => document.getElementById('resume-status').textContent.includes('could not be saved'));
    await page.reload();
    await page.waitForFunction(() => document.getElementById('library-status').textContent.includes('local copy is unavailable'));
    assert.match(await page.locator('#library-status').textContent(),/Second.cbz.*page 9/);
    assert.equal(await page.locator('#reader').isHidden(),true);
    await page.locator('#file-input').setInputFiles(second); await loaded(page,9); await ready();
    // A corrupt stored archive must fall back to reselection without saving page 1.
    await page.evaluate(async () => {
      const cache=CBZArchiveCache.create(indexedDB), record=await cache.read();
      await cache.save(record.metadata,new Blob([new Uint8Array(record.blob.size)]));
    });
    await page.reload();
    await page.waitForFunction(() => document.getElementById('library-status').textContent.includes('saved archive could not be opened'));
    assert.match(await page.locator('#library-status').textContent(),/page 9/);
    await page.locator('#file-input').setInputFiles(second); await loaded(page,9); await ready();
    await library(); await page.locator('#forget-file').click();
    await page.waitForFunction(() => document.getElementById('library-status').textContent.includes('Saved file removed'));
    assert.equal(await page.evaluate(() => CBZArchiveCache.create(indexedDB).read()),undefined);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cbz-reader.v1')).books.find(b=>b.name==='Second.cbz').page),8);
    // Concurrent replacements and removal retain only the last committed operation.
    await page.evaluate(async () => {
      const cache=CBZArchiveCache.create(indexedDB);
      const a={name:'a.cbz',size:1,lastModified:0},b={name:'b.cbz',size:1,lastModified:0};
      await Promise.all([cache.save(a,new Blob(['a'])),cache.save(b,new Blob(['b']))]);
      const record=await cache.read(); if(record.metadata.name!=='b.cbz')throw Error('Old copy overwrote the latest');
      await Promise.all([cache.save(a,new Blob(['a'])),cache.clear()]);
      if(await cache.read())throw Error('Removed file returned');
    });
    const stuck=await context.newPage(); stuck.on('pageerror',e=>errors.push(e.message));
    await stuck.addInitScript(() => {
      const state=JSON.parse(localStorage.getItem('cbz-reader.v1')); state.reading=true;
      localStorage.setItem('cbz-reader.v1',JSON.stringify(state));
      Object.defineProperty(window,'indexedDB',{value:{open:()=>({})}});
      const timer=window.setTimeout;
      window.setTimeout=(fn,ms)=>timer(fn,ms===30000?25:ms);
    });
    await stuck.goto(url);
    await stuck.waitForFunction(()=>document.getElementById('library-status').textContent.includes('Local file storage is unavailable'));
    assert.match(await stuck.locator('#library-status').textContent(),/page 9/);
    assert.equal(await stuck.locator('#open-file').isEnabled(),true); await stuck.close();
    assert.deepEqual(errors,[]);
    console.log('Auto resume passed: reload/new process at page 57, deliberate Library, Continue, eviction/reselection, quota/mismatched/corrupt files, removal, serialized replacement, storage timeout.');
  } finally { if(context) await context.close(); fs.rmSync(profile,{recursive:true,force:true}); }
})().catch(error => { console.error(error); process.exitCode=1; });
