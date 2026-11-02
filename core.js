/* Shared reader state. ES5 syntax is intentional for Safari 12. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CBZ = factory();
}(this, function () {
  'use strict';
  var KEY = 'cbz-reader.v1';

  function naturalCompare(a, b) {
    var left = a.toLowerCase().match(/\d+|\D+/g) || [];
    var right = b.toLowerCase().match(/\d+|\D+/g) || [];
    for (var i = 0; i < Math.min(left.length, right.length); i++) {
      var x = left[i], y = right[i];
      if (x === y) continue;
      if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
        var nx = x.replace(/^0+/, '') || '0', ny = y.replace(/^0+/, '') || '0';
        if (nx.length !== ny.length) return nx.length - ny.length;
        if (nx !== ny) return nx < ny ? -1 : 1;
        if (x.length !== y.length) return x.length - y.length;
      }
      return x < y ? -1 : 1;
    }
    if (left.length !== right.length) return left.length - right.length;
    return a === b ? 0 : (a < b ? -1 : 1);
  }

  function pageEntries(entries) {
    return entries.filter(function (entry) {
      return !entry.dir && /\.(jpe?g|png|webp)$/i.test(entry.name) &&
        !entry.name.split(/[\\/]/).some(function (part) { return part.charAt(0) === '.' || part === '__MACOSX'; });
    }).sort(function (a, b) { return naturalCompare(a.name, b.name); });
  }

  function fileId(file) {
    return JSON.stringify([file.name, file.size, file.lastModified || 0]);
  }

  function clampPage(page, count) {
    return Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(Number(page) || 0)));
  }

  function restoredPage(record, pages) {
    if (!record) return 0;
    if (record.pageName) {
      for (var i = 0; i < pages.length; i++) if (pages[i].name === record.pageName) return i;
    }
    return clampPage(record.page, pages.length);
  }

  function createStore(storage, onError) {
    var data = { books: [], lastId: null, reverseSwipe: false, reading: false };
    function report(error) { if (onError) onError(error); }
    try {
      var raw = storage.getItem(KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (!saved || !Array.isArray(saved.books)) throw Error('Invalid saved library');
        data.books = saved.books.filter(function (book) {
          return book && typeof book.id === 'string' && typeof book.name === 'string' &&
            typeof book.size === 'number' && isFinite(book.page) && book.page >= 0 && book.pageCount > 0;
        });
        data.lastId = saved.lastId;
        data.reverseSwipe = saved.reverseSwipe === true;
        data.reading = saved.reading === true;
      }
    } catch (error) { report(error); }
    function write() {
      try { storage.setItem(KEY, JSON.stringify(data)); return true; }
      catch (error) { report(error); return false; }
    }
    function find(file) {
      var id = fileId(file), matches = [];
      for (var i = 0; i < data.books.length; i++) {
        if (data.books[i].id === id) return data.books[i];
        if (data.books[i].name === file.name && data.books[i].size === file.size) matches.push(data.books[i]);
      }
      return matches.length === 1 ? matches[0] : null;
    }
    return {
      find: find,
      list: function () { return data.books.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }); },
      last: function () {
        return data.books.filter(function (book) { return book.id === data.lastId; })[0] || null;
      },
      save: function (file, page, count, pageName) {
        var id = fileId(file), previous = find(file);
        // Files providers may change lastModified; migrate a unique name+size match.
        data.books = data.books.filter(function (book) { return book.id !== id && (!previous || book.id !== previous.id); });
        data.books.push({ id: id, name: file.name, size: file.size, lastModified: file.lastModified || 0,
          page: clampPage(page, count), pageCount: count, pageName: pageName, updatedAt: Date.now() });
        data.lastId = id;
        return write();
      },
      reverseSwipe: function () { return data.reverseSwipe; },
      reading: function () { return data.reading; },
      setReading: function (reading) { data.reading = reading === true; return write(); },
      setReverseSwipe: function (reverse) { data.reverseSwipe = reverse === true; return write(); },
      check: write
    };
  }

  function gestureAction(startX, endX, deltaY, elapsed, width, reverse) {
    var deltaX = endX - startX;
    if (Math.abs(deltaX) >= 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      return (deltaX > 0) !== reverse ? 'next' : 'previous';
    }
    if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12 || elapsed > 700) return null;
    if (endX < width * 0.3) return 'previous';
    if (endX > width * 0.7) return 'next';
    return 'controls';
  }

  function createPageQueue(load, show, dispose, fail) {
    var generation = 0, pending = null, busy = false, active = null;
    function pump() {
      if (busy || !pending) return;
      var job = pending;
      pending = null;
      busy = true;
      var result;
      try { result = load(job.page); }
      catch (error) { result = Promise.reject(error); }
      active = result;
      Promise.resolve(result).then(function (resource) {
        if (job.generation === generation) show(resource, job.page);
        else dispose(resource);
      }, function (error) {
        if (job.generation === generation) fail(error);
      }).then(function () {
        busy = false; active = null;
        pump();
      });
    }
    return {
      request: function (page) { generation++; pending = { page: page, generation: generation }; pump(); },
      cancel: function () {
        generation++; pending = null;
        if (active && active.cancel) active.cancel();
      }
    };
  }

  return { naturalCompare: naturalCompare, pageEntries: pageEntries, fileId: fileId,
    clampPage: clampPage, restoredPage: restoredPage, createStore: createStore,
    gestureAction: gestureAction, createPageQueue: createPageQueue };
}));
