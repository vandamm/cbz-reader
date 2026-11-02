const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Runtime = require('../webp-runtime.js');
const read = name => new Uint8Array(fs.readFileSync(path.join(__dirname,'webp',name)));

test('portable raw decoder handles lossy, lossless and alpha WebP with explicit cleanup', async () => {
  const runtime = await Runtime.create(fs.readFileSync(path.join(__dirname, '../vendor/webp-decoder.wasm')));
  assert.equal(runtime.exports.decoderVersion(), 0x010302);
  for (const [name,width,height] of [['page-lossy.webp',900,1280],['page-lossless.webp',900,1280],['alpha.webp',5,7],['alpha-lossless.webp',5,7]]) {
    const result = runtime.decode(read(name),width,height);
    assert.equal(result.width,width); assert.equal(result.height,height); assert.equal(result.data.byteLength,width*height*4);
    if (name==='alpha-lossless.webp') assert.deepEqual(Array.from(new Uint8Array(result.data,0,4)),[30,180,90,128]);
  }
  const bytes=read('page-lossy.webp');
  const before=runtime.exports.memory.buffer.byteLength;
  for(let i=0;i<190;i++) runtime.decode(bytes,900,1280);
  assert.equal(runtime.exports.memory.buffer.byteLength,before,'decoder heap must reuse freed page buffers');
  assert.throws(()=>runtime.decode(new Uint8Array([1,2,3]),5,7),/damaged|unsupported/);
  assert.throws(()=>runtime.decode(bytes,1,1),/dimensions/);
  assert.throws(()=>runtime.decode(bytes,50000,50000),/safe image limits/);
  assert.throws(()=>runtime.decode(bytes,-1,-1),/safe image limits/);
  assert.throws(()=>runtime.decode(bytes,NaN,1280),/safe image limits/);
  const after=runtime.decode(bytes,900,1280);
  assert.equal(after.data.byteLength,900*1280*4,'a failed decode must leave the decoder reusable');
});
