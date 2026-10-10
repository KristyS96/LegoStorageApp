import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, slotId } from '../js/store.js';
import { createSync, diffDocs, docsOf, stableJSON } from '../js/sync.js';

// A stand-in for the shared database: every phone's backend talks to the same server.
function fakeServer() {
  const data = { units: new Map(), slots: new Map(), parts: new Map() };
  const listeners = new Set();
  const writes = [];
  // Like a real database, hand back fields in a different order than they were written.
  const shuffled = (obj) => Object.fromEntries(Object.entries(obj).reverse());
  const docs = (col) => [...data[col].values()].map(shuffled);
  const notify = (cols) =>
    setTimeout(() => listeners.forEach((fn) => cols.forEach((col) => fn(col, docs(col)))), 0);

  return {
    data,
    writes,
    backend() {
      return {
        async fetchAll() {
          return { units: docs('units'), slots: docs('slots'), parts: docs('parts') };
        },
        subscribe(onData) {
          listeners.add(onData);
          ['units', 'slots', 'parts'].forEach((col) => setTimeout(() => onData(col, docs(col)), 0));
          return () => listeners.delete(onData);
        },
        async write({ upserts, deletes }) {
          writes.push({ upserts: upserts.length, deletes: deletes.length });
          upserts.forEach((u) => data[u.col].set(u.id, structuredClone(u.data)));
          deletes.forEach((d) => data[d.col].delete(d.id));
          notify([...new Set([...upserts, ...deletes].map((x) => x.col))]);
        },
      };
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
};

function phone(server, opts) {
  const store = createStore(memoryBackend());
  const sync = createSync(store, server.backend(), opts);
  return { store, sync };
}

test('stable JSON ignores key order; diff finds upserts and deletes', () => {
  assert.equal(stableJSON({ b: 1, a: [{ d: 1, c: 2 }] }), stableJSON({ a: [{ c: 2, d: 1 }], b: 1 }));
  const prev = docsOf({ units: [{ id: 'u1', code: 'A' }], parts: [{ partNum: '3001' }] });
  const next = docsOf({ units: [{ code: 'B', id: 'u1' }], parts: [{ partNum: '3003' }] });
  const { upserts, deletes } = diffDocs(prev, next);
  assert.deepEqual(upserts.map((u) => `${u.col}/${u.id}`).sort(), ['parts/3003', 'units/u1']);
  assert.deepEqual(deletes, [{ col: 'parts', id: '3001' }]);
});

test('the first phone starts the family catalog; the second downloads it', async () => {
  const server = fakeServer();
  const a = phone(server);
  const unit = a.store.addUnit({ name: 'Plate cabinet', rows: '6, 3' });
  a.store.addPartsToSlot(slotId(unit.id, 1, 1), '3068, 3069');

  const infoA = await a.sync.inspect();
  assert.equal(infoA.remoteEmpty, true);
  await a.sync.link('combine', infoA.remote);
  await settle();
  assert.equal(server.data.units.size, 1);
  assert.equal(server.data.slots.size, 1);
  assert.equal(server.data.parts.size, 2);
  assert.equal(a.store.state.settings.syncLinked, true);

  const b = phone(server);
  const infoB = await b.sync.inspect();
  assert.equal(infoB.localEmpty, true);
  await b.sync.link('shared', infoB.remote);
  await settle();
  assert.equal(b.store.codeOf(b.store.slotsForPart('3069')[0]), 'A-1-1');
});

test("edits and deletions show up on the other phone, and only changed items are written", async () => {
  const server = fakeServer();
  let remoteChangesOnB = 0;
  const a = phone(server);
  const b = phone(server, { onRemoteChange: () => (remoteChangesOnB += 1) });
  const unit = a.store.addUnit({ name: 'Plate cabinet', rows: '6, 3' });
  await a.sync.link('combine');
  await b.sync.link('shared');
  await settle();
  remoteChangesOnB = 0;
  const writesBefore = server.writes.length;

  // A fills a drawer: one write with just the slot and the two new parts.
  a.store.addPartsToSlot(slotId(unit.id, 2, 3), '3623, 63864');
  await settle();
  assert.equal(server.writes.length, writesBefore + 1, 'no echo writes');
  assert.deepEqual(server.writes.at(-1), { upserts: 3, deletes: 0 });
  assert.deepEqual(b.store.getSlot(slotId(unit.id, 2, 3)).partNums, ['3623', '63864']);
  assert.ok(remoteChangesOnB > 0, 'B redraws for A\'s edit');

  // B removes a part from the drawer, then deletes the whole cabinet.
  b.store.removePartFromSlot(slotId(unit.id, 2, 3), '63864');
  await settle();
  assert.deepEqual(a.store.getSlot(slotId(unit.id, 2, 3)).partNums, ['3623']);
  b.store.removeUnit(unit.id);
  await settle();
  assert.equal(a.store.state.units.length, 0, 'deletions are shared too');
  assert.equal(server.data.slots.size, 0);
});

test("a phone's own edits don't make it redraw", async () => {
  const server = fakeServer();
  let redraws = 0;
  const a = phone(server, { onRemoteChange: () => (redraws += 1) });
  const unit = a.store.addUnit({ name: 'Cabinet', rows: '2' });
  await a.sync.link('combine');
  await settle();
  redraws = 0;
  a.store.addPartsToSlot(slotId(unit.id, 1, 1), '3001');
  a.store.updateSlot(slotId(unit.id, 1, 1), { label: 'Bricks' });
  await settle();
  assert.equal(redraws, 0);
});

test('combining two phones that both have catalogs keeps both, with unique letters', async () => {
  const server = fakeServer();
  const a = phone(server);
  a.store.addUnit({ name: 'Plate cabinet', rows: '6' });
  await a.sync.link('combine');
  await settle();

  const b = phone(server);
  const bUnit = b.store.addUnit({ name: 'Brick case', rows: '2, 2' });
  b.store.addPartsToSlot(slotId(bUnit.id, 1, 1), '3001');
  const info = await b.sync.inspect();
  assert.equal(info.remoteEmpty || info.localEmpty, false);
  await b.sync.link('combine', info.remote);
  await settle();

  for (const store of [a.store, b.store]) {
    assert.deepEqual(store.state.units.map((u) => `${u.code} ${u.name}`), ['A Plate cabinet', 'B Brick case']);
    assert.equal(store.codeOf(store.slotsForPart('3001')[0]), 'B-1-1');
  }
});

test('a phone that reopens the app picks up changes made while it was closed', async () => {
  const server = fakeServer();
  const backendA = memoryBackend();
  const storeA = createStore(backendA);
  const unit = storeA.addUnit({ name: 'Cabinet', rows: '3' });
  await createSync(storeA, server.backend()).link('combine');
  await settle();

  const b = phone(server);
  await b.sync.link('shared');
  await settle();
  b.store.addPartsToSlot(slotId(unit.id, 1, 2), '3022');
  await settle();

  // Phone A starts again from what it saved on the device.
  const reopened = createStore(backendA);
  createSync(reopened, server.backend()).resume();
  await settle();
  assert.deepEqual(reopened.getSlot(slotId(unit.id, 1, 2)).partNums, ['3022']);
});
