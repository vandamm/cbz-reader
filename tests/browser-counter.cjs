/* The counter must stay in the visible viewport even when innerHeight is stale. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const JSZip=require('../vendor/jszip.min.js');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE}),errors=[];
  try {
    for(const canvas of [false,true]) {
      const context=await browser.newContext({viewport:{width:768,height:768},hasTouch:true});
      await context.addInitScript(canvas=>{
        Object.defineProperty(navigator,'standalone',{get:()=>true});
        Object.defineProperty(window,'innerHeight',{get:()=>1024});
        if(canvas) {
          const types=new Map(),make=URL.createObjectURL.bind(URL),drop=URL.revokeObjectURL.bind(URL);
          URL.createObjectURL=blob=>{const url=make(blob);types.set(url,blob.type);return url;};
          URL.revokeObjectURL=url=>{types.delete(url);drop(url);};
          const src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
          Object.defineProperty(HTMLImageElement.prototype,'src',{get:src.get,set:function(url){
            if(types.get(url)==='image/webp')setTimeout(()=>this.dispatchEvent(new Event('error')),0);
            else src.set.call(this,url);
          }});
        }
      },canvas);
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      const zip=new JSZip(),ext=canvas?'webp':'jpg';
      const bytes=fs.readFileSync(path.join(__dirname,canvas?'webp/page-lossless.webp':'page.jpg'));
      zip.file('1.'+ext,bytes);zip.file('2.'+ext,bytes);
      await page.goto(process.env.READER_URL||'http://127.0.0.1:8080/');
      await page.locator('#file-input').setInputFiles({name:'counter.cbz',mimeType:'application/zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
      async function loaded(n) {
        await page.waitForFunction(({n,canvas})=>{
          const el=document.querySelector('.page-image');
          return el&&(canvas?el.tagName==='CANVAS'&&el.getAttribute('aria-label').startsWith('Page '+n+':'):el.complete&&el.alt.startsWith('Page '+n+':'));
        },{n,canvas});
      }
      async function visibleCounter(n) {
        const indicator=page.locator('#reading-position'),rect=await indicator.boundingBox(),viewport=page.viewportSize();
        assert.equal(await indicator.isVisible(),true);
        assert.equal(await page.locator('#page-count').textContent(),n+' / 2');
        assert.ok(rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=viewport.width&&rect.y+rect.height<=viewport.height,'counter is inside the actual visible screen');
        assert.equal(await indicator.evaluate(el=>{
          el.style.pointerEvents='auto';const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);el.style.pointerEvents='';return el===hit||el.contains(hit);
        }),true,'counter paints above the image and navigation zones');
        return rect;
      }
      await loaded(1);
      await page.waitForFunction(()=>document.getElementById('resume-status').textContent.startsWith('Local copy ready.'));
      await page.locator('#toggle-controls').click();
      assert.equal(await page.locator('#toolbar').isHidden(),true);
      const rect=await visibleCounter(1);
      async function doubleTap() {
        await page.locator('#stage').evaluate(stage=>{
          for(let n=0;n<2;n++)for(const type of ['touchstart','touchend']) {
            const point={clientX:384,clientY:300},event=new Event(type,{bubbles:true,cancelable:true});
            Object.defineProperties(event,{touches:{value:type==='touchstart'?[point]:[]},changedTouches:{value:[point]}});stage.dispatchEvent(event);
          }
        });
      }
      await doubleTap();assert.equal(await page.locator('.page-image').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a),2);await visibleCounter(1);
      await doubleTap();await visibleCounter(1);
      await page.screenshot({path:path.join(__dirname,canvas?'counter-webp.png':'counter.png')});
      await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);await loaded(2);await visibleCounter(2);
      await page.locator('#toggle-controls').press('Enter');assert.equal(await page.locator('#toolbar').isHidden(),false);await visibleCounter(2);
      await page.locator('#toggle-controls').press('Enter');assert.equal(await page.locator('#toolbar').isHidden(),true);
      await page.setViewportSize({width:1024,height:600});await page.waitForFunction(()=>document.getElementById('reader').style.width==='1024px');await visibleCounter(2);
      await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));});await loaded(2);await visibleCounter(2);
      await page.reload();await loaded(2);assert.equal(await page.locator('#toolbar').isHidden(),true);await visibleCounter(2);
      await page.locator('#back-library').evaluate(el=>el.click());assert.equal(await page.locator('#reading-position').isVisible(),false);
      await context.close();
      console.log((canvas?'WebP canvas':'JPEG')+': visible counter with stale viewport height, hidden/shown controls, tap-through, rotation, resume and reload.');
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
