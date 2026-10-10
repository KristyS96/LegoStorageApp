// "Where does this part go?" — suggests bins for a part based on each bin's
// rules (categories / part numbers / colors it holds) and on where the same
// part is already stored.

const CATEGORY_HINTS = [
  [/\btechnic\b|\baxle\b|\bpin\b|\bliftarm\b|\bgear\b/, 'Technic'],
  [/\bminifig|\btorso\b|\blegs\b|\bhead\b|\bhair\b/, 'Minifigures'],
  [/\bwheel|\btire\b|\btyre\b|\bmudguard\b|\bwindscreen\b/, 'Wheels & Vehicles'],
  [/\bwindow\b|\bdoor\b|\bglass\b|\bshutter\b/, 'Windows & Doors'],
  [/\bbracket\b|\bhinge\b/, 'Brackets & Hinges'],
  [/\bslope\b/, 'Slopes'],
  [/\bwedge\b/, 'Wedges'],
  [/\btile\b/, 'Tiles'],
  [/\bplate\b/, 'Plates'],
  [/\bround\b|\bcone\b|\bdish\b|\bcylinder\b/, 'Round & Cones'],
  [/\bplant\b|\bflower\b|\bleaf\b|\btree\b|\banimal\b/, 'Plants & Animals'],
  [/\bbrick\b/, 'Bricks'],
];

// Guess one of our categories from a catalog name like "Plate 2 x 4".
export function guessCategory(name) {
  const text = String(name ?? '').toLowerCase();
  if (/\bprint|\bpattern|\bsticker/.test(text)) return 'Decorated / Printed';
  for (const [re, category] of CATEGORY_HINTS) if (re.test(text)) return category;
  return '';
}

export function binRules(location) {
  return {
    categories: location.categories ?? [],
    partNums: (location.partNums ?? []).map((n) => n.toLowerCase()),
    colorIds: location.colorIds ?? [],
  };
}

export function hasRules(location) {
  const r = binRules(location);
  return r.categories.length + r.partNums.length + r.colorIds.length > 0;
}

/**
 * @param {{partNum?: string, category?: string, colorId?: number}} part
 * @param {Array} locations
 * @param {Array} parts the collection, to find where this part already lives
 * @returns {Array<{location, reasons: string[], score: number}>} best first
 */
export function suggestBins(part, locations, parts = []) {
  const partNum = String(part.partNum ?? '').trim().toLowerCase();
  const category = part.category ?? '';
  const colorId = part.colorId == null || part.colorId === '' ? -1 : Number(part.colorId);

  const storedIn = new Set(
    partNum
      ? parts
          .filter((p) => p.locationId && p.partNum.toLowerCase() === partNum && (colorId === -1 || p.colorId === colorId))
          .map((p) => p.locationId)
      : [],
  );

  const suggestions = [];
  for (const location of locations) {
    const rules = binRules(location);
    const reasons = [];
    let score = 0;

    if (storedIn.has(location.id)) {
      score += 8;
      reasons.push('already stored here');
    }

    const numMatch = partNum && rules.partNums.includes(partNum);
    const catMatch = category && rules.categories.includes(category);
    const colorMatch = colorId !== -1 && rules.colorIds.includes(colorId);

    // A bin restricted to some colors (e.g. "Red bricks") needs a part known to be one of them.
    const colorExcluded = rules.colorIds.length && !colorMatch;
    // A bin restricted to some kinds of parts is wrong for a part that matches none of them.
    const kindExcluded = (rules.categories.length || rules.partNums.length) && !numMatch && !catMatch;

    if (!storedIn.has(location.id) && (!hasRules(location) || colorExcluded || kindExcluded)) continue;

    if (numMatch) {
      score += 6;
      reasons.push(`holds #${part.partNum.trim()}`);
    }
    if (catMatch) {
      score += 3;
      reasons.push(`holds ${category}`);
    }
    if (colorMatch) {
      score += 2;
      reasons.push('color matches');
    }
    if (score > 0) suggestions.push({ location, reasons, score });
  }

  return suggestions.sort((a, b) => b.score - a.score || a.location.name.localeCompare(b.location.name));
}
