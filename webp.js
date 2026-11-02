/* WebP fallback for browsers without native support. Decode one page at a time. */
(function () {
  'use strict';
  var worker = null, pending = null, nextId = 0;

  function stopWorker() {
    if (worker) { worker.terminate(); worker = null; }
  }

  function decode(blob) {
    if (pending) return Promise.reject(Error('Another WebP page is still loading.'));
    var cancel;
    var promise = new Promise(function (resolve, reject) {
      var reader = new FileReader(), done = false, id = ++nextId;
      function finish(error, canvas) {
        if (done) { if (canvas) { canvas.width = 0; canvas.height = 0; } return; }
        done = true; pending = null;
        reader.onload = null; reader.onerror = null;
        if (reader.readyState === 1) reader.abort();
        if (worker) { worker.onmessage = null; worker.onerror = null; }
        if (error) { stopWorker(); reject(error); }
        else resolve(canvas);
      }
      cancel = function () { finish(Error('WebP loading cancelled.')); };
      pending = cancel;
      if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
        finish(Error('This browser cannot decode WebP. Use a browser with WebP support or a JPEG/PNG archive.'));
        return;
      }
      reader.onerror = function () { finish(Error('The WebP page could not be read.')); };
      reader.onload = function () {
        if (done) return;
        try {
          var bytes = new Uint8Array(reader.result), info = window.CBZArchive.imageInfo(bytes);
          if (info.type !== 'image/webp') throw Error('The page is not a WebP image.');
          if (!worker) worker = new Worker('webp-worker.js?v=3');
          worker.onerror = function (event) {
            event.preventDefault(); finish(Error('The WebP decoder failed. Retry the page.'));
          };
          worker.onmessage = function (event) {
            var result = event.data;
            if (done || result.id !== id) return;
            var canvas = null;
            try {
              if (result.error) throw Error(result.error);
              if (result.width !== info.width || result.height !== info.height || result.data.byteLength !== info.width * info.height * 4) {
                throw Error('The WebP decoder returned invalid image data.');
              }
              canvas = document.createElement('canvas'); canvas.width = result.width; canvas.height = result.height;
              var context = canvas.getContext('2d');
              if (!context) throw Error('Safari has no memory available for this page.');
              context.putImageData(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height), 0, 0);
              finish(null, canvas);
            } catch (error) {
              if (canvas) { canvas.width = 0; canvas.height = 0; }
              finish(error);
            }
          };
          worker.postMessage({ id: id, data: bytes.buffer, width: info.width, height: info.height }, [bytes.buffer]);
        } catch (error) { finish(error); }
      };
      reader.readAsArrayBuffer(blob);
    });
    promise.cancel = function () { if (cancel) cancel(); };
    return promise;
  }

  window.CBZWebP = {
    decode: decode,
    release: function () { if (pending) pending(); stopWorker(); }
  };
}());
