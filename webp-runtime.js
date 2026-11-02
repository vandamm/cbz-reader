/* Minimal C ABI; the caller owns the returned RGBA buffer. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBZWebPRuntime = factory();
}(this, function () {
  'use strict';
  function create(binary) {
    var memory, api;
    function grow(size) {
      size = size >>> 0;
      if (!memory || size > 128 * 1024 * 1024) return 0;
      try { memory.grow(Math.max(0, Math.ceil((size - memory.buffer.byteLength) / 65536))); return 1; }
      catch (error) { return 0; }
    }
    function abort() { throw Error('The WebP page could not be decoded within the memory limit.'); }
    var imports = {
      env: {
        emscripten_resize_heap: grow,
        emscripten_memcpy_js: function (dest, src, length) { new Uint8Array(memory.buffer).copyWithin(dest, src, src + length); return dest; },
        abort: abort,
        __assert_fail: abort
      },
      wasi_snapshot_preview1: {
        fd_close: function () { return 0; },
        fd_write: function (fd, iovs, count, written) {
          var view = new DataView(memory.buffer), size = 0;
          for (var i = 0; i < count; i++) size += view.getUint32(iovs + i * 8 + 4, true);
          view.setUint32(written, size, true);
          return 0;
        }
      }
    };
    return WebAssembly.instantiate(binary, imports).then(function (result) {
      api = result.instance.exports; memory = api.memory;
      if (api.emscripten_stack_init) api.emscripten_stack_init();
      return {
        exports: api,
        decode: function (bytes, width, height) {
          if (width !== Math.floor(width) || height !== Math.floor(height) || width < 1 || height < 1 ||
              width > 16384 || height > 16384 || width * height > 16000000 || bytes.length > 24 * 1024 * 1024) {
            throw Error('This WebP page exceeds the safe image limits.');
          }
          var input = 0, dimensions = 0, output = 0;
          try {
            input = api.malloc(bytes.length); dimensions = api.malloc(8);
            if (!input || !dimensions) abort();
            new Uint8Array(memory.buffer).set(bytes, input);
            output = api.WebPDecodeRGBA(input, bytes.length, dimensions, dimensions + 4);
            if (!output) throw Error('This WebP image is damaged or unsupported.');
            var view = new DataView(memory.buffer);
            if (view.getUint32(dimensions, true) !== width || view.getUint32(dimensions + 4, true) !== height) {
              throw Error('The WebP image dimensions do not match its header.');
            }
            var size = width * height * 4;
            if (output + size > memory.buffer.byteLength) throw Error('The WebP image data is invalid.');
            var rgba = new Uint8ClampedArray(size);
            rgba.set(new Uint8Array(memory.buffer, output, size));
            return { width: width, height: height, data: rgba.buffer };
          } finally {
            if (output) api.WebPFree(output);
            if (dimensions) api.free(dimensions);
            if (input) api.free(input);
          }
        }
      };
    });
  }
  return { create: create };
}));
