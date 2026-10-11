import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appLabelLines, brickArchitectLabelUrl, checkBrickArchitect, labelNumber, strips } from '../js/labels.js';
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
