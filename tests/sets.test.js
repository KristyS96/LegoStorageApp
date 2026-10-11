import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSetNum, inventoryLines, fetchSet, planBuild } from '../js/sets.js';
import { createStore, memoryBackend, slotId } from '../js/store.js';

const row = (part_num, bl, name, color, quantity, extra = {}) => ({
  part: { part_num, name, part_img_url: `${part_num}.png`, external_ids: bl ? { BrickLink: [bl] } : {} },
  color: { id: color.length, name: color, rgb: 'C91A09' },
  quantity,
  is_spare: false,
  ...extra,
});

const ROWS = [
  row('3023', '3023', 'Plate 1 x 2', 'Red', 4),
  row('3023', '3023', 'Plate 1 x 2', 'Black', 2),
  row('3023', '3023', 'Plate 1 x 2', 'Red', 1, { is_spare: true }),
  row('3069b', '3069', 'Tile 1 x 2 with Groove', 'White', 3),
  row('3794b', '15573', 'Plate 1 x 2 with 1 Stud', 'Red', 2),
  row('4073', '4073', 'Plate Round 1 x 1', 'Yellow', 6),
];

test('set numbers get the version suffix Rebrickable needs', () => {
  assert.equal(normalizeSetNum(' 60337 '), '60337-1');
  assert.equal(normalizeSetNum('60337-2'), '60337-2');
});

test('inventory lines: spares left out, BrickLink numbers shown', () => {
  const lines = inventoryLines(ROWS);
  assert.equal(lines.length, 5);
  assert.equal(lines.find((l) => l.partNum === '3023' && l.color === 'Red').quantity, 4);
  assert.equal(lines.find((l) => l.name.startsWith('Tile')).partNum, '3069');
  assert.deepEqual(lines.find((l) => l.partNum === '15573').matchNums, ['15573', '3794b']);
});

test('fetchSet reads the set and every page of its parts list', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    assert.equal(opts.headers.Authorization, 'key k');
    const body = url.endsWith('/sets/60337-1/')
      ? { set_num: '60337-1', name: 'Express Passenger Train', year: 2022, num_parts: 764, set_img_url: 'set.jpg' }
      : url.includes('page=2')
        ? { results: ROWS.slice(3), next: null }
        : { results: ROWS.slice(0, 3), next: 'https://rebrickable.com/api/v3/lego/sets/60337-1/parts/?page=2' };
    return { ok: true, status: 200, json: async () => body };
  };
  const set = await fetchSet('60337', 'k', fetchImpl);
  assert.equal(set.name, 'Express Passenger Train');
  assert.equal(set.lines.length, 5);
  assert.equal(calls.length, 3);
  const notFound = await fetchSet('1', 'k', async () => ({ ok: false, status: 404 }));
  assert.equal(notFound, null);
  await assert.rejects(fetchSet('60337', ''), /API key/);
});

test('the pick list goes drawer by drawer and lists what is missing', () => {
  const store = createStore(memoryBackend());
  const unit = store.addUnit({ name: 'Plate cabinet', rows: '6, 6, 3' });
  store.addPartsToSlot(slotId(unit.id, 3, 1), '3023');
  store.addPartsToSlot(slotId(unit.id, 1, 1), '3069, 3794'); // 3794 is the alternate number of 15573
  store.addPartsToSlot(slotId(unit.id, 2, 2), '3023'); // overflow drawer

  const plan = planBuild({ lines: inventoryLines(ROWS) }, store);
  assert.deepEqual(plan.stops.map((s) => s.code), ['A-1-1', 'A-3-1']);
  assert.deepEqual(plan.stops[0].lines.map((l) => l.partNum).sort(), ['15573', '3069']);
  const redPlates = plan.stops[1].lines.find((l) => l.color === 'Red');
  assert.deepEqual(redPlates.alsoIn, ['A-2-2']);
  assert.deepEqual(plan.missing.map((l) => l.partNum), ['4073']);
  assert.equal(plan.totalPieces, 17);
  assert.equal(plan.foundPieces, 11);
});
