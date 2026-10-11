// Brick Architect publishes a P-touch Editor label for each part at
// https://brickarchitect.com/label/<part number>.lbx (12 mm tape).

/** Number Brick Architect files this part's label under (usually the part number). */
export function labelNumber(part) {
  return String(part.labelNum || part.partNum || '').trim();
}

export function brickArchitectLabelUrl(part) {
  const num = labelNumber(part);
  return num ? `https://brickarchitect.com/label/${encodeURIComponent(num)}.lbx` : '';
}

/** Address of a part's label through the family's relay (cloudflare/label-relay.js). */
export function relayLabelUrl(part, relay) {
  const num = labelNumber(part);
  return relay && num ? `${relay.replace(/\/+$/, '')}/label/${encodeURIComponent(num)}.lbx` : '';
}

/**
 * Does Brick Architect have this label? true or false, or null when the browser
 * can't tell (offline, or the site doesn't let web pages ask; the relay does).
 */
export async function checkBrickArchitect(part, fetchImpl = fetch, { relay = '' } = {}) {
  const url = relay ? relayLabelUrl(part, relay) : brickArchitectLabelUrl(part);
  if (!url) return false;
  let res;
  try {
    res = await fetchImpl(url, { method: 'HEAD' });
  } catch {
    return null;
  }
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) return null;
  // A missing file can come back as the site's "not found" web page.
  return !/text\/html/i.test(res.headers?.get?.('content-type') ?? '');
}

/** A part's Brick Architect label file through the relay; null if Brick Architect has none. */
export async function fetchLabelFile(part, relay, fetchImpl = fetch) {
  const res = await fetchImpl(relayLabelUrl(part, relay));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't get label ${labelNumber(part)} (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The two lines of an app-made label: part number, then name. */
export function appLabelLines(part) {
  return [String(part.partNum ?? '').trim(), String(part.name ?? '').trim() || 'Unnamed part'];
}

/** Split items into groups of at most `size`. */
export function strips(items, size = 10) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Group labels of the given widths into strips no wider than `maxWidth` (with `gap`
 * between labels) and at most `maxCount` labels, keeping their order. Each strip is
 * one print, and the PT-P300BT prints at most 300 mm at a time. Returns index groups.
 */
export function packStrips(widths, { maxWidth, gap = 0, maxCount = 10 }) {
  const out = [];
  let group = [];
  let width = 0;
  widths.forEach((w, i) => {
    const next = group.length ? width + gap + w : w;
    if (group.length && (next > maxWidth || group.length >= maxCount)) {
      out.push(group);
      group = [];
      width = w;
    } else {
      width = next;
    }
    group.push(i);
  });
  if (group.length) out.push(group);
  return out;
}
