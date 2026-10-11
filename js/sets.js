// "Build a set": fetch a set's parts list from Rebrickable and work out which
// drawer each part is in.
//
// Rebrickable lists set inventories under its own part numbers, but every part
// also carries its BrickLink (and LEGO) numbers, which is what the family's
// catalog uses. Those are what we match on and show.

const REBRICKABLE_URL = 'https://rebrickable.com/api/v3/lego';

/** "60337" -> "60337-1"; Rebrickable needs the version suffix. */
export function normalizeSetNum(input) {
  const s = String(input ?? '').trim();
  return /^\d+$/.test(s) ? `${s}-1` : s;
}

async function get(path, key, fetchImpl) {
  if (!key) throw new Error('Add a Rebrickable API key in Settings to look up sets.');
  const url = path.startsWith('http') ? path : `${REBRICKABLE_URL}${path}`;
  const res = await fetchImpl(url, { headers: { Authorization: `key ${key}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Rebrickable lookup failed (${res.status}).`);
  return res.json();
}

/** Numbers to match a Rebrickable part against the catalog, family (BrickLink/LEGO) numbers first. */
export function partNumbers(part) {
  const ids = part?.external_ids ?? {};
  return [...new Set([...(ids.BrickLink ?? []), ...(ids.LEGO ?? []), part?.part_num].filter(Boolean).map(String))];
}

/**
 * Turn Rebrickable inventory rows into pick-list lines: spares left out,
 * the same part in the same color merged.
 */
export function inventoryLines(rows) {
  const lines = new Map();
  for (const row of rows) {
    if (row.is_spare) continue;
    const nums = partNumbers(row.part);
    const key = `${nums[0]}|${row.color?.id ?? ''}`;
    const line = lines.get(key) ?? {
      key,
      partNum: nums[0],
      matchNums: nums,
      name: row.part?.name ?? '',
      imageUrl: row.part?.part_img_url ?? '',
      color: row.color?.name ?? '',
      colorRgb: row.color?.rgb ? `#${row.color.rgb}` : '',
      quantity: 0,
    };
    line.quantity += row.quantity ?? 0;
    lines.set(key, line);
  }
  return [...lines.values()];
}

/** Set details and its parts list (all pages). Null if Rebrickable doesn't know the set. */
export async function fetchSet(input, key, fetchImpl = fetch) {
  const setNum = normalizeSetNum(input);
  if (!setNum) return null;
  const info = await get(`/sets/${encodeURIComponent(setNum)}/`, key, fetchImpl);
  if (!info) return null;
  const rows = [];
  let next = `/sets/${encodeURIComponent(setNum)}/parts/?page_size=1000`;
  while (next) {
    const page = await get(next, key, fetchImpl);
    rows.push(...(page?.results ?? []));
    next = page?.next ?? null;
  }
  return {
    setNum: info.set_num ?? setNum,
    name: info.name ?? '',
    year: info.year ?? null,
    numParts: info.num_parts ?? null,
    imageUrl: info.set_img_url ?? '',
    lines: inventoryLines(rows),
  };
}

/**
 * Where to find each line. `store` needs slotsForPart(num) and codeOf(slot).
 * Returns stops in drawer order (each with its lines) and the lines not in storage.
 */
export function planBuild(set, store) {
  const stops = new Map();
  const missing = [];
  for (const line of set.lines) {
    const slots = line.matchNums.flatMap((n) => store.slotsForPart(n));
    const unique = [...new Map(slots.map((s) => [s.id, s])).values()];
    if (!unique.length) {
      missing.push(line);
      continue;
    }
    const [first, ...others] = unique;
    const stop = stops.get(first.id) ?? { slot: first, code: store.codeOf(first), lines: [] };
    stop.lines.push({ ...line, alsoIn: others.map((s) => store.codeOf(s)) });
    stops.set(first.id, stop);
  }
  const byCode = (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true });
  const pieces = (lines) => lines.reduce((n, l) => n + l.quantity, 0);
  const ordered = [...stops.values()].sort(byCode);
  return {
    stops: ordered,
    missing,
    foundPieces: pieces(ordered.flatMap((s) => s.lines)),
    totalPieces: pieces(set.lines),
  };
}
