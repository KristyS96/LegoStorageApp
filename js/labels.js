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
