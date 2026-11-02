/* Decoding runs off the UI thread and is stopped by terminating this worker. */
importScripts('webp-runtime.js?v=3');
var decoder = null;
function loadDecoder() {
  if (!decoder) decoder = new Promise(function (resolve, reject) {
    var request = new XMLHttpRequest();
    request.open('GET', 'vendor/webp-decoder.wasm?v=3', true);
    request.responseType = 'arraybuffer';
    request.onload = function () {
      if (request.status !== 200) { reject(Error('The WebP decoder could not be loaded. Check your connection.')); return; }
      CBZWebPRuntime.create(request.response).then(resolve, reject);
    };
    request.onerror = function () { reject(Error('The WebP decoder could not be loaded. Check your connection.')); };
    request.send();
  });
  return decoder;
}
self.onmessage = function (event) {
  var job = event.data;
  loadDecoder().then(function (runtime) {
    var image = runtime.decode(new Uint8Array(job.data), job.width, job.height);
    self.postMessage({ id: job.id, width: image.width, height: image.height, data: image.data }, [image.data]);
  }).catch(function (error) {
    self.postMessage({ id: job.id, error: error.message || 'This WebP page could not be decoded.' });
  });
};
