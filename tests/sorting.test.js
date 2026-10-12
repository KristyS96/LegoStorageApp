import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory } from '../js/sorting.js';

test('guesses categories from catalog names', () => {
  assert.equal(guessCategory('Brick 2 x 4'), 'Bricks');
  assert.equal(guessCategory('Plate 1 x 2 Jumper'), 'Plates');
  assert.equal(guessCategory('Tile 2 x 2 with Studs on Edge'), 'Tiles');
  assert.equal(guessCategory('Bar 1 x 3 with Clip (Robot Arm)'), 'Brackets, Hinges & Clips');
  assert.equal(guessCategory('Technic Pin with Friction Ridges'), 'Technic');
  assert.equal(guessCategory('Mystery thing'), '');
});

import { partShape, similarity, suggestSlots } from '../js/sorting.js';
import { createStore, memoryBackend, slotId } from '../js/store.js';

test('reads kind, size and details from part names', () => {
  assert.deepEqual(partShape('Tile 2 x 2 with Studs on Edge'), { type: 'tile', dims: [2, 2], details: ['studs', 'edge'] });
  assert.deepEqual(partShape('Brick 1 x 1 x 3'), { type: 'brick', dims: [1, 1, 3], details: [] });
  assert.deepEqual(partShape('Plate 1 x 2 Jumper'), { type: 'plate', dims: [1, 2], details: ['jumper'] });
});

test('like pieces score higher than unlike ones', () => {
  const tile13 = { name: 'Tile 1 x 3', category: 'Tiles' };
  assert.ok(similarity(tile13, { name: 'Tile 1 x 4' }) > similarity(tile13, { name: 'Tile 2 x 6' }));
  assert.ok(similarity(tile13, { name: 'Tile 2 x 6' }) > similarity(tile13, { name: 'Plate 1 x 3' }));
  const corner = { name: 'Tile 2 x 2 Corner' };
  assert.ok(similarity(corner, { name: 'Plate 2 x 2 Corner' }) > similarity(corner, { name: 'Plate 2 x 2' }));
});

function cabinetWith(drawers, rows = '4, 4') {
  const store = createStore(memoryBackend());
  const unit = store.addUnit({ name: 'Cabinet', rows });
  for (const [r, c, nums, compartments] of drawers) {
    const id = slotId(unit.id, r, c);
    if (nums) store.addPartsToSlot(id, nums);
    if (compartments) store.updateSlot(id, { compartments });
  }
  return { store, unit };
}

test('suggests a split drawer with free room that holds like pieces', () => {
  const { store } = cabinetWith([
    [1, 1, '3068'], // Tile 2 x 2, single compartment: full
    [1, 2, '3069, 63864', 8], // tiles, 8 compartments: 6 free
    [2, 1, '3023', 8], // Plate 1 x 2: unlike a tile
  ]);
  // a tile you'd have a few of (not on the common list) fits a compartment
  const [first] = suggestSlots({ partNum: '90001', name: 'Tile 1 x 4 with Pin', category: 'Tiles' }, store.state);
  assert.equal(first.code, 'A-1-2');
  assert.equal(first.kind, 'share');
  assert.match(first.reason, /6 free compartments, with Tile 1 x [23]/);
  // a common one (lots of pieces) gets a drawer of its own next to the tiles instead
  const [common] = suggestSlots({ partNum: '2431', name: 'Tile 1 x 4', category: 'Tiles' }, store.state);
  assert.equal(common.kind, 'beside');
});

test('full drawers are skipped; an empty drawer beside like pieces is next best', () => {
  const { store } = cabinetWith([
    [1, 1, '3068'],
    [1, 2, '3069'],
    [2, 4, '3001'],
  ]);
  const picks = suggestSlots({ partNum: '2431', name: 'Tile 1 x 4', category: 'Tiles' }, store.state);
  assert.equal(picks[0].kind, 'beside');
  assert.equal(picks[0].code, 'A-1-3');
  assert.match(picks[0].reason, /next to A-1-2 \(Tile 1 x 2\)/);
  assert.ok(picks.every((p) => !['A-1-1', 'A-1-2'].includes(p.code)), 'full drawers are not offered');
});

test('with nothing alike, offers the first empty drawer; never a named compartment or its own drawer', () => {
  const { store, unit } = cabinetWith([[1, 2, '3001']], '2');
  store.updateSlot(slotId(unit.id, 1, 1), { label: 'Hinges' });
  assert.deepEqual(
    suggestSlots({ partNum: '4735', name: 'Bar 1 x 3 with Clip' }, store.state).map((p) => [p.code, p.kind]),
    [],
    'A-1-1 is a named compartment and A-1-2 is full',
  );
  const { store: s2 } = cabinetWith([[1, 1, '3001', 8]], '2');
  const picks = suggestSlots({ partNum: '3001', name: 'Brick 2 x 4' }, s2.state);
  assert.ok(picks.every((p) => p.code !== 'A-1-1'));
  assert.deepEqual(picks.map((p) => p.kind), ['empty']);
});

test('versions of a part share a family number or name', async () => {
  const { baseNumber, isVariant } = await import('../js/sorting.js');
  assert.equal(baseNumber('3942c'), '3942');
  assert.equal(baseNumber('3068bpr0001'), '3068');
  assert.equal(baseNumber('3001'), '3001');
  assert.equal(baseNumber('32000'), '32000');
  assert.ok(isVariant({ partNum: '3942a' }, { partNum: '3942c' }));
  assert.ok(isVariant({ partNum: '4589' }, { partNum: '4589b' }));
  assert.ok(!isVariant({ partNum: '3200' }, { partNum: '32000' }), 'different numbers, not a version');
  assert.ok(!isVariant({ partNum: '3942c' }, { partNum: '3942c' }), 'the same part');
  assert.ok(!isVariant({ partNum: '15573', altNums: ['3794'] }, { partNum: '3794' }), 'an alternate number is the same part');
  assert.ok(isVariant({ partNum: '1', name: 'Cone 2 x 2 x 2 - Open Stud' }, { partNum: '2', name: 'Cone 2 x 2 x 2 [Completely Open Stud]' }));
  assert.ok(!isVariant({ partNum: '1', name: 'Plate 1 x 2 with Clip' }, { partNum: '2', name: 'Plate 1 x 2 with Handle' }));
  assert.ok(!isVariant({ partNum: '1', name: 'Minifig, Head' }, { partNum: '2', name: 'Minifig, Head' }), 'needs a size to match by name');
});

test('a new version of a stored part is suggested its drawer first, sharing its compartment', async () => {
  const { compartmentsUsed } = await import('../js/sorting.js');
  const store = createStore(memoryBackend());
  const unit = store.addUnit({ name: 'Round', rows: '3, 3' });
  store.addPartsToSlot(slotId(unit.id, 1, 1), '3942b');
  store.savePart('3942b', { name: 'Cone 2 x 2 x 2 - Open Stud' });
  store.addPartsToSlot(slotId(unit.id, 2, 3), '3062b, 4073'); // round 1x1 brick and plate, two compartments of two
  store.updateSlot(slotId(unit.id, 1, 1), { compartments: 2 });
  store.addPartsToSlot(slotId(unit.id, 1, 1), '98138'); // a round tile fills the other compartment
  const [first] = suggestSlots({ partNum: '3942c', name: 'Cone 2 x 2 x 2 - Completely Open Stud', category: 'Round & Cones' }, store.state);
  assert.equal(first.code, 'A-1-1');
  assert.equal(first.kind, 'version');
  assert.equal(first.versionOf, '3942b');
  assert.match(first.reason, /another version/);
  // with 3942c added, the drawer still uses 2 compartments
  store.addPartsToSlot(slotId(unit.id, 1, 1), '3942c');
  const parts = store.getSlot(slotId(unit.id, 1, 1)).partNums.map((n) => store.getPart(n));
  assert.equal(compartmentsUsed(parts), 2);
});

test('drawer sizes and the room a part needs', async () => {
  const { slotSize, roomNeeded, isCommon } = await import('../js/sorting.js');
  const unit = { id: 'u', rows: [6, 6, 3] };
  assert.equal(slotSize(unit, 1, 1), 1);
  assert.equal(slotSize(unit, 3, 2), 2, 'half as many drawers in the row: twice as big');
  assert.ok(isCommon({ partNum: '3023' }));
  assert.ok(isCommon({ partNum: '3069b' }), 'versions of a common part are common');
  assert.ok(!isCommon({ partNum: '3942c' }));
  assert.equal(roomNeeded({ partNum: '3023', name: 'Plate 1 x 2' }), 1, 'common small part: a whole small drawer');
  assert.equal(roomNeeded({ partNum: '90002', name: 'Tile 1 x 1 Round with Hole' }), 0.25, 'a few small parts: a compartment');
  assert.equal(roomNeeded({ partNum: '3001', name: 'Brick 2 x 4' }), 2, 'common and bulky: a big drawer');
  assert.equal(roomNeeded({ partNum: '3958', name: 'Plate 6 x 6' }), 2);
  assert.equal(roomNeeded({ partNum: '90003', name: 'Plate 6 x 6 with Holes' }), 1, 'big but rare');
  assert.equal(roomNeeded({ partNum: '90004', name: 'Minifig, Visor' }), 0.5, 'no size: medium');
});

test('a common part is offered a big drawer, a rare small part a small one', () => {
  // rows of 4 small drawers and one row of 2 big ones; nothing alike stored
  const { store } = cabinetWith([[1, 1, '3001']], '4, 2');
  const [plate] = suggestSlots({ partNum: '3023', name: 'Plate 1 x 2', category: 'Plates' }, store.state);
  assert.equal(plate.code, 'A-2-1');
  assert.match(plate.reason, /big drawer, good for a common part/);
  const [cone] = suggestSlots({ partNum: '4589', name: 'Cone 1 x 1', category: 'Round & Cones' }, store.state);
  assert.equal(cone.code, 'A-1-2', 'a small drawer for a few small parts');
});

test('a common part is steered away from a tiny compartment among like parts', () => {
  const { store } = cabinetWith([[1, 1, '3024', 8]], '4, 2'); // plates 1x1, split in 8
  const picks = suggestSlots({ partNum: '3023', name: 'Plate 1 x 2', category: 'Plates' }, store.state);
  assert.equal(picks[0].kind, 'beside', 'a drawer of its own next to the 1x1 plates');
  const share = picks.find((p) => p.kind === 'share');
  if (share) assert.match(share.reason, /small for a common part/);
});

test('when the drawers near like parts are all too small, a roomy empty drawer is offered too', () => {
  // 1x1 bricks in the small top drawers; the big drawers in row 4 are empty and not next to them
  const { store } = cabinetWith([[1, 1, '3005'], [1, 3, '3005']], '4, 4, 4, 2');
  const picks = suggestSlots({ partNum: '3004', name: 'Brick 1 x 2', category: 'Bricks' }, store.state);
  assert.equal(picks.length, 3);
  assert.ok(picks.slice(0, 2).every((p) => p.kind === 'beside' && /small for a common part/.test(p.reason)));
  assert.equal(picks[2].kind, 'empty');
  assert.match(picks[2].code, /^A-4-/);
  // and a big drawer right next to like parts comes first
  const { store: s2 } = cabinetWith([[2, 2, '3005']], '4, 4, 2');
  const [first] = suggestSlots({ partNum: '3004', name: 'Brick 1 x 2', category: 'Bricks' }, s2.state);
  assert.equal(first.code, 'A-3-2');
});

test('kinds of unit and uneven compartments set how much a slot holds', async () => {
  const { slotSize, compartmentRoom } = await import('../js/sorting.js');
  const at = (r, c, extra = {}) => ({ id: `u:${r}:${c}`, row: r, col: c, ...extra });
  const slots = (...list) => new Map(list.map((s) => [s.id, s]));
  // a case: a row of 4, then a row of 3 whose first compartment is double width
  const box = { id: 'u', kind: 'case', rows: [4, 3] };
  const wide = slots(at(2, 1, { span: 2 }));
  assert.equal(slotSize(box, 1, 1, wide), 0.5, 'a case compartment holds about half a drawer');
  assert.equal(slotSize(box, 2, 1, wide), 1, 'double width: twice that');
  assert.equal(slotSize(box, 2, 2, wide), 0.5);
  assert.equal(slotSize({ id: 'u', kind: 'tub', rows: [1] }, 1, 1), 4);
  // compartments split cabinet drawers, but not case compartments
  assert.equal(compartmentRoom({ id: 'u', rows: [2] }, at(1, 1, { compartments: 4 })), 0.25);
  assert.equal(compartmentRoom(box, at(1, 1, { compartments: 4 })), 0.5);
});

test('common parts lean to cabinet drawers, a few small parts to case compartments', () => {
  const store = createStore(memoryBackend());
  store.addUnit({ name: 'Cabinet', rows: '2' });
  store.addUnit({ name: 'Case', kind: 'case', rows: '4, 4' });
  assert.equal(store.state.units[1].kind, 'case');
  const [plate] = suggestSlots({ partNum: '3023', name: 'Plate 1 x 2', category: 'Plates' }, store.state);
  assert.match(plate.code, /^A-/, 'a common part gets a cabinet drawer');
  const [cone] = suggestSlots({ partNum: '4589', name: 'Cone 1 x 1', category: 'Round & Cones' }, store.state);
  assert.match(cone.code, /^B-/, 'a few small parts get a case compartment');
  assert.match(cone.reason, /empty compartment/);
});

test('a slot keeps its width, and unknown kinds become cabinets', () => {
  const store = createStore(memoryBackend());
  const unit = store.addUnit({ name: 'Case', kind: 'case', rows: '3' });
  const id = slotId(unit.id, 1, 1);
  store.updateSlot(id, { span: '2' });
  assert.equal(store.getSlot(id).span, 2);
  assert.ok(store.state.slots.some((s) => s.id === id), 'a widened empty slot is remembered');
  store.updateSlot(id, { span: 9 });
  assert.equal(store.getSlot(id).span, 4);
  assert.equal(store.addUnit({ name: 'X', kind: 'shoebox', rows: '1' }).kind, 'cabinet');
  store.updateUnit(unit.id, { kind: 'tub' });
  assert.equal(store.getUnit(unit.id).kind, 'tub');
});
