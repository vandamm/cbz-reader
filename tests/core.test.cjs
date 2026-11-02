const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

function storage() {
  const data = {};
  return { getItem: k => data[k] || null, setItem: (k, v) => { data[k] = v; } };
}
function file(name = 'Manga.cbz', size = 1000, lastModified = 20) { return { name, size, lastModified }; }

test('natural ordering handles folders, case, leading zeros and huge numbers deterministically', () => {
  const names = ['ch10/1.jpg', 'ch2/10.jpg', 'ch2/2.jpg', 'ch2/01.jpg', 'ch2/1.jpg', 'ch2/0002.jpg'];
  assert.deepEqual(names.sort(Core.naturalCompare), ['ch2/1.jpg', 'ch2/01.jpg', 'ch2/2.jpg', 'ch2/0002.jpg', 'ch2/10.jpg', 'ch10/1.jpg']);
  assert.ok(Core.naturalCompare('999999999999999999.jpg', '1000000000000000000.jpg') < 0);
  assert.notEqual(Core.naturalCompare('A.jpg', 'a.jpg'), 0);
});

test('only JPEG/PNG pages; ignore folders, hidden files and macOS metadata at any depth', () => {
  const names = ['2.jpg', '1.PNG', 'dir/10.jpeg', '__MACOSX/1.jpg', 'dir/__MACOSX/a.png', 'dir/._1.jpg', '.hidden/2.jpg', 'x.gif', 'ComicInfo.xml', 'folder.jpg/'];
  const entries = names.map(name => ({ name, dir: name.endsWith('/') }));
  assert.deepEqual(Core.pageEntries(entries).map(e => e.name), ['1.PNG', '2.jpg', 'dir/10.jpeg']);
});

test('file identity includes name, size and available modification metadata', () => {
  assert.equal(Core.fileId(file()), Core.fileId(file()));
  assert.notEqual(Core.fileId(file()), Core.fileId(file('Other.cbz')));
  assert.notEqual(Core.fileId(file()), Core.fileId(file('Manga.cbz', 2000)));
  assert.equal(Core.fileId({ name: 'a', size: 1 }), Core.fileId({ name: 'a', size: 1, lastModified: 0 }));
});

test('each navigation saves immediately; a new store restores each book after restart', () => {
  const disk = storage();
  let store = Core.createStore(disk);
  store.save(file(), 56, 120, '057.jpg');
  store.save(file('Other.cbz'), 8, 90, '9.jpg');
  store = Core.createStore(disk);
  assert.equal(store.find(file()).page, 56);
  assert.equal(store.find(file('Other.cbz')).page, 8);
  assert.equal(store.last().name, 'Other.cbz');
  assert.equal(store.list().length, 2);
});

test('metadata drift restores a unique name+size match, but never guesses by name alone', () => {
  const store = Core.createStore(storage());
  store.save(file(), 56, 120, '57.jpg');
  assert.equal(store.find(file('Manga.cbz', 1000, 999)).page, 56);
  assert.equal(store.find(file('Manga.cbz', 5000)), null);
});

test('revised archives clamp the saved position and preserve a matching page filename', () => {
  assert.equal(Core.restoredPage({ page: 56 }, Array.from({ length: 20 }, (_, i) => ({ name: `${i}.jpg` }))), 19);
  assert.equal(Core.restoredPage({ page: 56, pageName: '57.jpg' }, [{ name: 'cover.jpg' }, { name: '57.jpg' }]), 1);
  assert.equal(Core.clampPage(-9, 100), 0);
  assert.equal(Core.clampPage(NaN, 100), 0);
});

test('tap/swipe navigation follows the spec and stops at both ends', () => {
  assert.equal(Core.gestureAction(90, 92, 2, 10, 100, false), 'next');
  assert.equal(Core.gestureAction(10, 12, 2, 10, 100, false), 'previous');
  assert.equal(Core.gestureAction(50, 51, 2, 10, 100, false), 'controls');
  assert.equal(Core.gestureAction(20, 80, 2, 100, 100, false), 'next');
  assert.equal(Core.gestureAction(20, 80, 2, 100, 100, true), 'previous');
  assert.equal(Core.gestureAction(20, 80, 100, 100, 100, false), null);
  assert.equal(Core.gestureAction(90, 90, 0, 1500, 100, false), null);
  assert.equal(Core.clampPage(100, 100), 99);
});

test('storage refusal and corrupted data are reported without crashing the reader', () => {
  const errors = [];
  const store = Core.createStore({ getItem: () => '{broken', setItem: () => { throw Error('quota'); } }, e => errors.push(e));
  assert.equal(store.save(file(), 56, 120, '57.jpg'), false);
  assert.equal(store.find(file()).page, 56);
  assert.equal(errors.length, 2);
});

test('swipe preference persists', () => {
  const disk = storage();
  Core.createStore(disk).setReverseSwipe(true);
  assert.equal(Core.createStore(disk).reverseSwipe(), true);
});

test('page queue serializes extraction, skips obsolete requests and disposes stale resources', async () => {
  const gates = [], started = [], shown = [], released = [];
  const queue = Core.createPageQueue(page => {
    started.push(page);
    return new Promise(resolve => gates.push(() => resolve('url' + page)));
  }, (value, page) => shown.push([value, page]), value => released.push(value), e => { throw e; });
  queue.request(0); queue.request(1); queue.request(2);
  assert.deepEqual(started, [0]);
  gates.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [0, 2]);
  assert.deepEqual(released, ['url0']);
  gates.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(shown, [['url2', 2]]);
  queue.request(3); queue.cancel(); gates.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(released, ['url0', 'url3']);
});

test('queue recovers from a failed extraction and suppresses obsolete failures', async () => {
  const rejects = [], errors = [], shown = [];
  const queue = Core.createPageQueue(page => new Promise((resolve, reject) => rejects.push({ resolve, reject })), (v, p) => shown.push(p), () => {}, e => errors.push(e.message));
  queue.request(0); queue.request(1);
  rejects[0].reject(Error('old'));
  await new Promise(resolve => setImmediate(resolve));
  rejects[1].reject(Error('current'));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, ['current']);
  queue.request(2); rejects[2].resolve('ok');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(shown, [2]);
});

test('cancel stops cancellable work before the next page starts', async () => {
  let active = 0, peak = 0;
  const queue = Core.createPageQueue(() => {
    active++; peak = Math.max(peak, active);
    let stop;
    const promise = new Promise((resolve, reject) => { stop = () => { active--; reject(Error('cancelled')); }; });
    promise.cancel = stop;
    return promise;
  }, () => {}, () => {}, () => {});
  queue.request(0); queue.cancel(); queue.request(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, 1);
  assert.equal(peak, 1);
  queue.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, 0);
});
