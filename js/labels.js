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

/**
 * Does Brick Architect have this label? true or false, or null when the browser
 * can't tell (offline, or the site doesn't let other web pages ask).
 */
export async function checkBrickArchitect(part, fetchImpl = fetch) {
  const url = brickArchitectLabelUrl(part);
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

/** The two lines of an app-made label: part number, then name. */
export function appLabelLines(part) {
  return [String(part.partNum ?? '').trim(), String(part.name ?? '').trim() || 'Unnamed part'];
}

/** Split labels into strips of at most `size`, so each strip is one print. */
export function strips(items, size = 10) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
