import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appLabelLines, brickArchitectLabelUrl, checkBrickArchitect, fetchLabelFile, labelNumber, packStrips, strips } from '../js/labels.js';
import { createStore, memoryBackend } from '../js/store.js';

test('Brick Architect label address follows brickarchitect.com/label/<number>.lbx', () => {
  assert.equal(brickArchitectLabelUrl({ partNum: '3009' }), 'https://brickarchitect.com/label/3009.lbx');
  assert.equal(brickArchitectLabelUrl({ partNum: '3069b' }), 'https://brickarchitect.com/label/3069b.lbx');
  assert.equal(brickArchitectLabelUrl({ partNum: '' }), '');
});

test('a part can use a different label number, kept with the part', () => {
  const store = createStore(memoryBackend());
  store.ensurePart('15573');
  assert.equal(labelNumber(store.getPart('15573')), '15573');
  store.savePart('15573', { labelNum: '3794' });
  assert.equal(brickArchitectLabelUrl(store.getPart('15573')), 'https://brickarchitect.com/label/3794.lbx');
  assert.equal(JSON.parse(store.exportJSON()).parts[0].labelNum, '3794');
});

const reply = (status, type = 'application/octet-stream') => async () => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : null) },
});

test('asks Brick Architect whether it has a label', async () => {
  const calls = [];
  const has = await checkBrickArchitect({ partNum: '3001' }, async (url, opts) => {
    calls.push([url, opts.method]);
    return reply(200)();
  });
  assert.equal(has, true);
  assert.deepEqual(calls, [['https://brickarchitect.com/label/3001.lbx', 'HEAD']]);
  assert.equal(await checkBrickArchitect({ partNum: '99999' }, reply(404)), false);
  assert.equal(await checkBrickArchitect({ partNum: '99999' }, reply(200, 'text/html; charset=UTF-8')), false, '"not found" page');
  assert.equal(await checkBrickArchitect({ partNum: '3001' }, reply(503)), null, "can't tell");
  assert.equal(
    await checkBrickArchitect({ partNum: '3001' }, async () => {
      throw new TypeError('Failed to fetch');
    }),
    null,
    'blocked or offline',
  );
});

test('app-made labels: part number over name, in strips of ten', () => {
  assert.deepEqual(appLabelLines({ partNum: '35480', name: 'Plate 1 x 2 Rounded with 2 Open Studs' }), [
    '35480',
    'Plate 1 x 2 Rounded with 2 Open Studs',
  ]);
  assert.deepEqual(appLabelLines({ partNum: '99999', name: '' }), ['99999', 'Unnamed part']);
  assert.deepEqual(strips([...'abcdefghijkl']).map((s) => s.length), [10, 2]);
  assert.deepEqual(strips([]), []);
});

test('whether Brick Architect has a label is kept with the part, until its label number changes', () => {
  const store = createStore(memoryBackend());
  store.ensurePart('3001');
  assert.equal(store.getPart('3001').baLabel, '');
  store.setBaLabel('3001', 'no');
  assert.equal(store.getPart('3001').baLabel, 'no');
  assert.equal(JSON.parse(store.exportJSON()).parts[0].baLabel, 'no', 'shared with the family');
  store.savePart('3001', { name: 'Brick 2 x 4' });
  assert.equal(store.getPart('3001').baLabel, 'no', 'other edits keep it');
  store.savePart('3001', { labelNum: '3001old' });
  assert.equal(store.getPart('3001').baLabel, '', 'a different label file is checked again');
  store.savePart('3001', { labelNum: '3001old', baLabel: 'no' });
  assert.equal(store.getPart('3001').baLabel, 'no');
  store.setBaLabel('3001', 'maybe');
  assert.equal(store.getPart('3001').baLabel, '');
});

test('strips stay short enough to print in one go', () => {
  // widths 100 each, gap 10: 3 fit in 320 (100+10+100+10+100), a 4th doesn't
  assert.deepEqual(packStrips([100, 100, 100, 100, 100], { maxWidth: 320, gap: 10 }), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(packStrips([500, 50], { maxWidth: 320, gap: 10 }), [[0], [1]], 'an extra-wide label gets its own strip');
  assert.deepEqual(packStrips([1, 1, 1], { maxWidth: 1000, maxCount: 2 }), [[0, 1], [2]]);
  assert.deepEqual(packStrips([], { maxWidth: 10 }), []);
});

test('with the relay, labels are checked and fetched through it', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push(`${opts.method ?? 'GET'} ${url}`);
    if (url.endsWith('/3001.lbx')) return { ok: true, status: 200, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => new Uint8Array([0x50, 0x4b]).buffer };
    return { ok: false, status: 404, headers: { get: () => 'text/plain' } };
  };
  const relay = 'https://brick-labels.example.workers.dev/';
  assert.equal(await checkBrickArchitect({ partNum: '3001' }, fetchImpl, { relay }), true);
  assert.equal(await checkBrickArchitect({ partNum: '99999' }, fetchImpl, { relay }), false);
  assert.deepEqual([...(await fetchLabelFile({ partNum: '3001' }, relay, fetchImpl))], [0x50, 0x4b]);
  assert.equal(await fetchLabelFile({ partNum: '15573', labelNum: '3794' }, relay, fetchImpl), null);
  assert.deepEqual(calls, [
    'HEAD https://brick-labels.example.workers.dev/label/3001.lbx',
    'HEAD https://brick-labels.example.workers.dev/label/99999.lbx',
    'GET https://brick-labels.example.workers.dev/label/3001.lbx',
    'GET https://brick-labels.example.workers.dev/label/3794.lbx',
  ]);
});
