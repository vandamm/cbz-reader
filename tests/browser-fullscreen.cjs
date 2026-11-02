const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=require('./make-fixture.cjs');
(async()=>{
  const book=await fixture();
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    for(const mode of ['css','native','legacy-element','legacy-flag']) {
      const context=await browser.newContext({viewport:{width:768,height:1024},hasTouch:true});
      if(mode!=='native') await context.addInitScript(mode=>{
        Object.defineProperty(document,'fullscreenEnabled',{get:()=>false});
        if(!mode.startsWith('legacy'))return;
        let full=false;
        Object.defineProperties(document,{
          fullscreenElement:{get:()=>null},webkitFullscreenElement:{get:()=>null},
          webkitCurrentFullScreenElement:{get:()=>mode==='legacy-element'&&full?document.getElementById('reader'):null},
          webkitIsFullScreen:{get:()=>full},webkitFullscreenEnabled:{get:()=>true},
          exitFullscreen:{value:undefined},webkitExitFullscreen:{value:undefined},
          webkitCancelFullScreen:{value:function(){
            if(window.refuseExit)return Promise.reject(Error('Exit refused'));
            setTimeout(()=>{full=false;document.dispatchEvent(new Event('webkitfullscreenchange'));},20);
          }}
        });
        Element.prototype.webkitRequestFullscreen=undefined;
        Element.prototype.webkitRequestFullScreen=function(){full=true;document.dispatchEvent(new Event('webkitfullscreenchange'));};
      },mode);
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(process.env.READER_URL||'http://127.0.0.1:8080/');
      await page.locator('#file-input').setInputFiles(book);
      await page.waitForSelector('.page-image');
      await page.locator('#page-slider').evaluate(el=>{el.value='57';el.dispatchEvent(new Event('input'));});
      await page.waitForFunction(()=>document.querySelector('.page-image')?.alt.startsWith('Page 57:'));
      await page.locator('#fullscreen').tap();
      await page.waitForFunction(()=>document.getElementById('fullscreen').getAttribute('aria-pressed')==='true');
      assert.equal(await page.locator('#toolbar').isHidden(),true,mode+': toolbar should hide');
      assert.equal(await page.locator('#exit-fullscreen').isVisible(),true,mode+': a visible exit must remain');
      const bounds=await page.locator('#exit-fullscreen').boundingBox();
      assert.ok(bounds.width>=44&&bounds.height>=44);
      assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=768&&bounds.y+bounds.height<=1024);
      if(mode==='css') await page.screenshot({path:path.join(__dirname,'fullscreen-exit.png')});
      if(mode==='legacy-element') {
        await page.evaluate(()=>{window.refuseExit=true;});
        await page.locator('#exit-fullscreen').tap();
        await page.waitForFunction(()=>document.getElementById('fullscreen-note').textContent.includes('could not exit'));
        assert.equal(await page.locator('#exit-fullscreen').isVisible(),true,'failed native exit must keep the exit available');
        await page.evaluate(()=>{window.refuseExit=false;});
      }
      await page.locator('#exit-fullscreen').tap();
      await page.waitForFunction(()=>document.getElementById('exit-fullscreen').hidden);
      assert.equal(await page.locator('#toolbar').isVisible(),true);
      assert.equal(await page.locator('#page-count').textContent(),'57 / 120');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cbz-reader.v1')).books[0].page),56);
      assert.equal(await page.evaluate(()=>!!(document.fullscreenElement||document.webkitIsFullScreen)),false);
      await page.locator('#fullscreen').tap();
      await page.locator('#exit-fullscreen').focus();
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>document.getElementById('exit-fullscreen').hidden);
      assert.equal(await page.locator('#page-count').textContent(),'57 / 120');
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(mode+': visible touch exit and Escape preserve page 57');
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
