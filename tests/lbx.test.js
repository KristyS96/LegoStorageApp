import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appPiece, crc32, labelLayout, lbxPiece, lbxStrips, makeStrips, MAX_STRIP_PT, shiftX, stripContents, unzip, zip } from '../js/lbx.js';

// Read a stored (uncompressed) ZIP back: { name: text }.
function readZip(bytes) {
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
  const files = readZip(zip([{ name: 'a.txt', data: enc.encode('hello') }, { name: 'b.xml', data: enc.encode('<x/>') }]));
  assert.deepEqual(files, { 'a.txt': 'hello', 'b.xml': '<x/>' });
});

test('an .lbx for one part: 12 mm tape, number in bold over the name', () => {
  const [strip] = lbxStrips([{ partNum: '15573', name: 'Plate 1 x 2 Jumper' }], { now: new Date('2026-10-11T12:00:00Z') });
  assert.equal(strip.name, '15573-label.lbx');
  const files = readZip(strip.bytes);
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
  const { xml } = stripContents([appPiece({ partNum: '2', name: 'Tile & "Clip" <1x1>' })]);
  assert.match(xml, /<pt:data>Tile &amp; &quot;Clip&quot; &lt;1x1&gt;<\/pt:data><text:stringItem charLen="19">/);
});

test('many parts go on strips of at most 10 that fit the PT-P300BT', () => {
  const parts = Array.from({ length: 23 }, (_, i) => ({ partNum: String(3000 + i), name: 'Plate 1 x 2 with Clip Vertical' }));
  const strips = lbxStrips(parts);
  assert.ok(strips.length >= 3);
  assert.deepEqual(strips.flatMap((s) => s.parts.map((p) => p.partNum)), parts.map((p) => p.partNum), 'every part, in order');
  for (const s of strips) {
    assert.ok(s.parts.length <= 10);
    const label = readZip(s.bytes)['label.xml'];
    const length = Number(label.match(/<style:backGround[^>]*width="([\d.]+)pt"/)[1]);
    assert.ok(length <= MAX_STRIP_PT, `${length}pt fits`);
    assert.equal((label.match(/<pt:data>\|<\/pt:data>/g) ?? []).length, s.parts.length - 1, 'a cut mark between parts');
  }
  assert.match(strips[0].name, /^labels-1-of-\d+\.lbx$/);
});

// A label shaped like Brick Architect's: a picture, then a text block (name lines in
// bold, number below) whose frame is much wider than its text.
const BA_LABEL =
  '<?xml version="1.0" encoding="UTF-8"?><pt:document xmlns:pt="x"><pt:body><style:sheet name="Sheet 1">' +
  '<style:paper media="0" width="33.6pt" height="850pt"/><style:backGround x="5.6pt" y="4pt" width="67pt" height="25.6pt"/><pt:objects>' +
  '<text:text><pt:objectStyle x="36.26835443038pt" y="4pt" width="200pt" height="25.6pt"><pt:expanded objectName="Text22"/></pt:objectStyle>' +
  '<text:ptFontInfo><text:fontExt size="8pt"/></text:ptFontInfo><text:textAlign horizontalAlignment="JUSTIFY"/>' +
  '<pt:data>1×2 Brick,\n2-Pin Holes\n32000</pt:data></text:text>' +
  '<image:image><pt:objectStyle x="5.6pt" y="4pt" width="27.86835443038pt" height="25.6pt"><pt:expanded objectName="Image23"/></pt:objectStyle>' +
  '<image:imageStyle originalName="32000.png" fileName="32000.png"><image:orgPos x="5.6pt" y="4pt" width="27.86835443038pt" height="25.6pt"/></image:imageStyle></image:image>' +
  '</pt:objects></style:sheet></pt:body></pt:document>';

async function deflated(name, text) {
  const raw = new TextEncoder().encode(text);
  const data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  return { name, data, raw };
}

// A ZIP with one deflated entry, like Brick Architect's files (zip() only stores).
async function baFile() {
  const enc = new TextEncoder();
  const stored = zip([
    { name: 'prop.xml', data: enc.encode('<meta/>') },
    { name: '32000.png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) },
    { name: 'label.xml', data: enc.encode(BA_LABEL) },
  ]);
  return stored;
}

test('reads ZIPs with deflated entries', async () => {
  const entry = await deflated('label.xml', BA_LABEL);
  // Build a one-file ZIP by hand with method 8.
  const name = new TextEncoder().encode(entry.name);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(8, 8, true);
  local.setUint32(18, entry.data.length, true);
  local.setUint32(22, entry.raw.length, true);
  local.setUint16(26, name.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(10, 8, true);
  central.setUint32(20, entry.data.length, true);
  central.setUint32(24, entry.raw.length, true);
  central.setUint16(28, name.length, true);
  const endRec = new DataView(new ArrayBuffer(22));
  endRec.setUint32(0, 0x06054b50, true);
  endRec.setUint16(8, 1, true);
  endRec.setUint16(10, 1, true);
  endRec.setUint32(12, 46 + name.length, true);
  endRec.setUint32(16, 30 + name.length + entry.data.length, true);
  const parts = [new Uint8Array(local.buffer), name, entry.data, new Uint8Array(central.buffer), name, new Uint8Array(endRec.buffer)];
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (bytes.set(p, at), (at += p.length));
  const files = await unzip(bytes);
  assert.equal(new TextDecoder().decode(files['label.xml']), BA_LABEL);
});

test('moves objects along the tape', () => {
  assert.equal(shiftX('<a x="5.6pt" y="4pt" width="9pt"/><b x="10pt" trimOrgX="0pt"/>', 10), '<a x="15.6pt" y="4pt" width="9pt"/><b x="20pt" trimOrgX="0pt"/>');
});

test("Brick Architect's labels go on a strip next to app-made ones", async () => {
  const measure = (text, size) => text.length * size * 0.5;
  const ba = await lbxPiece(await baFile(), { key: '32000', measure });
  // picture from 5.6, text from 36.27, longest line "2-Pin Holes" = 11 chars * 8pt * 0.5 + 2 = 46pt
  assert.ok(Math.abs(ba.width - (36.26835443038 - 5.6 + 46)) < 0.01, `width ${ba.width}`);
  assert.match(ba.objects, /width="46pt"/, 'text frame trimmed to its text');
  assert.match(ba.objects, /horizontalAlignment="LEFT"/);
  assert.deepEqual(ba.files.map((f) => f.name), ['32000.png']);

  const [strip, ...rest] = makeStrips([appPiece({ partNum: '15573', name: 'Plate 1 x 2 Jumper' }, measure), ba, ba]);
  assert.equal(rest.length, 0);
  assert.deepEqual(strip.keys, ['15573', '32000', '32000']);
  const files = readZip(strip.bytes);
  assert.deepEqual(Object.keys(files).sort(), ['L2_32000.png', 'L3_32000.png', 'label.xml', 'prop.xml']);
  const label = files['label.xml'];
  assert.match(label, /fileName="L2_32000.png"[^]*fileName="L3_32000.png"/, 'each picture points at its own copy');
  assert.equal((label.match(/<pt:data>\|<\/pt:data>/g) ?? []).length, 2);
  // the second Brick Architect label sits one label + one gap after the first
  const pics = [...label.matchAll(/<image:orgPos x="([\d.]+)pt"/g)].map((m) => Number(m[1]));
  assert.ok(Math.abs(pics[1] - pics[0] - (ba.width + 17)) < 0.01, `${pics}`);
  assert.match(label, /objectName="Image23_2"[^]*objectName="Image23_3"/);
});

test('a file that is not a label is refused', async () => {
  await assert.rejects(lbxPiece(new Uint8Array([1, 2, 3])), /isn't a label file/);
  await assert.rejects(lbxPiece(zip([{ name: 'label.xml', data: new TextEncoder().encode('<x/>') }])), /isn't a label file/);
});
