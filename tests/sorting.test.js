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
  const [first] = suggestSlots({ partNum: '2431', name: 'Tile 1 x 4', category: 'Tiles' }, store.state);
  assert.equal(first.code, 'A-1-2');
  assert.equal(first.kind, 'share');
  assert.match(first.reason, /6 free compartments, with Tile 1 x [23]/);
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
