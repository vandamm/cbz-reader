/* Verify both native and forced old-Safari WebP paths against real WebP pages. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const JSZip = require('../vendor/jszip.min.js');
const image = name => fs.readFileSync(path.join(__dirname,'webp',name));

(async () => {
  const zip = new JSZip();
  zip.file('143 - Злость/000_0000.jpg',fs.readFileSync(path.join(__dirname,'page.jpg')));
  for(let n=1;n<=189;n++) zip.file(`143 - Злость/143_${String(n).padStart(4,'0')}.webp`,image(n%2?'page-lossy.webp':'page-lossless.webp'));
  for(let n=0;n<10;n++) zip.file(`info${n}.json`,'{}');
  const buffer = await zip.generateAsync({type:'nodebuffer'}), filename='webp-reader-190.cbz';
  const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  const errors = [];
  try {
    for(const fallback of [false,true]) {
      const context = await browser.newContext({viewport:{width:768,height:1024},hasTouch:true});
      await context.addInitScript(({fallback,filename,size}) => {
        const id=JSON.stringify([filename,size,0]), key='cbz-reader.v1';
        if(!localStorage.getItem(key)) localStorage.setItem(key,JSON.stringify({books:[{id,name:filename,size,lastModified:0,page:0,pageCount:1,pageName:'143 - Злость/000_0000.jpg',updatedAt:1}],lastId:id,reverseSwipe:false}));
        const make=URL.createObjectURL.bind(URL), drop=URL.revokeObjectURL.bind(URL), types=new Map();
        window.liveURLs=new Set();window.peakURLs=0;
        URL.createObjectURL=function(blob){const url=make(blob);types.set(url,blob.type);liveURLs.add(url);window.peakURLs=Math.max(peakURLs,liveURLs.size);return url;};
        URL.revokeObjectURL=function(url){types.delete(url);liveURLs.delete(url);drop(url);};
        const OriginalWorker=window.Worker;window.liveWorkers=new Set();window.peakWorkers=0;window.workerStarts=0;
        window.Worker=function(url){
          const worker=new OriginalWorker(url), stop=worker.terminate.bind(worker);
          liveWorkers.add(worker);window.workerStarts++;window.peakWorkers=Math.max(peakWorkers,liveWorkers.size);
          worker.terminate=function(){liveWorkers.delete(worker);stop();};return worker;
        };
        if(fallback) {
          const src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
          Object.defineProperty(HTMLImageElement.prototype,'src',{get:src.get,set:function(value){
            if(types.get(value)==='image/webp') {const el=this;setTimeout(()=>el.dispatchEvent(new Event('error')),0);}
            else src.set.call(this,value);
          }});
        }
      },{fallback,filename,size:buffer.length});
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(process.env.READER_URL || 'http://127.0.0.1:8080/');
      const payload={name:filename,mimeType:'application/zip',buffer};
      async function loaded(n) {
        await page.waitForFunction(({n,fallback})=>{
          const el=document.querySelector('.page-image');
          if(!el)return false;
          if(fallback && n>1) return el.tagName==='CANVAS' && el.width===900 && el.height===1280 && el.getAttribute('aria-label').startsWith('Page '+n+':');
          return el.tagName==='IMG'&&el.complete&&el.naturalWidth>0&&el.alt.startsWith('Page '+n+':');
        },{n,fallback});
        assert.equal(await page.locator('#page-count').textContent(),n+' / 190');
      }
      async function jump(n){await page.locator('#page-slider').evaluate((el,n)=>{el.value=String(n);el.dispatchEvent(new Event('input'));},n);await loaded(n);}
      await page.locator('#file-input').setInputFiles(payload);await loaded(1);
      await page.locator('#next').click();await loaded(2);
      await jump(3);
      if(fallback) {
        for(let n=4;n<=190;n++) await jump(n);
        assert.equal(await page.evaluate(()=>liveWorkers.size),1);
        assert.equal(await page.evaluate(()=>peakWorkers),1);
        assert.ok(await page.evaluate(()=>peakURLs)<=1);
        await page.screenshot({path:path.join(__dirname,'webp-reader.png')});
        await jump(57);
        await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
        assert.equal(await page.locator('.page-image').count(),0);
        assert.equal(await page.evaluate(()=>liveWorkers.size),0);
        await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await loaded(57);
        assert.equal(await page.evaluate(()=>liveWorkers.size),1);
        const alpha=Array.from(image('alpha-lossless.webp'));
        const pixels=await page.evaluate(async bytes=>{
          const canvas=await CBZWebP.decode(new Blob([new Uint8Array(bytes)],{type:'image/webp'}));
          const pixel=Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data);
          canvas.width=canvas.height=0;return pixel;
        },alpha);
        assert.equal(pixels[3],128);assert.ok(Math.abs(pixels[1]-180)<=1);
      } else {
        assert.equal(await page.evaluate(()=>workerStarts),0,'native WebP must not load the fallback decoder');
        await jump(57);
      }
      async function doubleTap() {
        await page.locator('#stage').evaluate(stage => {
          for (let n=0;n<2;n++) for (const type of ['touchstart','touchend']) {
            const point={clientX:600,clientY:400}, event=new Event(type,{bubbles:true,cancelable:true});
            Object.defineProperties(event,{touches:{value:type==='touchstart'?[point]:[]},changedTouches:{value:[point]}});
            stage.dispatchEvent(event);
          }
        });
      }
      await doubleTap();
      assert.equal(await page.locator('.page-image').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a),2);
      assert.equal(await page.locator('#page-count').textContent(),'57 / 190');
      assert.equal(await page.evaluate(()=>liveWorkers.size),fallback?1:0,'zoom reuses the existing decoded page');
      await doubleTap();
      assert.equal(await page.locator('.page-image').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a),1);
      await page.waitForFunction(() => document.getElementById('resume-status').textContent.startsWith('Local copy ready.'));
      await page.reload();
      await loaded(57);
      await page.locator('#toggle-controls').click();
      await page.locator('#previous').click();await loaded(56);
      await page.locator('#back-library').click();
      assert.equal(await page.evaluate(()=>liveWorkers.size),0);
      assert.equal(await page.evaluate(()=>liveURLs.size),0);
      await context.close();
      console.log((fallback?'Fallback worker':'Native WebP')+' reading, touch zoom, progress, resource cleanup: passed');
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
