import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, slotId } from '../js/store.js';
import { storageReport } from '../js/report.js';

function setup() {
  const store = createStore(memoryBackend());
  const unit = store.addUnit({ name: 'Cabinet', rows: '4, 4' });
  const at = (r, c) => slotId(unit.id, r, c);
  return { store, at };
}

test('finds versions of a part kept in different drawers', () => {
  const { store, at } = setup();
  store.addPartsToSlot(at(1, 1), '3942a');
  store.addPartsToSlot(at(2, 3), '3942c');
  store.addPartsToSlot(at(1, 2), '4589, 4589b'); // versions together: fine
  const { versions } = storageReport(store);
  assert.equal(versions.length, 1);
  assert.deepEqual(versions[0].members.map((m) => m.part.partNum), ['3942a', '3942c']);
  assert.deepEqual(versions[0].slots.map((s) => store.codeOf(s)), ['A-1-1', 'A-2-3']);
});

test('finds the same part in more than one drawer', () => {
  const { store, at } = setup();
  store.addPartsToSlot(at(2, 1), '3023');
  store.addPartsToSlot(at(1, 4), '3023');
  store.addPartsToSlot(at(1, 1), '3024');
  const { spread } = storageReport(store);
  assert.deepEqual(spread.map((x) => [x.part.partNum, x.slots.map((s) => store.codeOf(s))]), [['3023', ['A-1-4', 'A-2-1']]]);
  assert.match(spread[0].key, /^spread:3023:/);
});

test('finds a part listed twice', () => {
  const { store } = setup();
  store.ensurePart('99001');
  store.ensurePart('99002');
  store.savePart('99001', { altNums: '99002' });
  const { twins } = storageReport(store);
  assert.equal(twins.length, 1);
  assert.deepEqual(twins[0].parts.map((p) => p.partNum), ['99001', '99002']);
});

test('gathering puts every version (and alternate number) in one drawer', () => {
  const { store, at } = setup();
  store.addPartsToSlot(at(1, 1), '3942a, 3001');
  store.addPartsToSlot(at(2, 3), '3942c');
  store.addPartsToSlot(at(2, 4), '3794'); // alternate number of 15573
  store.gatherParts(['3942a', '3942c'], at(2, 3));
  assert.deepEqual(store.getSlot(at(1, 1)).partNums, ['3001']);
  assert.deepEqual(store.getSlot(at(2, 3)).partNums.sort(), ['3942a', '3942c']);
  store.addPartsToSlot(at(1, 2), '15573');
  store.gatherParts(['15573'], at(1, 2));
  assert.equal(store.getSlot(at(2, 4))?.partNums.length ?? 0, 0);
  assert.equal(storageReport(store).versions.length + storageReport(store).spread.length, 0);
});

test('merging a part listed twice keeps its slots', () => {
  const { store, at } = setup();
  store.addPartsToSlot(at(1, 1), '99001');
  store.addPartsToSlot(at(1, 2), '99002');
  store.savePart('99002', { name: 'Mystery bit' });
  store.savePart('99001', { altNums: '99002' });
  store.mergeParts('99001', '99002');
  assert.equal(store.state.parts.filter((p) => p.partNum.startsWith('9900')).length, 1);
  assert.deepEqual(store.getPart('99002').partNum, '99001');
  assert.equal(store.getPart('99001').name, 'Mystery bit', 'a missing name comes from the other');
  assert.equal(store.slotsForPart('99001').length, 2, 'both drawers still find it');
  assert.equal(storageReport(store).twins.length, 0);
});
