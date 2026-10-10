import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchParts, normalizeText } from '../js/search.js';
import { SAMPLE } from '../js/data/sample.js';

const { parts } = SAMPLE;
const nums = (results) => results.map((p) => p.partNum);
const slotsFor = (part) => (part.partNum === '3023' ? [{ code: 'A-3-1', label: '' }] : []);

test('normalizes size descriptions', () => {
  assert.equal(normalizeText('Plate 2 X 4'), 'plate 2x4');
  assert.equal(normalizeText('2 by 2'), '2x2');
  assert.equal(normalizeText('Brick 1 x 1 x 3'), 'brick 1x1x3');
});

test('exact part number and alternate numbers rank first', () => {
  assert.equal(searchParts(parts, '3023')[0].partNum, '3023');
  assert.deepEqual(nums(searchParts(parts, '3794')), ['15573']);
});

test('finds by type and size in any order', () => {
  assert.deepEqual(nums(searchParts(parts, '1x2 plate')), ['3023', '15573']);
  assert.deepEqual(nums(searchParts(parts, 'tile 2 x 2')), ['3068']);
});

test('finds by slot code', () => {
  assert.deepEqual(nums(searchParts(parts, 'A-3-1', { slotsFor })), ['3023']);
});

test('all words must match; category filter applies', () => {
  assert.deepEqual(searchParts(parts, 'plate banana'), []);
  assert.ok(searchParts(parts, '', { category: 'Tiles' }).every((p) => p.category === 'Tiles'));
});
