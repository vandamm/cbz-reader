const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('../vendor/jszip.min.js');
const Archive = require('../archive.js');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKb8AAAAASUVORK5CYII=', 'base64');

test('a real 120-page ZIP opens, sorts, ignores metadata and extracts only the requested page', async () => {
  const zip = new JSZip();
  for (let page = 120; page > 0; page--) zip.file(`volume/${page}.png`, PNG);
  zip.file('__MACOSX/._1.png', 'metadata'); zip.file('volume/._2.png', 'metadata'); zip.file('ComicInfo.xml', 'meta');
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const pages = await Archive.open(JSZip, data);
  assert.equal(pages.length, 120);
  assert.equal(pages[1].name, 'volume/2.png');
  assert.equal(pages[119].name, 'volume/120.png');
  const blob = await Archive.extract(pages[56]);
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, PNG.length);
});

test('invalid, empty and image-free archives produce useful errors', async () => {
  await assert.rejects(Archive.open(JSZip, Buffer.from('not a zip')), /Invalid or unsupported CBZ/);
  const empty = await new JSZip().generateAsync({ type: 'uint8array' });
  await assert.rejects(Archive.open(JSZip, empty), /No JPEG or PNG/);
});

test('image validation rejects fake images and extreme pixel dimensions before decoding', () => {
  assert.throws(() => Archive.imageInfo(Buffer.from('bad')), /JPEG or PNG/);
  const bomb = Buffer.from(PNG); bomb.writeUInt32BE(50000, 16);
  assert.throws(() => Archive.imageInfo(bomb), /too large/);
  assert.equal(Archive.imageInfo(PNG).type, 'image/png');
  const jpeg = Buffer.from([255, 216, 255, 224, 0, 4, 0, 0, 255, 192, 0, 8, 8, 0, 100, 0, 80, 1]);
  assert.deepEqual(Archive.imageInfo(jpeg), { type: 'image/jpeg', width: 80, height: 100 });
  assert.throws(() => Archive.imageInfo(jpeg.subarray(0, 13)), /damaged/);
});

test('bounded extraction rejects an oversized decompressed page', async () => {
  const zip = new JSZip(); zip.file('1.png', Buffer.alloc(Archive.MAX_PAGE_BYTES + 1));
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const pages = await Archive.open(JSZip, data);
  await assert.rejects(Archive.extract(pages[0]), /too large/);
});

test('cancelling extraction pauses its stream and settles its promise', async () => {
  let paused = false;
  const stream = { on() { return this; }, resume() { return this; }, pause() { paused = true; } };
  const extraction = Archive.extract({ internalStream: () => stream });
  assert.equal(typeof extraction.cancel, 'function');
  extraction.cancel();
  await assert.rejects(extraction, /cancelled/);
  assert.equal(paused, true);
});
