(function () {
  'use strict';
  var Core = window.CBZ, Archive = window.CBZArchive, WebP = window.CBZWebP, fallbackWebP = false;
  function byId(id) { return document.getElementById(id); }
  var library = byId('library'), reader = byId('reader'), stage = byId('stage');
  var toolbar = byId('toolbar'), input = byId('file-input'), slider = byId('page-slider');
  var pages = [], current = 0, file = null, displayed = null, opening = false, openGeneration = 0;
  var expectedBook = null, inspecting = false, resumeTimer = null, touch = null, pinch = null;
  var zoom = { scale: 1, x: 0, y: 0 }, pendingTap = null, tapTimer = null;
  var backgrounded = document.hidden, lastTouch = 0, storageFailed = false;
  var storage;
  try { storage = window.localStorage; } catch (error) { storage = null; }
  var store = Core.createStore(storage, function () {
    storageFailed = true;
    byId('storage-warning').hidden = false;
  });
  store.check();
  var queue = Core.createPageQueue(loadPage, showPage, dispose, pageError);

  function libraryMessage(text) {
    byId('library-status').textContent = text;
    byId('library-status').hidden = !text;
  }

  function renderLibrary() {
    var list = byId('recent-list');
    list.textContent = '';
    var books = store.list();
    byId('empty-library').hidden = books.length > 0;
    books.forEach(function (book) {
      var li = document.createElement('li'), button = document.createElement('button');
      var info = document.createElement('span'), name = document.createElement('span');
      var detail = document.createElement('span'), action = document.createElement('span');
      button.type = 'button'; button.className = 'recent-book'; button.disabled = opening;
      info.className = 'recent-info'; name.className = 'recent-name'; detail.className = 'recent-detail';
      action.className = 'recent-action';
      name.textContent = book.name.replace(/\.cbz$/i, '');
      detail.textContent = 'Page ' + (book.page + 1) + ' of ' + book.pageCount;
      action.textContent = 'Select file';
      button.setAttribute('aria-label', 'Select ' + book.name + ' and resume at page ' + (book.page + 1));
      info.appendChild(name); info.appendChild(detail); button.appendChild(info); button.appendChild(action);
      button.addEventListener('click', function () { pickFile(book); });
      li.appendChild(button); list.appendChild(li);
    });
    byId('install-hint').hidden = navigator.standalone === true;
  }

  function pickFile(book, check) {
    if (opening) return;
    expectedBook = book || null;
    inspecting = check === true;
    input.value = '';
    input.click();
  }

  function checkpoint() {
    if (!file || !pages.length) return;
    var saved = store.save(file, current, pages.length, pages[current].name);
    byId('save-state').textContent = saved && !storageFailed ? 'Progress saved' : 'Progress not saved';
  }

  function dispose(resource) {
    if (!resource) return;
    resource.image.onload = null; resource.image.onerror = null;
    if (resource.image.tagName === 'CANVAS') { resource.image.width = 0; resource.image.height = 0; }
    else resource.image.removeAttribute('src');
    if (resource.image.parentNode) resource.image.parentNode.removeChild(resource.image);
    if (resource.url) window.URL.revokeObjectURL(resource.url);
  }

  function clearImage() { dispose(displayed); displayed = null; resetZoom(); }

  function message(text, recovery) {
    byId('page-message-text').textContent = text;
    byId('page-message').hidden = false;
    byId('recovery-actions').hidden = !recovery;
  }

  function pageError(error) {
    if (reader.hidden) return;
    clearImage();
    message('Page ' + (current + 1) + ': ' + error.message + ' Your position is still remembered if storage is available.', true);
  }

  function loadPage(index) {
    var entry = pages[index];
    if (!entry) return Promise.reject(Error('Select the CBZ file again to continue.'));
    var cancel;
    var promise = new Promise(function (resolve, reject) {
      var resource = null, finished = false, extraction, conversion;
      // Timers pause in the background; resume requests queue a fresh page as needed.
      var timeout = window.setTimeout(function () { finish(Error('Loading timed out. Retry or select the file again.')); }, 30000);
      function finish(error) {
        if (finished) return;
        finished = true; window.clearTimeout(timeout);
        if (error) {
          if (extraction && extraction.cancel) extraction.cancel();
          if (conversion && conversion.cancel) conversion.cancel();
          dispose(resource); reject(error);
        }
        else { resource.image.onload = null; resource.image.onerror = null; resolve(resource); }
      }
      cancel = function () { finish(Error('Page loading cancelled.')); };
      function decodeWebP(blob) {
        conversion = WebP.decode(blob);
        conversion.then(function (canvas) {
          if (finished) { canvas.width = 0; canvas.height = 0; return; }
          fallbackWebP = true;
          canvas.className = 'page-image'; canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', 'Page ' + (index + 1) + ': ' + entry.name);
          resource = { image: canvas, url: null }; finish();
        }, finish);
      }
      function display(blob) {
        if (finished) return;
        if (blob.type === 'image/webp' && fallbackWebP) { decodeWebP(blob); return; }
        var image = new Image();
        resource = { image: image, url: window.URL.createObjectURL(blob) };
        image.className = 'page-image'; image.draggable = false;
        image.alt = 'Page ' + (index + 1) + ': ' + entry.name;
        image.onload = function () { finish(); };
        image.onerror = function () {
          if (blob.type === 'image/webp') {
            dispose(resource); resource = null; decodeWebP(blob);
          } else finish(Error('Safari could not display this image. Retry or select the file again.'));
        };
        image.src = resource.url;
      }
      extraction = Archive.extract(entry);
      extraction.then(display, finish).catch(finish);
    });
    promise.cancel = function () { if (cancel) cancel(); };
    return promise;
  }

  function showPage(resource) {
    if (reader.hidden || backgrounded) { dispose(resource); return; }
    clearImage(); displayed = resource;
    resource.image.addEventListener('error', function () {
      if (displayed === resource) requestPage();
    });
    stage.insertBefore(resource.image, stage.firstChild);
    renderZoom();
    byId('page-message').hidden = true;
  }

  function updatePosition() {
    byId('page-count').textContent = (current + 1) + ' / ' + pages.length;
    slider.max = String(pages.length); slider.value = String(current + 1);
    slider.setAttribute('aria-valuetext', 'Page ' + (current + 1) + ' of ' + pages.length);
    byId('previous').setAttribute('aria-disabled', String(current === 0));
    byId('next').setAttribute('aria-disabled', String(current === pages.length - 1));
  }

  function requestPage() {
    clearImage();
    message('Loading page ' + (current + 1) + '…', false);
    queue.request(current);
  }

  function goTo(index) {
    if (opening || !pages.length) return;
    var next = Core.clampPage(index, pages.length);
    if (next === current) return;
    current = next;
    checkpoint(); // Save synchronously before starting any asynchronous image work.
    updatePosition(); requestPage();
  }

  function controls(show) {
    toolbar.hidden = !show;
    byId('toggle-controls').setAttribute('aria-expanded', String(show));
    byId('toggle-controls').setAttribute('aria-label', show ? 'Hide reader controls' : 'Show reader controls');
  }

  function toLibrary() {
    openGeneration++;
    checkpoint(); queue.cancel(); clearImage();
    WebP.release();
    pages = []; file = null;
    reader.hidden = true; library.hidden = false; document.body.classList.remove('reading');
    document.title = 'Manga reader'; controls(false); libraryMessage(''); renderLibrary();
    byId('open-file').focus();
  }

  input.addEventListener('change', function () {
    var selected = input.files && input.files[0], expected = expectedBook, checking = inspecting;
    if (!selected || opening) return;
    if (expected && selected.name !== expected.name) {
      var mismatch = 'Choose “' + expected.name + '” to restore this book, or use Open CBZ to open a different one.';
      if (reader.hidden) libraryMessage(mismatch); else message(mismatch, true);
      input.value = ''; return;
    }
    if (selected.size > Archive.MAX_ARCHIVE_BYTES) {
      var tooLarge = 'This archive exceeds the 200 MiB safety limit for this iPad. Split it into smaller CBZ files.';
      if (reader.hidden) libraryMessage(tooLarge); else message(tooLarge, true);
      input.value = ''; return;
    }
    opening = true; byId('open-file').disabled = true; byId('check-file').disabled = true; renderLibrary();
    var generation = ++openGeneration;
    libraryMessage((checking ? 'Checking ' : 'Opening ') + selected.name + '…');
    byId('archive-details').hidden = true;
    if (!reader.hidden) { queue.cancel(); clearImage(); WebP.release(); message('Opening archive…', false); }
    var metadata = { name: selected.name, size: selected.size, lastModified: selected.lastModified || 0 };
    var record = store.find(metadata) || expected;
    pages = []; // Release the old compressed archive before reading its replacement.
    var operation = checking ? Archive.inspect(window.JSZip, selected) : Archive.open(window.JSZip, selected);
    operation.then(function (entries) {
      if (generation !== openGeneration) return;
      if (checking) {
        byId('archive-report').value = entries;
        byId('archive-details').hidden = false;
        libraryMessage('Archive checked locally. Share the report below; the CBZ does not need to be sent.');
        return;
      }
      pages = entries; file = metadata; current = Core.restoredPage(record, pages);
      input.value = ''; checkpoint(); updatePosition();
      byId('book-title').textContent = metadata.name.replace(/\.cbz$/i, '');
      document.title = byId('book-title').textContent + ' · Manga reader';
      library.hidden = true; reader.hidden = false; backgrounded = document.hidden;
      document.body.classList.add('reading');
      controls(true); resize(); requestPage();
    }, function (error) {
      if (generation !== openGeneration) return;
      if (reader.hidden) libraryMessage(error.message); else pageError(error);
    }).then(function () {
      opening = false; byId('open-file').disabled = false; byId('check-file').disabled = false; input.value = ''; renderLibrary();
    });
  });

  function resize() {
    // innerHeight follows the usable Safari viewport; 100vh does not on old iOS.
    if (reader.style.height !== window.innerHeight + 'px' || reader.style.width !== window.innerWidth + 'px') resetZoom();
    reader.style.height = window.innerHeight + 'px';
    reader.style.width = window.innerWidth + 'px';
  }

  function suspend() {
    if (reader.hidden) return;
    checkpoint(); backgrounded = true; touch = null;
    queue.cancel(); clearImage(); WebP.release();
  }

  function resume() {
    resize(); window.clearTimeout(resumeTimer);
    if (reader.hidden || document.hidden) return;
    resumeTimer = window.setTimeout(function () {
      if (reader.hidden || document.hidden || opening) return;
      backgrounded = false; touch = null;
      if (!pages.length || !file) { message('Select the CBZ file again to restore your place.', true); return; }
      // Rebuild from compressed archive data rather than trust an old object URL.
      requestPage();
    }, 120);
  }

  function action(name) {
    if (name === 'next') goTo(current + 1);
    else if (name === 'previous') goTo(current - 1);
    else if (name === 'controls') controls(toolbar.hidden);
  }

  function cancelTap() {
    window.clearTimeout(tapTimer); pendingTap = null; tapTimer = null;
  }

  function renderZoom() {
    if (!displayed) return;
    var image = displayed.image, bounds = stage.getBoundingClientRect();
    var width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    var fit = Math.min(bounds.width / width, bounds.height / height);
    var limitX = Math.max(0, (width * fit * zoom.scale - bounds.width) / 2);
    var limitY = Math.max(0, (height * fit * zoom.scale - bounds.height) / 2);
    zoom.x = Math.max(-limitX, Math.min(limitX, zoom.x));
    zoom.y = Math.max(-limitY, Math.min(limitY, zoom.y));
    image.style.transform = 'translate(' + zoom.x + 'px,' + zoom.y + 'px) scale(' + zoom.scale + ')';
  }

  function resetZoom() {
    cancelTap(); touch = null; pinch = null;
    zoom = { scale: 1, x: 0, y: 0 }; renderZoom();
  }

  function toggleZoom(point) {
    if (zoom.scale > 1) { resetZoom(); return; }
    var bounds = stage.getBoundingClientRect();
    zoom = { scale: 2, x: bounds.left + bounds.width / 2 - point.clientX,
      y: bounds.top + bounds.height / 2 - point.clientY };
    renderZoom();
  }

  function tap(point, name) {
    var now = Date.now();
    if (pendingTap && now - pendingTap.time < 350 &&
        Math.abs(point.clientX - pendingTap.x) < 40 && Math.abs(point.clientY - pendingTap.y) < 40) {
      cancelTap(); toggleZoom(point); return;
    }
    cancelTap();
    pendingTap = { x: point.clientX, y: point.clientY, time: now, action: name };
    // Wait for a second tap before navigating away from the page being enlarged.
    tapTimer = window.setTimeout(function () {
      var name = pendingTap && pendingTap.action; cancelTap(); action(name);
    }, 320);
  }

  function startTouch(point, blocked) {
    touch = { x: point.clientX, y: point.clientY, time: Date.now(),
      panX: zoom.x, panY: zoom.y, moved: false, blocked: blocked };
  }

  function startPinch(points) {
    cancelTap(); touch = null;
    var bounds = stage.getBoundingClientRect();
    var dx = points[1].clientX - points[0].clientX, dy = points[1].clientY - points[0].clientY;
    pinch = { distance: Math.max(1, Math.sqrt(dx * dx + dy * dy)), scale: zoom.scale,
      x: zoom.x, y: zoom.y, centerX: (points[0].clientX + points[1].clientX) / 2 - bounds.left - bounds.width / 2,
      centerY: (points[0].clientY + points[1].clientY) / 2 - bounds.top - bounds.height / 2 };
  }

  stage.addEventListener('touchstart', function (event) {
    event.preventDefault(); lastTouch = Date.now();
    if (!displayed || opening) return;
    if (event.touches.length > 1) { startPinch(event.touches); return; }
    var point = event.touches[0];
    if (pendingTap && Math.abs(point.clientX - pendingTap.x) < 40 && Math.abs(point.clientY - pendingTap.y) < 40) {
      window.clearTimeout(tapTimer);
    }
    startTouch(point, false);
  }, { passive: false });
  stage.addEventListener('touchmove', function (event) {
    event.preventDefault();
    if (event.touches.length > 1) {
      if (!pinch) startPinch(event.touches);
      var a = event.touches[0], b = event.touches[1], bounds = stage.getBoundingClientRect();
      var dx = b.clientX - a.clientX, dy = b.clientY - a.clientY;
      zoom.scale = Math.max(1, Math.min(4, pinch.scale * Math.sqrt(dx * dx + dy * dy) / pinch.distance));
      zoom.x = (a.clientX + b.clientX) / 2 - bounds.left - bounds.width / 2 - (pinch.centerX - pinch.x) * zoom.scale / pinch.scale;
      zoom.y = (a.clientY + b.clientY) / 2 - bounds.top - bounds.height / 2 - (pinch.centerY - pinch.y) * zoom.scale / pinch.scale;
      renderZoom(); return;
    }
    if (!touch || !event.touches.length) return;
    var point = event.touches[0], moveX = point.clientX - touch.x, moveY = point.clientY - touch.y;
    if (Math.abs(moveX) > 12 || Math.abs(moveY) > 12) { touch.moved = true; cancelTap(); }
    if (zoom.scale > 1) { zoom.x = touch.panX + moveX; zoom.y = touch.panY + moveY; renderZoom(); }
  }, { passive: false });
  stage.addEventListener('touchend', function (event) {
    event.preventDefault(); lastTouch = Date.now();
    if (event.touches.length > 1) { startPinch(event.touches); return; }
    if (event.touches.length) { pinch = null; startTouch(event.touches[0], true); return; }
    var previous = touch; touch = null; pinch = null;
    if (!previous || previous.blocked) return;
    var point = event.changedTouches[0], bounds = stage.getBoundingClientRect();
    var dx = point.clientX - previous.x, dy = point.clientY - previous.y, elapsed = Date.now() - previous.time;
    var name = Core.gestureAction(previous.x - bounds.left, point.clientX - bounds.left,
      dy, elapsed, bounds.width, store.reverseSwipe());
    if (!previous.moved && Math.abs(dx) <= 12 && Math.abs(dy) <= 12 && elapsed <= 700) {
      tap(point, zoom.scale > 1 && name !== 'controls' ? null : name);
    } else {
      cancelTap(); if (zoom.scale === 1 && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) action(name);
    }
  }, { passive: false });
  stage.addEventListener('touchcancel', function () { touch = null; pinch = null; cancelTap(); lastTouch = Date.now(); });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
    stage.addEventListener(name, function (event) { event.preventDefault(); }, { passive: false });
  });
  stage.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  stage.addEventListener('dragstart', function (event) { event.preventDefault(); });
  ['previous', 'next', 'toggle-controls'].forEach(function (id) {
    byId(id).addEventListener('click', function (event) {
      if (event.detail !== 0 && Date.now() - lastTouch < 700) return;
      if (zoom.scale > 1 && id !== 'toggle-controls' && event.detail !== 0) return;
      action(id === 'toggle-controls' ? 'controls' : id);
    });
  });
  byId('open-file').addEventListener('click', function () { pickFile(null); });
  byId('check-file').addEventListener('click', function () { pickFile(null, true); });
  byId('reselect-file').addEventListener('click', function () { pickFile(file ? store.find(file) : store.last()); });
  byId('retry-page').addEventListener('click', function () { if (pages.length) requestPage(); else pickFile(store.last()); });
  byId('back-library').addEventListener('click', toLibrary);
  byId('error-library').addEventListener('click', toLibrary);
  slider.addEventListener('input', function () { goTo(Number(slider.value) - 1); });
  byId('swipe-direction').value = store.reverseSwipe() ? 'left' : 'right';
  byId('swipe-direction').addEventListener('change', function (event) { store.setReverseSwipe(event.target.value === 'left'); });
  document.addEventListener('keydown', function (event) {
    if (reader.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); resetZoom(); controls(true); return; }
    if (/^(INPUT|SELECT|BUTTON)$/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); action('next'); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); action('previous'); }
    else if (event.key === ' ') { event.preventDefault(); action('controls'); }
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) suspend(); else resume(); });
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', resume);
  window.addEventListener('blur', checkpoint);
  window.addEventListener('focus', resume);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { resize(); window.setTimeout(resize, 250); });
  renderLibrary(); resize();
  var last = store.last();
  if (last) libraryMessage('Select ' + last.name + ' to continue at page ' + (last.page + 1) + '. Your place is remembered; the file needs to be selected again.');
}());
