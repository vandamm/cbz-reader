/* Multiple saved books, independent positions, and migration from the one-file cache. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const makeFixture = require('./make-fixture.cjs');

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'cbz-library-'));
  let context, page;
  const errors=[], url=process.env.READER_URL||'http://127.0.0.1:8080/';
  const fixture=await makeFixture(), firstName=path.basename(fixture), bytes=fs.readFileSync(fixture);
  async function launch() {
    context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.BROWSER_EXECUTABLE,viewport:{width:768,height:1024},hasTouch:true});
    await context.addInitScript(()=>{
      window.archiveReads=0;const get=IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get=function(){window.archiveReads++;return get.apply(this,arguments);};
    });
    page=context.pages()[0];page.on('pageerror',e=>errors.push(e.message));
  }
  const book=name=>page.locator('#recent-list li').filter({has:page.locator('.recent-name',{hasText:name.replace(/\.cbz$/i,'')})});
  async function loaded(n) {await page.waitForFunction(n=>document.querySelector('.page-image')?.alt.startsWith('Page '+n+':'),n,{timeout:5000});}
  async function library() {if(await page.locator('#toolbar').isHidden())await page.locator('#toggle-controls').click();await page.locator('#back-library').click();}
  async function ready() {await page.waitForFunction(()=>document.getElementById('resume-status').textContent.startsWith('Local copy ready.'));}
  try {
    await launch();
    // Seed the actual previous-release schema before the app can open its database.
    await page.route('**/app.js*',route=>route.abort()); await page.goto(url);
    await page.evaluate(async ({firstName,fixtureURL})=>{
      const blob=await (await fetch(fixtureURL)).blob(),metadata={name:firstName,size:blob.size,lastModified:0};
      const store=CBZ.createStore(localStorage);store.save(metadata,56,120,'Volume 1/57.jpg');store.setReading(false);
      await new Promise((resolve,reject)=>{
        const open=indexedDB.open('cbz-reader-files',1);
        open.onupgradeneeded=()=>open.result.createObjectStore('files');open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{const db=open.result,tx=db.transaction('files','readwrite');tx.objectStore('files').put({metadata,blob},'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
      });
    },{firstName,fixtureURL:new URL('tests/fixtures/reader-test-120.cbz',url).href});
    await page.unroute('**/app.js*');await page.reload();
    await book(firstName).locator('.recent-action').filter({hasText:'Continue'}).waitFor();
    await book(firstName).locator('.recent-book').click();await loaded(57);await library();
    await page.locator('#file-input').setInputFiles({name:'Second.cbz',mimeType:'application/zip',buffer:bytes});await loaded(1);
    await page.locator('#page-slider').evaluate(el=>{el.value='9';el.dispatchEvent(new Event('input'));});await loaded(9);await ready();await library();
    assert.match(await book(firstName).textContent(),/Page 57 of 120/);assert.match(await book('Second.cbz').textContent(),/Page 9 of 120/);
    // Opening the second book must not discard the first book's archive.
    await book(firstName).locator('.recent-book').click();await loaded(57);
    await page.locator('#next').click();await loaded(58);await library();
    await context.close();await launch();await page.goto(url);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.recent-action')).filter(el=>el.textContent==='Continue').length===2);
    assert.equal(await page.evaluate(()=>archiveReads),0,'listing the library must not read every archive Blob');
    await page.screenshot({path:path.join(__dirname,'saved-library.png')});
    await book('Second.cbz').locator('.recent-book').click();await loaded(9);await library();
    await book(firstName).locator('.remove-book').click();
    await book(firstName).locator('.recent-action').filter({hasText:'Select file'}).waitFor();
    assert.match(await book(firstName).textContent(),/Page 58 of 120/);
    await book('Second.cbz').locator('.recent-book').click();await loaded(9);
    // Files providers can change modification metadata; don't accumulate copies of the same book.
    await page.locator('#file-input').setInputFiles({name:'Second.cbz',mimeType:'application/zip',buffer:bytes});await loaded(9);await ready();
    assert.equal(await page.evaluate(async()=> (await CBZArchiveCache.create(indexedDB).list()).length),1);
    await library();await book('Second.cbz').locator('.remove-book').click();
    await book('Second.cbz').locator('.recent-action').filter({hasText:'Select file'}).waitFor();
    assert.match(await book('Second.cbz').textContent(),/Page 9 of 120/);
    // A manual open during a slow startup listing must retain the other saved books.
    await page.locator('#file-input').setInputFiles(fixture);await loaded(58);await ready();await library();
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      let module;
      Object.defineProperty(window,'CBZArchiveCache',{
        get:()=>module,set:value=>{
          module=value;const create=value.create;
          value.create=function(db){
            const cache=create(db),list=cache.list;
            cache.list=()=>list().then(ids=>new Promise(resolve=>{window.finishIndex=()=>resolve(ids);}));
            return cache;
          };
        }
      });
    });
    await page.goto(url);await page.waitForFunction(()=>typeof finishIndex==='function');
    await page.locator('#file-input').setInputFiles({name:'Second.cbz',mimeType:'application/zip',buffer:bytes});await loaded(9);await ready();
    await page.evaluate(()=>finishIndex());await library();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.recent-action')).filter(el=>el.textContent==='Continue').length===2,{},{timeout:2000});
    assert.deepEqual(errors,[]);
    console.log('Library passed: legacy migration, two independently saved books, click-to-resume, process restart, key-only listing, per-book removal and metadata drift.');
  } finally {if(context)await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
