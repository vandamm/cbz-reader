(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.CBZArchive = factory(root.CBZ);
}(this, function (Core) {
  'use strict';
  var MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
  var MAX_PAGE_BYTES = 24 * 1024 * 1024;

  function readEntries(JSZip, data) {
    return JSZip.loadAsync(data, { createFolders: false, checkCRC32: false }).then(function (zip) {
      return Object.keys(zip.files).map(function (key) { return zip.files[key]; });
    }, function () {
      throw Error('Invalid or unsupported CBZ. Choose a ZIP-based CBZ with JPEG/PNG/WebP pages. Encrypted, split, RAR and 7z archives are unsupported.');
    });
  }

  function open(JSZip, data) {
    return readEntries(JSZip, data).then(function (entries) {
      var pages = Core.pageEntries(entries);
      if (!pages.length) throw Error('No JPEG or PNG or WebP pages were found in this archive.');
      return pages;
    });
  }

  function inspect(JSZip, data) {
    return readEntries(JSZip, data).then(function (entries) {
      var files = entries.filter(function (entry) { return !entry.dir; });
      var formats = Object.create(null);
      files.forEach(function (entry) {
        var match = entry.name.match(/\.([^./\\]+)$/);
        var format = match ? match[1].toUpperCase().slice(0, 24) : 'No extension';
        formats[format] = (formats[format] || 0) + 1;
      });
      var lines = ['Archive check v2', 'Files: ' + files.length,
        'JPEG/PNG/WebP pages found: ' + Core.pageEntries(entries).length, '', 'File types:'];
      Object.keys(formats).sort(Core.naturalCompare).slice(0, 20).forEach(function (format) {
        lines.push(format + ': ' + formats[format]);
      });
      lines.push('', 'Sample paths (including files skipped by the reader):');
      files.sort(function (a, b) { return Core.naturalCompare(a.name, b.name); }).slice(0, 12).forEach(function (entry) {
        lines.push(entry.name.slice(0, 160));
      });
      return lines.join('\n');
    });
  }

  function imageInfo(bytes) {
    var width, height, type;
    if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 &&
        bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
      var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      width = view.getUint32(16); height = view.getUint32(20); type = 'image/png';
    } else if (bytes[0] === 255 && bytes[1] === 216) {
      var p = 2;
      while (p + 3 < bytes.length) {
        if (bytes[p++] !== 255) break;
        while (bytes[p] === 255) p++;
        var marker = bytes[p++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        var size = bytes[p] * 256 + bytes[p + 1];
        if (size < 2 || p + size > bytes.length) break;
        if (marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204 && size >= 8) {
          height = bytes[p + 3] * 256 + bytes[p + 4];
          width = bytes[p + 5] * 256 + bytes[p + 6];
          type = 'image/jpeg'; break;
        }
        p += size;
      }
      if (!type) throw Error('This JPEG is damaged or has an unsupported header.');
    } else if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 &&
        bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) {
      view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      var end = view.getUint32(4, true) + 8, offset = 12, canvasWidth, canvasHeight;
      if (end !== bytes.length) throw Error('This WebP has damaged or truncated chunks.');
      while (offset + 8 <= end) {
        var chunk = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
        var length = view.getUint32(offset + 4, true), start = offset + 8;
        offset = start + length + (length % 2);
        if (offset > end) throw Error('This WebP has damaged or truncated chunks.');
        if (chunk === 'ANIM' || chunk === 'ANMF') throw Error('Animated WebP pages are unsupported.');
        if (chunk === 'VP8X') {
          if (length !== 10) throw Error('This WebP has a damaged extended header.');
          if (bytes[start] & 2) throw Error('Animated WebP pages are unsupported.');
          canvasWidth = 1 + bytes[start + 4] + bytes[start + 5] * 256 + bytes[start + 6] * 65536;
          canvasHeight = 1 + bytes[start + 7] + bytes[start + 8] * 256 + bytes[start + 9] * 65536;
        } else if (chunk === 'VP8 ' || chunk === 'VP8L') {
          if (width) throw Error('This WebP contains multiple image frames.');
          if (chunk === 'VP8 ') {
            if (length < 10 || bytes[start + 3] !== 157 || bytes[start + 4] !== 1 || bytes[start + 5] !== 42) {
              throw Error('This WebP has a damaged image header.');
            }
            width = view.getUint16(start + 6, true) & 16383;
            height = view.getUint16(start + 8, true) & 16383;
          } else {
            if (length < 5 || bytes[start] !== 47) throw Error('This WebP has a damaged lossless header.');
            var bits = view.getUint32(start + 1, true);
            if (bits >>> 29) throw Error('This WebP lossless version is unsupported.');
            width = (bits & 16383) + 1;
            height = ((bits >>> 14) & 16383) + 1;
          }
        }
      }
      if (offset !== end || !width || !height) throw Error('This WebP has damaged or missing image data.');
      if (canvasWidth && (canvasWidth !== width || canvasHeight !== height)) throw Error('This WebP has inconsistent image dimensions.');
      type = 'image/webp';
    } else throw Error('This page is not a valid JPEG or PNG or WebP image.');
    if (!width || !height) throw Error('This image has invalid dimensions.');
    if (width > 16384 || height > 16384 || width * height > 16000000) {
      throw Error('This page is too large to decode safely on this iPad (maximum 16 megapixels). Resize the source images.');
    }
    return { type: type, width: width, height: height };
  }

  function extract(entry) {
    var cancel;
    var promise = new Promise(function (resolve, reject) {
      var chunks = [], length = 0, done = false;
      var stream = entry.internalStream('uint8array');
      cancel = function () {
        if (done) return;
        done = true; stream.pause(); chunks = [];
        reject(Error('Page loading cancelled.'));
      };
      stream.on('data', function (chunk) {
        if (done) return;
        length += chunk.length;
        if (length > MAX_PAGE_BYTES) {
          done = true; stream.pause(); chunks = [];
          reject(Error('This page is too large (maximum 24 MiB per image). Resize the source image.'));
        } else chunks.push(chunk);
      }).on('error', function () {
        if (!done) { done = true; chunks = []; reject(Error('The page could not be extracted. The archive may be damaged.')); }
      }).on('end', function () {
        if (done) return;
        done = true;
        try {
          var bytes = new Uint8Array(length), offset = 0;
          chunks.forEach(function (chunk) { bytes.set(chunk, offset); offset += chunk.length; });
          chunks = [];
          var info = imageInfo(bytes);
          resolve(new Blob([bytes], { type: info.type }));
        } catch (error) { reject(error); }
      }).resume();
    });
    promise.cancel = function () { if (cancel) cancel(); };
    return promise;
  }

  return { open: open, inspect: inspect, extract: extract, imageInfo: imageInfo,
    MAX_ARCHIVE_BYTES: MAX_ARCHIVE_BYTES, MAX_PAGE_BYTES: MAX_PAGE_BYTES };
}));
