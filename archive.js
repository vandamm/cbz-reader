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
      throw Error('Invalid or unsupported CBZ. Choose a ZIP-based CBZ with JPEG/PNG pages. Encrypted, split, RAR and 7z archives are unsupported.');
    });
  }

  function open(JSZip, data) {
    return readEntries(JSZip, data).then(function (entries) {
      var pages = Core.pageEntries(entries);
      if (!pages.length) throw Error('No JPEG or PNG pages were found in this archive.');
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
      var lines = ['Archive check v1', 'Files: ' + files.length,
        'JPEG/PNG pages found: ' + Core.pageEntries(entries).length, '', 'File types:'];
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
    } else throw Error('This page is not a valid JPEG or PNG image.');
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
