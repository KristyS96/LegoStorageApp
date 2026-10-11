import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, labelLayout, labelXml, lbxStrips, MAX_STRIP_PT, zip } from '../js/lbx.js';

// Read a stored (uncompressed) ZIP back: { name: text }.
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    assert.equal(view.getUint16(at + 8, true), 0, 'stored');
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    assert.equal(crc32(data), crc, `${name} checksum`);
    out[name] = new TextDecoder().decode(data);
    at += 30 + nameLen + size;
  }
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50, 'end of central directory');
  assert.equal(view.getUint16(bytes.length - 22 + 10, true), Object.keys(out).length);
  return out;
}

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip round-trips files', () => {
  const enc = new TextEncoder();
  const files = unzip(zip([{ name: 'a.txt', data: enc.encode('hello') }, { name: 'b.xml', data: enc.encode('<x/>') }]));
  assert.deepEqual(files, { 'a.txt': 'hello', 'b.xml': '<x/>' });
});

test('an .lbx for one part: 12 mm tape, number in bold over the name', () => {
  const [strip] = lbxStrips([{ partNum: '15573', name: 'Plate 1 x 2 Jumper' }], { now: new Date('2026-10-11T12:00:00Z') });
  assert.equal(strip.name, '15573-label.lbx');
  const files = unzip(strip.bytes);
  assert.deepEqual(Object.keys(files), ['label.xml', 'prop.xml']);
  const label = files['label.xml'];
  assert.match(label, /format="259"/, '12 mm tape');
  assert.match(label, /width="33.6pt"/);
  assert.equal(label.split('\n').length, 2, 'declaration, then the document on one line');
  assert.match(label, /weight="700"[^]*<pt:data>15573<\/pt:data><text:stringItem charLen="5">/);
  assert.match(label, /weight="400"[^]*<pt:data>Plate 1 x 2 Jumper<\/pt:data><text:stringItem charLen="18">/);
  assert.match(files['prop.xml'], /<dcterms:created>2026-10-11T12:00:00Z<\/dcterms:created>/);
});

test('names are escaped, shrunk to fit, then shortened', () => {
  const measure = (text, size) => text.length * size * 0.5;
  const long = labelLayout({ partNum: '1', name: 'x'.repeat(100) }, measure);
  assert.ok(long.name.text.endsWith('…'));
  assert.ok(measure(long.name.text, long.name.size) <= 200);
  const mid = labelLayout({ partNum: '1', name: 'y'.repeat(45) }, measure);
  assert.equal(mid.name.text, 'y'.repeat(45));
  assert.ok(mid.name.size < 10);
  const xml = labelXml([labelLayout({ partNum: '2', name: 'Tile & "Clip" <1x1>' })]);
  assert.match(xml, /<pt:data>Tile &amp; &quot;Clip&quot; &lt;1x1&gt;<\/pt:data><text:stringItem charLen="19">/);
});

test('many parts go on strips of at most 10 that fit the PT-P300BT', () => {
  const parts = Array.from({ length: 23 }, (_, i) => ({ partNum: String(3000 + i), name: 'Plate 1 x 2 with Clip Vertical' }));
  const strips = lbxStrips(parts);
  assert.ok(strips.length >= 3);
  assert.deepEqual(strips.flatMap((s) => s.parts.map((p) => p.partNum)), parts.map((p) => p.partNum), 'every part, in order');
  for (const s of strips) {
    assert.ok(s.parts.length <= 10);
    const label = unzip(s.bytes)['label.xml'];
    const length = Number(label.match(/<style:backGround[^>]*width="([\d.]+)pt"/)[1]);
    assert.ok(length <= MAX_STRIP_PT, `${length}pt fits`);
    assert.equal((label.match(/<pt:data>\|<\/pt:data>/g) ?? []).length, s.parts.length - 1, 'a cut mark between parts');
  }
  assert.match(strips[0].name, /^labels-1-of-\d+\.lbx$/);
});
