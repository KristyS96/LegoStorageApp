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
