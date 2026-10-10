import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory, suggestBins } from '../js/sorting.js';
import { SAMPLE } from '../js/data/sample.js';

const { locations, parts } = SAMPLE;
const names = (suggestions) => suggestions.map((s) => s.location.name);

test('guesses categories from catalog names', () => {
  assert.equal(guessCategory('Brick 2 x 4'), 'Bricks');
  assert.equal(guessCategory('Plate 1 x 2'), 'Plates');
  assert.equal(guessCategory('Slope 45° 2 x 2'), 'Slopes');
  assert.equal(guessCategory('Technic Pin with Friction Ridges'), 'Technic');
  assert.equal(guessCategory('Brick 1 x 2 with Print'), 'Decorated / Printed');
  assert.equal(guessCategory('Mystery thing'), '');
});

test('suggests bins by category, and color-restricted bins only for that color', () => {
  assert.deepEqual(names(suggestBins({ category: 'Bricks', colorId: 4 }, locations)), ['Red Bin', 'A1']);
  assert.deepEqual(names(suggestBins({ category: 'Bricks', colorId: 1 }, locations)), ['A1']);
  // Unknown color: don't claim it belongs in a red-only bin.
  assert.deepEqual(names(suggestBins({ category: 'Bricks' }, locations)), ['A1']);
});

test('where a part already lives wins', () => {
  const [first] = suggestBins({ partNum: '3001', category: 'Bricks', colorId: 4 }, locations, parts);
  assert.equal(first.location.name, 'A1');
  assert.ok(first.reasons.includes('already stored here'));
});

test('part-number rules match even across categories', () => {
  const locs = [{ id: 'x', name: 'Odd bits', categories: ['Other'], partNums: ['3001'], colorIds: [] }];
  assert.deepEqual(names(suggestBins({ partNum: '3001', category: 'Bricks' }, locs)), ['Odd bits']);
  assert.deepEqual(names(suggestBins({ partNum: '3003', category: 'Bricks' }, locs)), []);
});

test('bins without rules are never suggested', () => {
  const locs = [{ id: 'y', name: 'Junk drawer', categories: [], partNums: [], colorIds: [] }];
  assert.deepEqual(suggestBins({ category: 'Bricks', colorId: 4 }, locs), []);
});
