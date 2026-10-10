import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchParts, normalizeText } from '../js/search.js';
import { SAMPLE } from '../js/data/sample.js';

const { parts, locations } = SAMPLE;
const nums = (results) => results.map((p) => `${p.partNum}/${p.colorId}`);

test('normalizes size descriptions', () => {
  assert.equal(normalizeText('Brick 2 X 4'), 'brick 2x4');
  assert.equal(normalizeText('2 by 2'), '2x2');
});

test('exact part number ranks first', () => {
  const results = searchParts(parts, locations, '3001');
  assert.ok(results.length >= 2);
  assert.ok(results.every((p) => p.partNum === '3001'));
});

test('combines color and size words', () => {
  assert.deepEqual(nums(searchParts(parts, locations, 'red 2x4')), ['3001/4']);
  assert.deepEqual(nums(searchParts(parts, locations, 'red 2 x 4')), ['3001/4']);
});

test('matches bin names and notes', () => {
  assert.ok(searchParts(parts, locations, 'technic tub').every((p) => p.locationId === 'sample_loc_tech'));
  assert.deepEqual(nums(searchParts(parts, locations, 'couch')), ['4624/15']);
});

test('all words must match', () => {
  assert.deepEqual(searchParts(parts, locations, 'red banana'), []);
});

test('filters by category, color and bin', () => {
  assert.ok(searchParts(parts, locations, '', { category: 'Plates' }).every((p) => p.category === 'Plates'));
  assert.ok(searchParts(parts, locations, '', { colorId: '0' }).every((p) => p.colorId === 0));
  assert.deepEqual(nums(searchParts(parts, locations, '', { locationId: 'unsorted' })), ['4624/15']);
});
