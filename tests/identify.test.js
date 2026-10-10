import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBrickognize, lookupPart, partByNumber } from '../js/identify.js';

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

const json = (body) => ({ ok: true, status: 200, json: async () => body });

// A fake Rebrickable that knows 3069b, filed under BrickLink 3069 and LEGO 306901.
function fakeRebrickable(calls = []) {
  const plate = { part_num: '3069b', name: 'Tile 1 x 2 with Groove', part_img_url: 'img.png', external_ids: { BrickLink: ['3069'], LEGO: ['306901'] } };
  return async (url, opts) => {
    calls.push({ url, auth: opts.headers.Authorization });
    if (url.includes('bricklink_id=3069&') || url.includes('lego_id=306901&')) return json({ results: [plate] });
    if (url.includes('search=tile')) {
      return json({ results: [plate, { ...plate, part_num: '3069a' }, { part_num: 'rb-only', name: 'No outside number', external_ids: {} }] });
    }
    return json({ results: [] });
  };
}

test('looks numbers up by BrickLink number, then LEGO number, and keeps the number given', async () => {
  const calls = [];
  const fetchImpl = fakeRebrickable(calls);
  assert.deepEqual(await partByNumber('3069', 'k', fetchImpl), {
    partNum: '3069', name: 'Tile 1 x 2 with Groove', imageUrl: 'img.png', category: '', score: null,
  });
  assert.equal(calls[0].auth, 'key k');
  assert.match(calls[0].url, /bricklink_id=3069&/);
  assert.equal((await partByNumber('306901', 'k', fetchImpl)).partNum, '306901');
  assert.equal(await partByNumber('99999', 'k', fetchImpl), null);
  assert.ok(!calls.some((c) => /\/parts\/[^?]/.test(c.url)), "never asks for Rebrickable's own numbers");
  await assert.rejects(partByNumber('3069', ''), /API key/);
});

test('name searches show BrickLink numbers, without duplicates or Rebrickable-only parts', async () => {
  const results = await lookupPart('tile 1 x 2', 'k', fakeRebrickable());
  assert.deepEqual(results.map((r) => r.partNum), ['3069']);
});
