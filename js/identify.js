// Part identification helpers.
//  - Brickognize: free image recognition for LEGO parts (no key needed).
//  - Rebrickable: part catalog lookups by number / name (free API key).

const BRICKOGNIZE_URL = 'https://api.brickognize.com/predict/parts/';
const REBRICKABLE_URL = 'https://rebrickable.com/api/v3/lego';

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

export function parseRebrickablePart(json) {
  return {
    partNum: json.part_num ?? '',
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

// Try an exact part number first, then fall back to a name search.
export async function lookupPart(query, key, fetchImpl = fetch) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  if (/^[0-9a-z]+$/i.test(q)) {
    const exact = await rebrickable(`/parts/${encodeURIComponent(q)}/`, key, fetchImpl);
    if (exact) return [parseRebrickablePart(exact)];
  }
  const list = await rebrickable(`/parts/?search=${encodeURIComponent(q)}&page_size=12`, key, fetchImpl);
  return (list?.results ?? []).map(parseRebrickablePart);
}

/** Exact part-number lookup on Rebrickable; null when Rebrickable doesn't know the number. */
export async function partByNumber(num, key, fetchImpl = fetch) {
  const q = String(num ?? '').trim();
  if (!q) return null;
  const found = await rebrickable(`/parts/${encodeURIComponent(q)}/`, key, fetchImpl);
  return found ? parseRebrickablePart(found) : null;
}
