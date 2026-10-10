import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, STORAGE_KEY } from '../js/store.js';

test('adds bins and parts, and persists them', () => {
  const backend = memoryBackend();
  const store = createStore(backend);
  const bin = store.addLocation({ name: 'A1' });
  store.addPart({ partNum: '3001', name: 'Brick 2 x 4', colorId: 4, quantity: 3, locationId: bin.id });

  const reloaded = createStore(backend);
  assert.equal(reloaded.state.locations[0].name, 'A1');
  assert.equal(reloaded.state.parts[0].quantity, 3);
  assert.ok(backend.getItem(STORAGE_KEY));
});

test('adding the same part/color/bin increases quantity instead of duplicating', () => {
  const store = createStore(memoryBackend());
  store.addPart({ partNum: '3001', colorId: 4, quantity: 2 });
  store.addPart({ partNum: '3001', colorId: 4, quantity: 5 });
  store.addPart({ partNum: '3001', colorId: 1, quantity: 1 });
  assert.equal(store.state.parts.length, 2);
  assert.equal(store.findByPartNum('3001').find((p) => p.colorId === 4).quantity, 7);
});

test('requires a part number or name', () => {
  const store = createStore(memoryBackend());
  assert.throws(() => store.addPart({ quantity: 1 }), /part number or a name/);
});

test('quantity never goes below zero', () => {
  const store = createStore(memoryBackend());
  const p = store.addPart({ name: 'Mystery', quantity: 1 });
  store.adjustQuantity(p.id, -5);
  assert.equal(store.state.parts[0].quantity, 0);
});

test('removing a bin keeps its parts as unsorted', () => {
  const store = createStore(memoryBackend());
  const bin = store.addLocation({ name: 'B2' });
  store.addPart({ partNum: '3003', locationId: bin.id });
  store.removeLocation(bin.id);
  assert.equal(store.state.locations.length, 0);
  assert.equal(store.state.parts[0].locationId, null);
});

test('export omits the API key and import round-trips the collection', () => {
  const a = createStore(memoryBackend());
  a.updateSettings({ rebrickableKey: 'secret' });
  a.addLocation({ name: 'A1' });
  a.addPart({ partNum: '3001', quantity: 4 });
  const json = a.exportJSON();
  assert.ok(!json.includes('secret'));

  const b = createStore(memoryBackend());
  b.updateSettings({ rebrickableKey: 'mine' });
  b.importJSON(json);
  assert.equal(b.state.parts[0].partNum, '3001');
  assert.equal(b.state.settings.rebrickableKey, 'mine', 'replace import keeps local key');
});

test('merge import keeps local parts and takes newer remote edits', () => {
  const a = createStore(memoryBackend());
  const shared = a.addPart({ partNum: '3001', quantity: 1 });
  const b = createStore(memoryBackend());
  b.importJSON(a.exportJSON());

  b.addPart({ partNum: '3024', quantity: 10 });
  a.updatePart(shared.id, { quantity: 9 });
  // Ensure a's edit is strictly newer.
  a.state.parts[0].updatedAt = Date.now() + 1000;

  b.importJSON(a.exportJSON(), { merge: true });
  assert.equal(b.state.parts.length, 2);
  assert.equal(b.state.parts.find((p) => p.id === shared.id).quantity, 9);
});

test('rejects files that are not exports', () => {
  const store = createStore(memoryBackend());
  assert.throws(() => store.importJSON('{"hello":1}'), /missing/);
});

test('recovers from corrupted storage', () => {
  const store = createStore(memoryBackend({ [STORAGE_KEY]: '{not json' }));
  assert.deepEqual(store.state.parts, []);
});

test('bins keep their sorting rules, and old bins load without them', () => {
  const store = createStore(memoryBackend());
  const bin = store.addLocation({ name: 'A1', categories: ['Bricks', 'Round & Cones'], partNums: '3001, 3003 3004', colorIds: ['4'] });
  assert.deepEqual(bin.categories, ['Bricks', 'Round & Cones']);
  assert.deepEqual(bin.partNums, ['3001', '3003', '3004']);
  assert.deepEqual(bin.colorIds, [4]);

  const legacy = createStore(memoryBackend({ [STORAGE_KEY]: JSON.stringify({ parts: [], locations: [{ id: 'l', name: 'Old' }] }) }));
  assert.deepEqual(legacy.state.locations[0].categories, []);
});
