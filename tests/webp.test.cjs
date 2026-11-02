const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const JSZip = require('../vendor/jszip.min.js');
const Core = require('../core.js');
const Archive = require('../archive.js');
const image = name => fs.readFileSync(require('node:path').join(__dirname, 'webp', name));

test('the reported manga layout includes all 190 JPEG/WebP pages and skips 10 JSON files', async () => {
  const zip = new JSZip(), webp = image('page-lossy.webp');
  zip.file('143 - Злость/000_0000.jpg', fs.readFileSync(require('node:path').join(__dirname,'page.jpg')));
  for (let n = 1; n <= 189; n++) zip.file(`143 - Злость/143_${String(n).padStart(4, '0')}.webp`, webp);
  for (let n = 0; n < 10; n++) zip.file(`info${n}.json`, '{}');
  const pages = await Archive.open(JSZip, await zip.generateAsync({ type: 'uint8array' }));
  assert.equal(pages.length, 190);
  assert.match(pages[0].name, /000_0000.jpg$/);
  assert.match(pages[189].name, /143_0189.webp$/);
  assert.equal((await Archive.extract(pages[1])).type, 'image/webp');
});

for (const [name, width, height] of [['page-lossy.webp',900,1280], ['page-lossless.webp',900,1280], ['alpha.webp',5,7], ['alpha-lossless.webp',5,7]]) {
  test('validate WebP header: ' + name, () => {
    assert.deepEqual(Archive.imageInfo(image(name)), {type:'image/webp', width, height});
  });
}

test('WebP validation rejects animations, oversized dimensions and truncated chunks before decoding', () => {
  assert.throws(() => Archive.imageInfo(image('animated.webp')), /Animated WebP/);
  const huge = Buffer.from(image('alpha.webp'));
  assert.equal(huge.toString('ascii',12,16),'VP8X');
  huge[24]=255; huge[25]=255; huge[26]=0;
  assert.throws(() => Archive.imageInfo(huge), /too large|dimensions/);
  assert.throws(() => Archive.imageInfo(image('page-lossy.webp').subarray(0,25)), /damaged|truncated/);
});

test('restoring the old one-page checkpoint retains the cover when WebP pages become visible', () => {
  const pages = Core.pageEntries([{name:'cover.jpg'}, {name:'1.webp'}, {name:'2.webp'}]);
  assert.equal(Core.restoredPage({page:0,pageName:'cover.jpg'},pages),2);
});
