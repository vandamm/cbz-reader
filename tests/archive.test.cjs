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

test('archive report identifies a JPEG cover and unsupported page formats without extracting images', async () => {
  const zip = new JSZip();
  zip.file('cover.jpg', PNG);
  for (let i = 1; i <= 120; i++) zip.file(`pages/${i}.webp`, 'image data');
  zip.file('__MACOSX/._cover.jpg', 'metadata');
  zip.file('ComicInfo.xml', 'metadata');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const noExtraction = { loadAsync: async (data, options) => {
    const loaded = await JSZip.loadAsync(data, options);
    for (const entry of Object.values(loaded.files)) entry.internalStream = () => { throw Error('Must not decompress pages'); };
    return loaded;
  } };
  const report = await Archive.inspect(noExtraction, bytes);
  assert.match(report, /Files: 123/);
  assert.match(report, /JPEG\/PNG\/WebP pages found: 121/);
  assert.match(report, /WEBP: 120/);
  assert.match(report, /JPG: 2/);
  assert.match(report, /cover\.jpg/);
  assert.match(report, /pages\/1\.webp/);
});

test('archive report includes hidden paths and nested archives and bounds long filenames', async () => {
  const zip = new JSZip();
  zip.file('.hidden/1.jpg', PNG);
  zip.file('chapter.cbz', 'zip');
  zip.file('unknown', 'data');
  zip.file('x'.repeat(2000) + '.png', PNG);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const report = await Archive.inspect(JSZip, bytes);
  assert.match(report, /JPEG\/PNG\/WebP pages found: 1/);
  assert.match(report, /CBZ: 1/);
  assert.match(report, /No extension: 1/);
  assert.match(report, /\.hidden\/1\.jpg/);
  assert.ok(report.length < 3000);
  await assert.rejects(Archive.inspect(JSZip, Buffer.from('bad')), /Invalid or unsupported CBZ/);
});
