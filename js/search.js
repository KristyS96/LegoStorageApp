// Fast in-memory search across a family-sized collection (thousands of rows).
import { getColor } from './data/colors.js';

export function tokenize(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
}

// Common ways people describe sizes ("2 x 4", "2by4") -> "2x4".
export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/(\d)\s*(?:x|by|×)\s*(\d)/g, '$1x$2');
}

function scoreToken(token, fields) {
  if (fields.partNum === token) return 100;
  if (fields.partNum.startsWith(token)) return 60;
  if (fields.name.split(/\s+/).includes(token)) return 30;
  if (fields.name.includes(token)) return 20;
  if (fields.color.includes(token)) return 15;
  if (fields.category.includes(token)) return 10;
  if (fields.location.includes(token)) return 10;
  if (fields.notes.includes(token)) return 5;
  return 0;
}

/**
 * @param {Array} parts
 * @param {Array} locations
 * @param {string} query free text: part number, name, color, bin...
 * @param {{colorId?: number, category?: string, locationId?: string}} filters
 */
export function searchParts(parts, locations, query, filters = {}) {
  const locNames = new Map(locations.map((l) => [l.id, l.name.toLowerCase()]));
  const tokens = tokenize(normalizeText(query));

  const results = [];
  for (const part of parts) {
    if (filters.colorId != null && filters.colorId !== '' && part.colorId !== Number(filters.colorId)) continue;
    if (filters.category && part.category !== filters.category) continue;
    if (filters.locationId === 'unsorted') {
      if (part.locationId) continue;
    } else if (filters.locationId && part.locationId !== filters.locationId) {
      continue;
    }

    if (!tokens.length) {
      results.push({ part, score: 0 });
      continue;
    }

    const fields = {
      partNum: part.partNum.toLowerCase(),
      name: normalizeText(part.name),
      color: getColor(part.colorId).name.toLowerCase(),
      category: part.category.toLowerCase(),
      location: locNames.get(part.locationId) ?? 'unsorted',
      notes: part.notes.toLowerCase(),
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

  results.sort((a, b) => b.score - a.score || b.part.updatedAt - a.part.updatedAt);
  return results.map((r) => r.part);
}
