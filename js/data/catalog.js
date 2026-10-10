// Built-in names for common parts, so typing a part number fills in its name
// even offline. Names follow the short Brick Architect label style.
// Online lookups (Rebrickable) cover everything else.
const p = (partNum, name, category, altNums = []) => ({ partNum, name, category, altNums });

export const CATALOG = [
  // Bricks
  p('3005', 'Brick 1 x 1', 'Bricks'),
  p('3004', 'Brick 1 x 2', 'Bricks'),
  p('3622', 'Brick 1 x 3', 'Bricks'),
  p('3010', 'Brick 1 x 4', 'Bricks'),
  p('3009', 'Brick 1 x 6', 'Bricks'),
  p('3008', 'Brick 1 x 8', 'Bricks'),
  p('3003', 'Brick 2 x 2', 'Bricks'),
  p('3002', 'Brick 2 x 3', 'Bricks'),
  p('3001', 'Brick 2 x 4', 'Bricks'),
  p('2456', 'Brick 2 x 6', 'Bricks'),
  p('3007', 'Brick 2 x 8', 'Bricks'),
  p('2357', 'Brick 2 x 2 Corner', 'Bricks'),
  p('14716', 'Brick 1 x 1 x 3', 'Bricks'),
  p('2453', 'Brick 1 x 1 x 5', 'Bricks'),

  // Plates
  p('3024', 'Plate 1 x 1', 'Plates'),
  p('3023', 'Plate 1 x 2', 'Plates'),
  p('3623', 'Plate 1 x 3', 'Plates'),
  p('3710', 'Plate 1 x 4', 'Plates'),
  p('3666', 'Plate 1 x 6', 'Plates'),
  p('3460', 'Plate 1 x 8', 'Plates'),
  p('4477', 'Plate 1 x 10', 'Plates'),
  p('60479', 'Plate 1 x 12', 'Plates'),
  p('3022', 'Plate 2 x 2', 'Plates'),
  p('3021', 'Plate 2 x 3', 'Plates'),
  p('3020', 'Plate 2 x 4', 'Plates'),
  p('3795', 'Plate 2 x 6', 'Plates'),
  p('3034', 'Plate 2 x 8', 'Plates'),
  p('3832', 'Plate 2 x 10', 'Plates'),
  p('91988', 'Plate 2 x 14', 'Plates'),
  p('4282', 'Plate 2 x 16', 'Plates'),
  p('11212', 'Plate 3 x 3', 'Plates'),
  p('3031', 'Plate 4 x 4', 'Plates'),
  p('3032', 'Plate 4 x 6', 'Plates'),
  p('3456', 'Plate 6 x 14', 'Plates'),
  p('2420', 'Plate 2 x 2 Corner', 'Plates'),
  p('2639', 'Plate 4 x 4 Corner', 'Plates'),
  p('15397', 'Plate 3 x 3 Cross', 'Plates'),
  p('15573', 'Plate 1 x 2 Jumper', 'Plates', ['3794']),

  // Tiles
  p('3070b', 'Tile 1 x 1', 'Tiles'),
  p('3069', 'Tile 1 x 2', 'Tiles', ['3069b']),
  p('63864', 'Tile 1 x 3', 'Tiles'),
  p('2431', 'Tile 1 x 4', 'Tiles'),
  p('6636', 'Tile 1 x 6', 'Tiles'),
  p('4162', 'Tile 1 x 8', 'Tiles'),
  p('3068', 'Tile 2 x 2', 'Tiles', ['3068b']),
  p('26603', 'Tile 2 x 3', 'Tiles'),
  p('87079', 'Tile 2 x 4', 'Tiles'),
  p('69729', 'Tile 2 x 6', 'Tiles'),
  p('14719', 'Tile 2 x 2 Corner', 'Tiles'),
  p('11203', 'Tile 2 x 2 Inverted', 'Tiles'),
  p('33909', 'Tile 2 x 2 with Studs on Edge', 'Tiles'),
  p('6179', 'Tile 4 x 4 with Studs on Edge', 'Tiles'),
  p('6180', 'Tile 4 x 6 with Studs on Edges', 'Tiles'),
  p('64799', 'Tile 4 x 4 with 2 x 2 Cutout', 'Tiles'),
  p('88646', 'Tile 3 x 4 with Studs in Center', 'Tiles', ['17836']),
  p('92593', 'Plate 1 x 4 with 2 Studs (no Groove)', 'Plates'),
  p('41740', 'Plate 1 x 4 with 2 Studs (with Groove)', 'Plates'),

  // Clips & bars
  p('4735', 'Bar 1 x 3 with Clip (Robot Arm)', 'Brackets, Hinges & Clips'),
];

const index = new Map();
for (const part of CATALOG) {
  for (const num of [part.partNum, ...part.altNums]) index.set(num.toLowerCase(), part);
}

export function lookupCatalog(num) {
  return index.get(String(num ?? '').trim().toLowerCase()) ?? null;
}
