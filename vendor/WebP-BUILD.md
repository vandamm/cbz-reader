# WebP decoder provenance and ABI

`webp-decoder.wasm` contains scalar libwebp **1.3.2**, with WebAssembly MVP
instructions and a 128 MiB memory maximum. It is intended for Safari iOS 12.
The decoder version is verified by its C version function, `0x010302`.
No SIMD, bulk-memory, sign-extension, saturating conversion, threads or
JavaScript BigInt support is required. Initial memory is 258 pages (16.125 MiB).
A real iOS 12 device has not been tested.

## Source and licensing

- Package: [wasm-webp 0.1.0](https://registry.npmjs.org/wasm-webp/-/wasm-webp-0.1.0.tgz),
  repository commit `65e1ba32146adc2e14360c557a113c141d8058c9`.
- Package archive SHA-256:
  `33e04563a0f50816373215f8575d85e2b4a326ed735fec9c4525445d40c36446`.
- Original `package/dist/esm/webp-wasm.wasm` SHA-256:
  `4d438a73dfe550d608d6b89eee34ea9374d58d3ffa0355218766281fc9a76c22`.
- Final decoder SHA-256:
  `1779638505184c2d297b6563b8496a20172c4f8f87d2c1db663972db9b8abb40`.
- libwebp uses `WebP-BSD-LICENSE.txt`; the package uses
  `WebP-MIT-LICENSE.txt`. Both notices must accompany redistribution.

The package's C++ `decodeRGBA` wrapper does not free libwebp's returned pixels
and does not check NULL. This artifact removes its entry points and bindings.
It exposes the underlying C decoder and its allocator directly.

## ABI

Exports, with all pointer/length values represented by JavaScript numbers:

```text
memory: WebAssembly.Memory
malloc(byteLength) -> pointer, or 0 on allocation failure
free(pointer)
WebPDecodeRGBA(inputPointer, inputLength, widthPointer, heightPointer)
  -> RGBA pixel pointer, or 0 on decoding/allocation failure
WebPFree(pointer)
decoderVersion() -> 0x010302
```

`widthPointer` and `heightPointer` each address a little-endian signed 32-bit
integer. Successful output has `width * height * 4` tightly packed RGBA bytes.
Copy or use pixels before `WebPFree`, and release both input and dimension
allocations with `free` in a `finally` block. `WebPFree` is an export alias of
this build's same `free` allocator, matching libwebp's default allocator.
Recreate typed-array/DataView objects after any allocation or decode because
memory growth detaches old views. There is no initializer or constructor call.
Animated WebP is outside this still-image C ABI and must be rejected by callers.

The only imports are:

```text
env.emscripten_memcpy_js(destination, source, byteLength) -> void
env.emscripten_resize_heap(requestedBytes) -> 1 on success, 0 on failure
wasi_snapshot_preview1.fd_close(fd) -> errno
wasi_snapshot_preview1.fd_write(fd, iovPointer, iovCount, bytesWrittenPointer) -> errno
```

`memcpy_js` can use a fresh `Uint8Array(memory.buffer).copyWithin(dst, src,
src + length)`. `resize_heap` must reject requests above 134217728, grow by
`Math.ceil((requestedBytes - memory.buffer.byteLength) / 65536)` pages, return
1 on success and catch growth failure to return 0. The binary independently
caps memory at 2048 pages. `fd_close` may return 0; a silent `fd_write` shim
can total the iovec lengths, store the count at `bytesWrittenPointer`, and
return 0. Neither WASI import was needed by the verified decode paths.

## Binary transformation

Used Binaryen **132.0.0**. First lower post-MVP instructions from the original
package binary (the original is scalar):

```sh
wasm-opt webp-wasm.wasm --mvp-features --enable-sign-ext \
  --enable-nontrapping-float-to-int --enable-bulk-memory \
  --enable-bulk-memory-opt --llvm-memory-copy-fill-lowering \
  --signext-lowering --llvm-nontrapping-fptoint-lowering \
  --strip-target-features -o portable.wasm
```

The intermediate SHA-256 is
`24ee95e1cd6510627b70a593efbfd4d2e3a03a815660c899ef18ee4f2a37589f`.
Then use Binaryen's ESM API (here `binaryen` is the imported module, `fs` is
Node's filesystem module):

```js
let m = binaryen.readBinary(fs.readFileSync('portable.wasm'));
const exports = [];
for (let i = 0; i < m.getNumExports(); i++) {
  exports.push(binaryen.getExportInfo(m.getExportByIndex(i)).name);
}
for (const name of exports) {
  if (!['memory', 'malloc', 'free'].includes(name)) m.removeExport(name);
}
// Names below apply only to the exact, hash-pinned intermediate above.
m.addFunctionExport('596', 'WebPDecodeRGBA');
m.addFunctionExport('1234', 'WebPFree');
m.addFunctionExport('560', 'decoderVersion');
const segment = binaryen.getElementSegmentInfo(m.getElementSegmentByIndex(0));
const offset = binaryen.getExpressionInfo(segment.offset).value;
m.removeElementSegment(segment.name);
let group = [], start = 0;
for (let i = 0; i <= segment.data.length; i++) {
  const f = segment.data[i];
  // Remove C++ binding and C++ runtime table entries; retain C/libwebp callbacks.
  if (f && +f >= 519 && +f < 1391) {
    if (!group.length) start = i;
    group.push(f);
  } else if (group.length) {
    m.addActiveElementSegment(segment.table, 'raw' + start, group,
      m.i32.const(offset + start));
    group = [];
  }
}
m.runPasses(['remove-unused-module-elements']);
m = binaryen.parseText(m.emitText().replace(
  '(memory $0 258 32768)', '(memory $0 258 2048)'));
m.setFeatures(binaryen.Features.MVP);
if (m.validate() !== 1) throw new Error('MVP validation failed');
fs.writeFileSync('webp-decoder.wasm', m.emitBinary());
```

Function `596` is the direct C routine called by the removed `decodeRGBA`
wrapper and uses libwebp's RGBA colorspace value 1. Function `560` returns the
C decoder version. Function `1234` is the package's exported C `free`.
The remaining function table retains some unexported library code; no attempt
was made to hand-prune decoder callback reachability.

## Verification performed

- Binaryen's separate `--mvp-features` validation accepts the final binary.
- Direct instantiation in Node, without constructor calls or C++ glue, succeeds.
- RGBA bytes exactly match native `dwebp` 1.6.0 for the repository's lossy,
  lossless, lossy-alpha and lossless-alpha fixtures.
- Each fixture decoded 252 times with pixels freed every time; the second
  decode reused the first output pointer and the memory size stayed constant
  throughout each loop (16,908,288 bytes).
- Invalid input returns NULL. A 24 MiB allocation grows memory successfully;
  a 129 MiB allocation returns NULL and growth beyond the wasm cap throws.
