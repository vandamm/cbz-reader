(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBZArchiveCache = factory();
}(this, function () {
  'use strict';
  function create(indexedDB) {
    var pending = Promise.resolve();
    function run(mode, operation) {
      if (!indexedDB) return Promise.reject(Error('Local file storage is unavailable.'));
      return new Promise(function (resolve, reject) {
        var database, transaction, done = false, result;
        var timer = setTimeout(function () { finish(Error('Local file storage timed out.')); }, 30000);
        function finish(error) {
          if (done) return;
          done = true; clearTimeout(timer);
          if (error && transaction) { try { transaction.abort(); } catch (ignored) {} }
          if (database) database.close();
          if (error) reject(error); else resolve(result);
        }
        try {
          var request = indexedDB.open('cbz-reader-files', 1);
          request.onupgradeneeded = function () { request.result.createObjectStore('files'); };
          request.onerror = function () { finish(request.error || Error('Local file storage failed.')); };
          request.onblocked = function () { finish(Error('Local file storage is blocked by another window.')); };
          request.onsuccess = function () {
            database = request.result;
            if (done) { database.close(); return; }
            database.onversionchange = function () { finish(Error('Local file storage changed.')); database.close(); };
            try {
              transaction = database.transaction('files', mode);
              transaction.oncomplete = function () { finish(); };
              transaction.onabort = transaction.onerror = function () { finish(transaction.error || Error('Local file storage failed.')); };
              var job = operation(transaction.objectStore('files'));
              job.onsuccess = function () { result = job.result; };
            } catch (error) { finish(error); }
          };
        } catch (error) { finish(error); }
      });
    }
    // Serialize replacements/removal so an older save cannot overwrite a newer book.
    function write(operation) {
      var result = pending.then(function () { return run('readwrite', operation); });
      pending = result.catch(function () {});
      return result;
    }
    return {
      read: function () { return pending.then(function () { return run('readonly', function (files) { return files.get('current'); }); }); },
      save: function (metadata, blob) { return write(function (files) { return files.put({ metadata: metadata, blob: blob }, 'current'); }); },
      clear: function () { return write(function (files) { return files.delete('current'); }); }
    };
  }
  return { create: create };
}));
