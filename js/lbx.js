// Brother P-touch label files (.lbx) for parts Brick Architect has no label for,
// so they open in Design&Print 2 / P-touch Editor like Brick Architect's own files.
//
// An .lbx is a ZIP holding label.xml (the layout) and prop.xml (file details).
// The layout follows files saved by P-touch Editor for 12 mm tape: two text
// objects per part (number in bold over its name), several parts side by side on
// one strip with a "|" cut mark between them. Format notes: github.com/jdlien/lbx-utils.
import { appLabelLines, packStrips } from './labels.js';

const NS =
  'xmlns:pt="http://schemas.brother.info/ptouch/2007/lbx/main" xmlns:style="http://schemas.brother.info/ptouch/2007/lbx/style" ' +
  'xmlns:text="http://schemas.brother.info/ptouch/2007/lbx/text" xmlns:draw="http://schemas.brother.info/ptouch/2007/lbx/draw" ' +
  'xmlns:image="http://schemas.brother.info/ptouch/2007/lbx/image" xmlns:barcode="http://schemas.brother.info/ptouch/2007/lbx/barcode" ' +
  'xmlns:database="http://schemas.brother.info/ptouch/2007/lbx/database" xmlns:table="http://schemas.brother.info/ptouch/2007/lbx/table" ' +
  'xmlns:cable="http://schemas.brother.info/ptouch/2007/lbx/cable"';

// 12 mm tape, landscape. Sizes in points. The printable band is 28pt tall from y=2.8pt.
const LEFT = 5.6;
const TOP = 2.8;
const BAND = 28;
const NUM_SIZE = 14;
const NAME_SIZE = 10;
const MIN_NAME_SIZE = 7;
const MAX_NAME_WIDTH = 200; // about 7 cm
const GAP = 17; // about 6 mm between parts, with the cut mark in the middle
const CUT_SIZE = 20;
// The PT-P300BT prints labels up to 300 mm long; keep each strip under 280 mm.
export const MAX_STRIP_PT = (280 / 25.4) * 72;
export const MAX_PER_STRIP = 10;

const FONT = 'Helsinki';
const lineHeight = (size) => size * 1.13;

/** Rough text width in points, for when there's no canvas to measure with. */
export function approxWidth(text, size, bold = false) {
  return [...text].length * size * (bold ? 0.62 : 0.55);
}

const xml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const pt = (n) => `${Math.round(n * 10) / 10}pt`;

function fontInfo(size, bold) {
  return (
    `<text:ptFontInfo><text:logFont name="${FONT}" width="0" italic="false" weight="${bold ? 700 : 400}" charSet="0" pitchAndFamily="2"/>` +
    `<text:fontExt effect="NOEFFECT" underline="0" strikeout="0" size="${pt(size)}" orgSize="${pt(size)}" textColor="#000000" textPrintColorNumber="1"/></text:ptFontInfo>`
  );
}

function textObject({ x, y, width, height, text, size, bold = false, name }) {
  return (
    '<text:text>' +
    `<pt:objectStyle x="${pt(x)}" y="${pt(y)}" width="${pt(width)}" height="${pt(height)}" backColor="#FFFFFF" backPrintColorNumber="0" ropMode="COPYPEN" angle="0" anchor="TOPLEFT" flip="NONE">` +
    '<pt:pen style="NULL" widthX="0.5pt" widthY="0.5pt" color="#000000" printColorNumber="1"/>' +
    '<pt:brush style="NULL" color="#000000" printColorNumber="1" id="0"/>' +
    `<pt:expanded objectName="${name}" ID="0" lock="0" templateMergeTarget="LABELLIST" templateMergeType="NONE" templateMergeID="0" linkStatus="NONE" linkID="0"/>` +
    '</pt:objectStyle>' +
    fontInfo(size, bold) +
    '<text:textControl control="AUTOLEN" clipFrame="false" aspectNormal="true" shrink="true" autoLF="false" avoidImage="false"/>' +
    '<text:textAlign horizontalAlignment="LEFT" verticalAlignment="TOP" inLineAlignment="BASELINE"/>' +
    `<text:textStyle vertical="false" nullBlock="false" charSpace="0" lineSpace="0" orgPoint="${pt(size)}" combinedChars="false"/>` +
    `<pt:data>${xml(text)}</pt:data>` +
    `<text:stringItem charLen="${text.length}">${fontInfo(size, bold)}</text:stringItem>` +
    '</text:text>'
  );
}

// Fit the name: smaller type first, then cut short with "…".
function fitName(name, measure) {
  for (let size = NAME_SIZE; size >= MIN_NAME_SIZE; size -= 0.5) {
    if (measure(name, size, false) <= MAX_NAME_WIDTH) return { text: name, size };
  }
  let t = name;
  while (t.length > 1 && measure(`${t}…`, MIN_NAME_SIZE, false) > MAX_NAME_WIDTH) t = t.slice(0, -1);
  return { text: `${t.trimEnd()}…`, size: MIN_NAME_SIZE };
}

/** Layout of one part's label: its two lines and its width in points. */
export function labelLayout(part, measure = approxWidth) {
  const [num, rawName] = appLabelLines(part);
  const name = fitName(rawName, measure);
  const numWidth = measure(num, NUM_SIZE, true);
  const nameWidth = measure(name.text, name.size, false);
  return { num, name, numWidth, nameWidth, width: Math.max(numWidth, nameWidth) };
}

/** label.xml for a strip of labels. */
export function labelXml(layouts) {
  const objects = [];
  let x = LEFT;
  layouts.forEach((l, i) => {
    if (i) {
      const cutWidth = approxWidth('|', CUT_SIZE);
      objects.push(textObject({ x: x + GAP / 2 - cutWidth / 2, y: TOP, width: cutWidth, height: BAND, text: '|', size: CUT_SIZE, name: `Cut${i}` }));
      x += GAP;
    }
    const numHeight = lineHeight(NUM_SIZE);
    objects.push(textObject({ x, y: TOP, width: l.numWidth, height: numHeight, text: l.num, size: NUM_SIZE, bold: true, name: `Number${i + 1}` }));
    objects.push(
      textObject({ x, y: TOP + numHeight - 0.2, width: l.nameWidth, height: lineHeight(l.name.size), text: l.name.text, size: l.name.size, name: `Name${i + 1}` }),
    );
    x += l.width;
  });
  const length = Math.max(x - LEFT, 34.4);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<pt:document ${NS} version="1.9" generator="com.brother.PtouchEditor"><pt:body currentSheet="Sheet 1" direction="LTR"><style:sheet name="Sheet 1">` +
    '<style:paper media="0" width="33.6pt" height="2834.4pt" marginLeft="2.8pt" marginTop="5.6pt" marginRight="2.8pt" marginBottom="5.6pt" orientation="landscape" autoLength="true" monochromeDisplay="true" printColorDisplay="false" printColorsID="0" paperColor="#FFFFFF" paperInk="#000000" split="1" format="259" backgroundTheme="0" printerID="30256" printerName="Brother PT-P710BT"/>' +
    '<style:cutLine regularCut="0pt" freeCut=""/>' +
    `<style:backGround x="${pt(LEFT)}" y="${pt(TOP)}" width="${pt(length)}" height="${pt(BAND)}" brushStyle="NULL" brushId="0" userPattern="NONE" userPatternId="0" color="#000000" printColorNumber="1" backColor="#FFFFFF" backPrintColorNumber="0"/>` +
    `<pt:objects>${objects.join('')}</pt:objects></style:sheet></pt:body></pt:document>`
  );
}

export function propXml(now = new Date()) {
  const when = now.toISOString().replace(/\.\d+Z$/, 'Z');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<meta:properties xmlns:meta="http://schemas.brother.info/ptouch/2007/lbx/meta" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">' +
    '<meta:appName>com.brother.PtouchEditor</meta:appName><dc:title></dc:title><dc:subject></dc:subject><dc:creator></dc:creator><meta:keyword></meta:keyword><dc:description></dc:description><meta:template></meta:template>' +
    `<dcterms:created>${when}</dcterms:created><dcterms:modified>${when}</dcterms:modified>` +
    '<meta:lastPrinted></meta:lastPrinted><meta:modifiedBy></meta:modifiedBy><meta:revision>1</meta:revision><meta:editTime>0</meta:editTime><meta:numPages>1</meta:numPages><meta:numWords>0</meta:numWords><meta:numChars>0</meta:numChars><meta:security>0</meta:security><meta:transferScript></meta:transferScript></meta:properties>'
  );
}

// ---- a minimal ZIP writer (files stored uncompressed) ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A ZIP archive of [{ name, data: Uint8Array }], stored without compression. */
export function zip(files) {
  const enc = new TextEncoder();
  const DOS_DATE = 0x0021; // 1980-01-01, as in P-touch Editor's own templates
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(8, 0, true); // stored
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, file.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true); // version made by
    entry.setUint16(6, 20, true); // version needed
    entry.setUint16(14, DOS_DATE, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, size, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The bytes of an .lbx file for a strip of labels. */
export function lbxBytes(layouts, now = new Date()) {
  const enc = new TextEncoder();
  return zip([
    { name: 'label.xml', data: enc.encode(labelXml(layouts)) },
    { name: 'prop.xml', data: enc.encode(propXml(now)) },
  ]);
}

/**
 * Group parts into strips that each print in one go (at most 10 parts, under
 * 280 mm) and make an .lbx for each. Returns [{ parts, name, bytes }].
 */
export function lbxStrips(parts, { measure = approxWidth, now = new Date() } = {}) {
  const layouts = parts.map((p) => labelLayout(p, measure));
  const groups = packStrips(
    layouts.map((l) => l.width),
    { maxWidth: MAX_STRIP_PT, gap: GAP, maxCount: MAX_PER_STRIP },
  );
  return groups.map((idx, i) => ({
    parts: idx.map((j) => parts[j]),
    name:
      groups.length === 1 && idx.length === 1
        ? `${layouts[idx[0]].num.replace(/[^\w.-]+/g, '_') || 'part'}-label.lbx`
        : `labels-${i + 1}-of-${groups.length}.lbx`,
    bytes: lbxBytes(idx.map((j) => layouts[j]), now),
  }));
}
