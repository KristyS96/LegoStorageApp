// Guess one of our categories from a catalog name like "Plate 2 x 4".
const CATEGORY_HINTS = [
  [/\btechnic\b|\baxle\b|\bpin\b|\bliftarm\b|\bgear\b/, 'Technic'],
  [/\bminifig|\btorso\b|\blegs\b|\bhead\b|\bhair\b/, 'Minifigures'],
  [/\bwheel|\btire\b|\btyre\b|\bmudguard\b|\bwindscreen\b/, 'Wheels & Vehicles'],
  [/\bwindow\b|\bdoor\b|\bglass\b|\bshutter\b/, 'Windows & Doors'],
  [/\bbracket\b|\bhinge\b|\bclip\b|\bbar\b/, 'Brackets, Hinges & Clips'],
  [/\bslope\b/, 'Slopes'],
  [/\bwedge\b/, 'Wedges'],
  [/\btile\b/, 'Tiles'],
  [/\bplate\b|\bjumper\b/, 'Plates'],
  [/\bround\b|\bcone\b|\bdish\b|\bcylinder\b/, 'Round & Cones'],
  [/\bplant\b|\bflower\b|\bleaf\b|\btree\b|\banimal\b/, 'Plants & Animals'],
  [/\bbrick\b/, 'Bricks'],
];

export function guessCategory(name) {
  const text = String(name ?? '').toLowerCase();
  if (/\bprint|\bpattern|\bsticker/.test(text)) return 'Decorated / Printed';
  for (const [re, category] of CATEGORY_HINTS) if (re.test(text)) return category;
  return '';
}

// ---------- "Where should this go?" ----------
//
// Parts are compared by shape, read from names like "Tile 2 x 2 Corner":
// the kind (Plate, Tile, Brick…), the size, and any details ("corner",
// "studs on edge"). A drawer with free compartments that holds similar parts
// is the best home; next best is an empty drawer beside similar parts.

const STOP_WORDS = new Set(['with', 'w', 'and', 'on', 'in', 'of', 'the', 'no', 'without']);

/** "Tile 2 x 2 with Studs on Edge" -> { type: 'tile', dims: [2, 2], details: ['studs', 'edge'] } */
export function partShape(name) {
  const text = String(name ?? '').toLowerCase().replace(/[()]/g, ' ');
  const dimMatch = text.match(/(\d+)\s*[x×]\s*(\d+)(?:\s*[x×]\s*(\d+))?/);
  const dims = dimMatch ? dimMatch.slice(1).filter(Boolean).map(Number) : [];
  const before = dimMatch ? text.slice(0, dimMatch.index) : text;
  const after = dimMatch ? text.slice(dimMatch.index + dimMatch[0].length) : '';
  const words = (s) => s.split(/[^a-z]+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  const [type = '', ...extra] = words(before);
  return { type, dims, details: [...new Set([...extra, ...words(after)])] };
}

/** How alike two parts are: 0 (nothing in common) to 12 (same kind, size and details). Kind counts most. */
export function similarity(a, b) {
  const sa = partShape(a.name);
  const sb = partShape(b.name);
  let score = 0;
  if (sa.type && sa.type === sb.type) score += 5;
  else if (a.category && a.category === b.category) score += 2;
  if (sa.dims.length && sb.dims.length) {
    if (sa.dims[0] === sb.dims[0]) score += 2;
    const gap = Math.abs((sa.dims[1] ?? 0) - (sb.dims[1] ?? 0));
    if (gap === 0) score += 2;
    else if (gap <= 2) score += 1;
  }
  if (!sa.details.length && !sb.details.length) score += 1;
  else {
    const shared = sa.details.filter((d) => sb.details.includes(d)).length;
    const all = new Set([...sa.details, ...sb.details]).size;
    score += (3 * shared) / all;
  }
  return score;
}

// ---------- Versions of the same part ----------
//
// LEGO often makes small changes to a part and BrickLink gives each version a letter:
// Cone 2 x 2 x 2 is 3942a, 3942b and 3942c, which look identical in a photo. Printed
// versions add more (3068bpr0001). Versions of a part belong in the same compartment.

/** "3942c" -> "3942", "3068bpr0001" -> "3068", "3001" -> "3001". */
export function baseNumber(num) {
  const n = String(num ?? '').trim().toLowerCase();
  return n.match(/^(\d{3,})(?=[a-z]|$)/)?.[1] ?? n;
}

// "Cone 2 x 2 x 2 - Open Stud" / "Cone 2 x 2 x 2 [Open Stud]" -> "cone 2 x 2 x 2";
// only names with a size count, so "Minifig, Head" doesn't match every head.
function nameStem(name) {
  const stem = String(name ?? '').toLowerCase().split(/\s+-\s+|\[|\(/)[0].replace(/\s+/g, ' ').trim();
  return /\d\s*[x×]\s*\d/.test(stem) ? stem : '';
}

/** Are these two different versions of the same part? */
export function isVariant(a, b) {
  const numsA = [a.partNum, ...(a.altNums ?? [])].map((n) => String(n).toLowerCase());
  const numsB = [b.partNum, ...(b.altNums ?? [])].map((n) => String(n).toLowerCase());
  if (numsA.some((n) => numsB.includes(n))) return false; // the same part
  const bases = new Set(numsA.map(baseNumber));
  if (numsB.some((n) => bases.has(baseNumber(n)))) return true;
  const stem = nameStem(a.name);
  return Boolean(stem) && stem === nameStem(b.name);
}

/** Compartments a drawer's parts fill: versions of one part share a compartment. */
export function compartmentsUsed(parts) {
  const groups = [];
  for (const p of parts) {
    const group = groups.find((g) => g.some((q) => isVariant(p, q)));
    if (group) group.push(p);
    else groups.push([p]);
  }
  return groups.length;
}

const LIKE = 6; // similarity at which parts count as "like pieces" (e.g. any two plain tiles)

/**
 * Suggest slots for a part that needs a home.
 * @param part { partNum, name, category }
 * @param catalog { units, slots, parts } from the store
 * @returns [{ slotId, code, kind: 'version' | 'share' | 'beside' | 'empty', reason, score, versionOf? }] best first
 */
export function suggestSlots(part, { units, slots, parts }, { limit = 3 } = {}) {
  const byNum = new Map(parts.map((p) => [p.partNum.toLowerCase(), p]));
  const stored = new Map(slots.map((s) => [s.id, s]));
  const self = part.partNum?.toLowerCase();
  const contentsOf = (id) =>
    (stored.get(id)?.partNums ?? [])
      .filter((n) => n.toLowerCase() !== self)
      .map((n) => byNum.get(n.toLowerCase()) ?? { partNum: n, name: '', category: '' });
  const best = (list) =>
    list.reduce((top, p) => {
      const score = similarity(part, p);
      return score > top.score ? { score, part: p } : top;
    }, { score: -1, part: null });
  const label = (p) => p.name || `#${p.partNum}`;

  const out = [];
  let fallback = null;
  // Another version of this part already has a home: it goes with it, compartment and all.
  const withVersion = new Set();
  for (const unit of units) {
    unit.rows.forEach((cols, r) => {
      for (let c = 0; c < cols; c += 1) {
        const id = `${unit.id}:${r + 1}:${c + 1}`;
        if ((stored.get(id)?.partNums ?? []).some((n) => n.toLowerCase() === self)) continue;
        const version = contentsOf(id).find((p) => isVariant(part, p));
        if (!version) continue;
        withVersion.add(id);
        out.push({
          slotId: id, code: `${unit.code}-${r + 1}-${c + 1}`, kind: 'version', score: 100, versionOf: version.partNum,
          reason: `with ${label(version)}${version.name ? ` (#${version.partNum})` : ''}, another version of this part`,
        });
      }
    });
  }
  for (const unit of units) {
    unit.rows.forEach((cols, r) => {
      for (let c = 0; c < cols; c += 1) {
        const id = `${unit.id}:${r + 1}:${c + 1}`;
        const code = `${unit.code}-${r + 1}-${c + 1}`;
        const slot = stored.get(id);
        const contents = contentsOf(id);
        if ((slot?.partNums ?? []).some((n) => n.toLowerCase() === self)) continue; // already there
        if (withVersion.has(id)) continue;
        if (!contents.length && slot?.label) continue; // named compartment ("Hinges"): contents not listed
        if (contents.length) {
          const free = (slot?.compartments ?? 1) - compartmentsUsed(contents);
          const match = best(contents);
          if (free > 0 && match.score >= LIKE) {
            out.push({
              slotId: id, code, kind: 'share', score: match.score + 1,
              reason: `${free} free compartment${free === 1 ? '' : 's'}, with ${label(match.part)}`,
            });
          }
          continue;
        }
        // Empty drawer: how alike are the parts in the drawers around it?
        const around = [[r, c - 1], [r, c + 1], [r - 1, c], [r + 1, c]]
          .filter(([nr, nc]) => nr >= 0 && nr < unit.rows.length && nc >= 0 && nc < unit.rows[nr])
          .map(([nr, nc]) => ({ code: `${unit.code}-${nr + 1}-${nc + 1}`, match: best(contentsOf(`${unit.id}:${nr + 1}:${nc + 1}`)) }))
          .sort((a, b) => b.match.score - a.match.score)[0];
        if (around && around.match.score >= LIKE) {
          out.push({
            slotId: id, code, kind: 'beside', score: around.match.score - 0.5,
            reason: `empty, next to ${around.code} (${label(around.match.part)})`,
          });
        } else if (!fallback) {
          fallback = { slotId: id, code, kind: 'empty', score: 0, reason: 'empty drawer' };
        }
      }
    });
  }
  out.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code, undefined, { numeric: true }));
  const picks = out.slice(0, limit);
  if (picks.length < limit && fallback) picks.push(fallback);
  return picks;
}
