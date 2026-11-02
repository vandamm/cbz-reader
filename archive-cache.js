(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.CBZArchiveCache = factory(root.CBZ);
}(this, function (Core) {
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
          var request = indexedDB.open('cbz-reader-files', 2);
          request.onupgradeneeded = function (event) {
            var files = event.oldVersion === 0 ? request.result.createObjectStore('files') : request.transaction.objectStore('files');
            if (event.oldVersion === 1) {
              var legacy = files.get('current');
              legacy.onsuccess = function () {
                var record = legacy.result;
                if (record && record.metadata) files.put(record, Core.fileId(record.metadata));
                files.delete('current');
              };
            }
          };
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
    // Serialize updates so removal cannot race a pending save of the same book.
    function write(operation) {
      var result = pending.then(function () { return run('readwrite', operation); });
      pending = result.catch(function () {});
      return result;
    }
    return {
      list: function () { return pending.then(function () { return run('readonly', function (files) { return files.getAllKeys(); }); }); },
      read: function (id) { return pending.then(function () { return run('readonly', function (files) { return files.get(id); }); }); },
      save: function (metadata, blob, previousId) {
        return write(function (files) {
          var id = Core.fileId(metadata), job = files.put({ metadata: metadata, blob: blob }, id);
          if (previousId && previousId !== id) files.delete(previousId);
          return job;
        });
      },
      remove: function (id) { return write(function (files) { return files.delete(id); }); },
      clear: function () { return write(function (files) { return files.clear(); }); }
    };
  }
  return { create: create };
}));
