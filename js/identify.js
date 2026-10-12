// Part identification helpers.
//  - Brickognize: free image recognition for LEGO parts (no key needed).
//  - Rebrickable: names and pictures by BrickLink/LEGO number or by name (free API key).

const BRICKOGNIZE_URL = 'https://api.brickognize.com/predict/parts/';
const REBRICKABLE_URL = 'https://rebrickable.com/api/v3/lego';

/**
 * BrickLink's catalog pictures for a part number, best first: the large picture,
 * then the part in black, white and light grey. Used when a part has no picture of
 * its own; the page tries each in turn (a missing one just fails to load).
 */
export function brickLinkImages(num) {
  const n = encodeURIComponent(String(num ?? '').trim());
  if (!n) return [];
  return [`https://img.bricklink.com/ItemImage/PL/${n}.png`, ...[11, 1, 86].map((c) => `https://img.bricklink.com/ItemImage/PN/${c}/${n}.png`)];
}

export function parseBrickognize(json) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items.map((item) => ({
    partNum: String(item.id ?? ''),
    name: item.name ?? '',
    imageUrl: item.img_url ?? '',
    category: item.category ?? '',
    score: typeof item.score === 'number' ? item.score : null,
  }));
}

export async function identifyFromPhoto(file, fetchImpl = fetch) {
  const body = new FormData();
  body.append('query_image', file, file.name || 'part.jpg');
  const res = await fetchImpl(BRICKOGNIZE_URL, { method: 'POST', body });
  if (!res.ok) throw new Error(`Photo recognition failed (${res.status}).`);
  return parseBrickognize(await res.json());
}

// Rebrickable has its own part numbering, but the family's labels (Brick Architect),
// Brickognize and BrickLink use BrickLink/LEGO numbers. Rebrickable is only used for
// names and pictures; its own numbers are never shown or saved.

/** The BrickLink number for a Rebrickable part (or its LEGO number); null if it has neither. */
export function familyNumber(json) {
  const ids = json?.external_ids ?? {};
  return String(ids.BrickLink?.[0] ?? ids.LEGO?.[0] ?? '').trim() || null;
}

export function parseRebrickablePart(json, partNum = familyNumber(json)) {
  if (!partNum) return null;
  return {
    partNum,
    name: json.name ?? '',
    imageUrl: json.part_img_url ?? '',
    category: '',
    score: null,
  };
}

async function rebrickable(path, key, fetchImpl) {
  if (!key) throw new Error('Add a Rebrickable API key in Settings to look up parts online.');
  const res = await fetchImpl(`${REBRICKABLE_URL}${path}`, {
    headers: { Authorization: `key ${key}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Rebrickable lookup failed (${res.status}).`);
  return res.json();
}

/**
 * Name and picture for a BrickLink/LEGO part number, keeping the number as given.
 * Looks it up by BrickLink number, then by LEGO number; null when neither matches.
 */
export async function partByNumber(num, key, fetchImpl = fetch) {
  const q = String(num ?? '').trim();
  if (!q) return null;
  for (const field of ['bricklink_id', 'lego_id']) {
    const list = await rebrickable(`/parts/?${field}=${encodeURIComponent(q)}&page_size=5`, key, fetchImpl);
    const hit = list?.results?.[0];
    if (hit) return parseRebrickablePart(hit, q);
  }
  return null;
}

// A part number first, then a name search ("plate 1 x 2"); results carry BrickLink numbers.
export async function lookupPart(query, key, fetchImpl = fetch) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  if (/^[0-9a-z]+$/i.test(q)) {
    const exact = await partByNumber(q, key, fetchImpl);
    if (exact) return [exact];
  }
  const list = await rebrickable(`/parts/?search=${encodeURIComponent(q)}&page_size=12`, key, fetchImpl);
  const seen = new Set();
  return (list?.results ?? [])
    .map((json) => parseRebrickablePart(json))
    .filter((p) => p && !seen.has(p.partNum) && seen.add(p.partNum));
}
