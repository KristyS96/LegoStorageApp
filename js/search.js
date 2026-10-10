// Fast in-memory search across the family's part catalog.

export function tokenize(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
}

// Common ways people describe sizes ("2 x 4", "2by4", "2×4") -> "2x4".
export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/(\d)\s*(?:x|by|×)\s*(?=\d)/g, '$1x');
}

function scoreToken(token, fields) {
  if (fields.nums.includes(token)) return 100;
  if (fields.nums.some((n) => n.startsWith(token))) return 60;
  if (fields.slots.includes(token)) return 50;
  if (fields.nameWords.includes(token)) return 30;
  if (fields.name.includes(token)) return 20;
  if (fields.category.includes(token)) return 10;
  if (fields.slotText.includes(token)) return 10;
  return 0;
}

/**
 * @param {Array} parts catalog parts
 * @param {string} query part number, name ("1x2 plate"), slot code ("a-7-1") or slot label
 * @param {{slotsFor?: (part) => Array<{code: string, label: string}>, category?: string}} opts
 */
export function searchParts(parts, query, { slotsFor = () => [], category = '' } = {}) {
  const tokens = tokenize(normalizeText(query));
  const results = [];
  for (const part of parts) {
    if (category && part.category !== category) continue;
    if (!tokens.length) {
      results.push({ part, score: 0 });
      continue;
    }
    const slots = slotsFor(part);
    const name = normalizeText(part.name);
    const fields = {
      nums: [part.partNum, ...part.altNums].map((n) => n.toLowerCase()),
      name,
      nameWords: name.split(/\s+/),
      category: part.category.toLowerCase(),
      slots: slots.map((s) => s.code.toLowerCase()),
      slotText: slots.map((s) => `${s.code} ${s.label}`.toLowerCase()).join(' '),
    };
    let score = 0;
    let allMatched = true;
    for (const t of tokens) {
      const s = scoreToken(t, fields);
      if (!s) {
        allMatched = false;
        break;
      }
      score += s;
    }
    if (allMatched) results.push({ part, score });
  }
  results.sort((a, b) => b.score - a.score || a.part.name.localeCompare(b.part.name, undefined, { numeric: true }));
  return results.map((r) => r.part);
}
