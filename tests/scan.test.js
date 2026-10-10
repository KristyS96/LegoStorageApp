import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScan, cellToText, textToParts, scanUnit, SCAN_MODEL } from '../js/scan.js';
import * as sdk from '../js/vendor/anthropic-sdk.js';

const IMAGE = { mediaType: 'image/jpeg', data: 'aGVsbG8=' };

const READ = {
  rows: [
    {
      drawers: [
        { parts: [], uncertain: false },
        { parts: [{ partNum: '3068', altNums: [], name: 'Tile 2 x 2' }], uncertain: false },
        { parts: [{ partNum: '15573', altNums: ['3794', '15573'], name: 'Plate 1 x 2 Jumper' }], uncertain: true },
      ],
    },
    { drawers: [{ parts: [{ partNum: '3623', altNums: [], name: 'Plate 1 x 3' }, { partNum: '63864', altNums: [], name: 'Tile 1 x 3' }], uncertain: false }] },
    { drawers: [] },
  ],
  notes: 'Right column is cut off.',
};

// Runs the real bundled SDK, with fetch replaced so nothing leaves the machine.
function fakeSdk(reply, requests = []) {
  class TestAnthropic extends sdk.Anthropic {
    constructor(opts) {
      super({
        ...opts,
        maxRetries: 0,
        fetch: async (url, init) => {
          requests.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) });
          return typeof reply === 'function' ? reply() : new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
        },
      });
    }
  }
  return async () => ({ ...sdk, Anthropic: TestAnthropic });
}

function message(text, stop_reason = 'end_turn') {
  return {
    id: 'msg_1', type: 'message', role: 'assistant', model: SCAN_MODEL,
    content: [{ type: 'text', text }], stop_reason, stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

test('normalizes the grid: drops empty rows, cleans alternates, keeps empty drawers', () => {
  const scan = normalizeScan(READ);
  assert.equal(scan.rows.length, 2);
  assert.equal(scan.rows[0].length, 3);
  assert.deepEqual(scan.rows[0][0].parts, []);
  assert.deepEqual(scan.rows[0][2].parts[0].altNums, ['3794']);
  assert.equal(scan.rows[0][2].uncertain, true);
  assert.equal(scan.notes, 'Right column is cut off.');
});

test('review text round-trips and keeps names read from labels', () => {
  const cell = normalizeScan(READ).rows[0][2];
  assert.equal(cellToText(cell), '15573/3794');
  const two = normalizeScan(READ).rows[1][0];
  assert.equal(cellToText(two), '3623, 63864');
  assert.deepEqual(textToParts('3623, 63864, 99999', two.parts), [
    { partNum: '3623', altNums: [], name: 'Plate 1 x 3' },
    { partNum: '63864', altNums: [], name: 'Tile 1 x 3' },
    { partNum: '99999', altNums: [], name: '' },
  ]);
  assert.deepEqual(textToParts(' 15573 / 3794 ', cell.parts), [{ partNum: '15573', altNums: ['3794'], name: 'Plate 1 x 2 Jumper' }]);
  assert.deepEqual(textToParts('', []), []);
});

test('sends the photo with structured output and refusal fallbacks, and parses the reply', async () => {
  const requests = [];
  const scan = await scanUnit(IMAGE, 'sk-test', { loadSdk: fakeSdk(message(JSON.stringify(READ)), requests) });
  assert.equal(scan.rows[1][0].parts[1].partNum, '63864');

  const [req] = requests;
  assert.match(req.url, /\/v1\/messages/);
  assert.equal(req.headers.get('x-api-key'), 'sk-test');
  assert.match(req.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.equal(req.body.output_config.effort, 'high');
  assert.equal(req.body.messages[0].content[0].type, 'image');
  assert.equal(req.body.messages[0].content[0].source.data, IMAGE.data);
});

test('explains common failures in plain words', async () => {
  await assert.rejects(scanUnit(IMAGE, ''), /API key in Settings/);
  await assert.rejects(
    scanUnit(IMAGE, 'k', { loadSdk: fakeSdk(message('', 'refusal')) }),
    /could not read this photo/,
  );
  const unauthorized = () =>
    new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  await assert.rejects(scanUnit(IMAGE, 'k', { loadSdk: fakeSdk(unauthorized) }), /key was not accepted/);
});

test('a cut-off or garbled answer gets a friendly message', async () => {
  await assert.rejects(scanUnit(IMAGE, 'k', { loadSdk: fakeSdk(message('{"rows": [', 'max_tokens')) }), /too big to read/);
  await assert.rejects(scanUnit(IMAGE, 'k', { loadSdk: fakeSdk(message('not json')) }), /unreadable answer/);
});
