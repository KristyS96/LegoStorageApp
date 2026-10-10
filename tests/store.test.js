import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, STORAGE_KEY, slotId } from '../js/store.js';

function cabinet(store) {
  return store.addUnit({ name: 'Plate cabinet', rows: '6, 6, 3' });
}

test('adds storage units with auto codes and persists them', () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  const a = cabinet(store);
  const b = store.addUnit({ name: 'Specialty case', rows: [4, 4] });
  assert.equal(a.code, 'A');
  assert.equal(b.code, 'B');
  assert.deepEqual(a.rows, [6, 6, 3]);
  assert.equal(createStore(backend).state.units.length, 2);
});

test('rejects duplicate codes and empty layouts', () => {
  const store = createStore(memoryBackend());
  cabinet(store);
  assert.throws(() => store.addUnit({ name: 'X', code: 'a', rows: '2' }), /already used/);
  assert.throws(() => store.addUnit({ name: 'X', rows: 'none' }), /each row/);
});

test('slot codes resolve in several spellings and only inside the grid', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  assert.equal(store.findSlotByCode('A-3-2').id, slotId(unit.id, 3, 2));
  assert.equal(store.findSlotByCode('a 3 2').id, slotId(unit.id, 3, 2));
  assert.equal(store.findSlotByCode('A3-2').id, slotId(unit.id, 3, 2));
  assert.equal(store.findSlotByCode('A-3-4'), null, 'row 3 only has 3 drawers');
  assert.equal(store.findSlotByCode('Z-1-1'), null);
  assert.equal(store.codeOf(store.findSlotByCode('A-2-6')), 'A-2-6');
});

test('adding part numbers to a slot fills names from the built-in catalog', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  const id = slotId(unit.id, 1, 4);
  const added = store.addPartsToSlot(id, '3623, 63864');
  assert.deepEqual(added.map((p) => p.name), ['Plate 1 x 3', 'Tile 1 x 3']);
  assert.deepEqual(store.getSlot(id).partNums, ['3623', '63864']);
  assert.equal(store.getSlot(id).needsLabel, true, 'new contents need a label');
  assert.deepEqual(store.addPartsToSlot(id, '3623'), [], 'no duplicates');
});

test('alternate part numbers find the same part and slot', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  store.addPartsToSlot(slotId(unit.id, 1, 3), '3794');
  assert.equal(store.getPart('15573').partNum, '15573');
  assert.equal(store.getPart('3794').name, 'Plate 1 x 2 Jumper');
  assert.equal(store.slotsForPart('3794').length, 1);
  assert.equal(store.slotsForPart('15573').length, 1);
});

test('unknown part numbers are kept with a blank name', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  const [part] = store.addPartsToSlot(slotId(unit.id, 1, 1), '99999');
  assert.equal(part.partNum, '99999');
  assert.equal(part.name, '');
});

test('a part can live in several slots, and moves between them', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  const s1 = slotId(unit.id, 1, 1);
  const s2 = slotId(unit.id, 3, 1);
  store.addPartsToSlot(s1, '3023');
  store.addPartsToSlot(s2, '3023');
  assert.equal(store.slotsForPart('3023').length, 2);
  store.movePart('3023', s1, slotId(unit.id, 2, 2));
  assert.deepEqual(store.slotsForPart('3023').map((s) => store.codeOf(s)).sort(), ['A-2-2', 'A-3-1']);
});

test('parts without a slot are listed', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  store.ensurePart('3001');
  store.addPartsToSlot(slotId(unit.id, 1, 1), '3068');
  assert.deepEqual(store.partsWithoutSlot().map((p) => p.partNum), ['3001']);
});

test('shrinking a unit refuses to drop slots that hold parts', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  store.addPartsToSlot(slotId(unit.id, 3, 3), '3666');
  assert.throws(() => store.updateUnit(unit.id, { rows: '6, 6, 2' }), /A-3-3/);
  store.removePartFromSlot(slotId(unit.id, 3, 3), '3666');
  store.updateUnit(unit.id, { rows: '6, 6, 2' });
  assert.deepEqual(store.getUnit(unit.id).rows, [6, 6, 2]);
});

test('deleting a part removes it from every slot', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  store.addPartsToSlot(slotId(unit.id, 1, 1), '3068, 3069');
  store.removePart('3068');
  assert.deepEqual(store.getSlot(slotId(unit.id, 1, 1)).partNums, ['3069']);
});

test('export omits the API key and import round-trips', () => {
  const a = createStore(memoryBackend());
  a.updateSettings({ rebrickableKey: 'secret' });
  const unit = cabinet(a);
  a.addPartsToSlot(slotId(unit.id, 1, 1), '3068');
  const json = a.exportJSON();
  assert.ok(!json.includes('secret'));

  const b = createStore(memoryBackend());
  b.updateSettings({ rebrickableKey: 'mine' });
  b.importJSON(json);
  assert.equal(b.codeOf(b.slotsForPart('3068')[0]), 'A-1-1');
  assert.equal(b.state.settings.rebrickableKey, 'mine', 'replace import keeps local key');
});

test('merge import keeps both sides and takes newer slot edits', () => {
  const a = createStore(memoryBackend());
  const unit = cabinet(a);
  const id = slotId(unit.id, 1, 1);
  a.addPartsToSlot(id, '3068');
  const b = createStore(memoryBackend());
  b.importJSON(a.exportJSON());

  b.addPartsToSlot(slotId(unit.id, 1, 2), '6636');
  a.updateSlot(id, { label: 'Tiles 2x2' });
  a.state.slots.find((s) => s.id === id).updatedAt = Date.now() + 1000;

  b.importJSON(a.exportJSON(), { merge: true });
  assert.equal(b.getSlot(id).label, 'Tiles 2x2');
  assert.deepEqual(b.getSlot(slotId(unit.id, 1, 2)).partNums, ['6636']);
});

test('migrates version 1 data (flat bins with color rows)', () => {
  const v1 = {
    version: 1,
    locations: [{ id: 'l1', name: 'A1' }, { id: 'l2', name: 'Red tub' }],
    parts: [
      { partNum: '3001', name: 'Brick 2 x 4', colorId: 4, quantity: 3, locationId: 'l1' },
      { partNum: '3001', name: 'Brick 2 x 4', colorId: 15, quantity: 2, locationId: 'l1' },
      { partNum: '3003', name: 'Brick 2 x 2', colorId: 4, quantity: 1, locationId: 'l2' },
      { partNum: '', name: 'Mystery clip', quantity: 1, locationId: null },
    ],
  };
  const store = createStore(memoryBackend({ [STORAGE_KEY]: JSON.stringify(v1) }));
  assert.equal(store.state.units[0].name, 'Imported bins');
  assert.deepEqual(store.state.units[0].rows, [1, 1]);
  assert.equal(store.state.parts.length, 3);
  assert.equal(store.codeOf(store.slotsForPart('3001')[0]), 'Z-1-1');
  assert.equal(store.slotsForPart('3001')[0].label, 'A1');
  assert.deepEqual(store.partsWithoutSlot().map((p) => p.name), ['Mystery clip']);
});

test('rejects files that are not exports and recovers from corrupted storage', () => {
  const store = createStore(memoryBackend());
  assert.throws(() => store.importJSON('{"hello":1}'), /missing/);
  assert.deepEqual(createStore(memoryBackend({ [STORAGE_KEY]: '{not json' })).state.parts, []);
});

test('merging another unit with the same code gives it a free code', () => {
  const a = createStore(memoryBackend());
  cabinet(a);
  const b = createStore(memoryBackend());
  b.addUnit({ name: 'Brick case', rows: '2, 2' });
  b.importJSON(a.exportJSON(), { merge: true });
  assert.deepEqual(b.state.units.map((u) => u.code), ['A', 'B']);
});

test('saves a unit read from a photo, filling names and alternates from the labels', () => {
  const store = createStore(memoryBackend());
  store.ensurePart('99999');
  store.savePart('99999', { name: 'Family name' });
  const unit = store.addScannedUnit(
    { name: 'Brick cabinet' },
    [
      [[], [{ partNum: '3068', altNums: [], name: 'Tile 2 x 2 (as read)' }]],
      [[{ partNum: '88888', altNums: ['77777'], name: 'Slope 45 2 x 2' }, { partNum: '99999', altNums: [], name: 'Read name' }]],
    ],
    { labeled: true },
  );
  assert.equal(unit.code, 'A');
  assert.deepEqual(unit.rows, [2, 1]);
  assert.equal(store.getPart('3068').name, 'Tile 2 x 2', 'built-in name wins');
  assert.equal(store.getPart('77777').name, 'Slope 45 2 x 2', 'new part named from its label, found by alternate');
  assert.equal(store.getPart('88888').category, 'Slopes');
  assert.equal(store.getPart('99999').name, 'Family name', 'never overwrites what the family typed');
  assert.deepEqual(store.getSlot(slotId(unit.id, 2, 1)).partNums, ['88888', '99999']);
  assert.equal(store.getSlot(slotId(unit.id, 1, 2)).needsLabel, false);
  assert.equal(store.getSlot(slotId(unit.id, 1, 1)).partNums.length, 0, 'empty drawer stays free');
});

test('the Anthropic key is never exported and survives a replace import', () => {
  const a = createStore(memoryBackend());
  a.updateSettings({ anthropicKey: 'sk-ant-secret' });
  assert.ok(!a.exportJSON().includes('sk-ant-secret'));
  a.importJSON(createStore(memoryBackend()).exportJSON());
  assert.equal(a.state.settings.anthropicKey, 'sk-ant-secret');
});

test('drawers keep their compartment count (1-8)', () => {
  const store = createStore(memoryBackend());
  const unit = cabinet(store);
  const id = slotId(unit.id, 1, 1);
  assert.equal(store.getSlot(id).compartments, 1);
  store.updateSlot(id, { compartments: '8' });
  assert.equal(store.getSlot(id).compartments, 8);
  store.updateSlot(id, { compartments: 20 });
  assert.equal(store.getSlot(id).compartments, 8);
  assert.ok(store.state.slots.some((s) => s.id === id), 'an empty split drawer is remembered');
});
