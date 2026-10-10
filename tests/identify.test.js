import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBrickognize, lookupPart } from '../js/identify.js';

test('parses Brickognize predictions', () => {
  const items = parseBrickognize({
    items: [{ id: '3001', name: 'Brick 2 x 4', img_url: 'https://x/3001.png', category: 'Bricks', score: 0.93 }],
  });
  assert.deepEqual(items[0], {
    partNum: '3001',
    name: 'Brick 2 x 4',
    imageUrl: 'https://x/3001.png',
    category: 'Bricks',
    score: 0.93,
  });
  assert.deepEqual(parseBrickognize({}), []);
});

test('lookupPart requires an API key', async () => {
  await assert.rejects(lookupPart('3001', ''), /API key/);
});

test('lookupPart tries exact number then falls back to search', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization });
    if (url.includes('/parts/3001x/')) return { ok: false, status: 404 };
    return {
      ok: true,
      status: 200,
      json: async () => ({ results: [{ part_num: '3001', name: 'Brick 2 x 4', part_img_url: 'img' }] }),
    };
  };
  const results = await lookupPart('3001x', 'k', fakeFetch);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, 'key k');
  assert.match(calls[1].url, /search=3001x/);
  assert.equal(results[0].partNum, '3001');
});

import { partByNumber } from '../js/identify.js';

test('partByNumber returns the name and picture, or null for unknown numbers', async () => {
  const fakeFetch = async (url) =>
    url.includes('/parts/4073/')
      ? { ok: true, status: 200, json: async () => ({ part_num: '4073', name: 'Plate Round 1 x 1', part_img_url: 'img.png' }) }
      : { ok: false, status: 404 };
  assert.deepEqual(await partByNumber('4073', 'k', fakeFetch), {
    partNum: '4073', name: 'Plate Round 1 x 1', imageUrl: 'img.png', category: '', score: null,
  });
  assert.equal(await partByNumber('99999', 'k', fakeFetch), null);
  await assert.rejects(partByNumber('4073', ''), /API key/);
});
