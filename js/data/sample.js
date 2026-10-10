// Small demo collection for trying the app out.
const loc = (id, name, description, categories = [], partNums = [], colorIds = []) => ({
  id, name, description, categories, partNums, colorIds,
});
const part = (id, partNum, name, category, colorId, quantity, locationId, notes = '') => ({
  id, partNum, name, category, colorId, quantity, locationId, notes, imageUrl: '', updatedAt: 1,
});

export const SAMPLE = {
  version: 1,
  locations: [
    loc('sample_loc_a1', 'A1', 'Drawer tower, top left – basic bricks', ['Bricks']),
    loc('sample_loc_a2', 'A2', 'Drawer tower – plates', ['Plates']),
    loc('sample_loc_b1', 'B1', 'Drawer tower – slopes & tiles', ['Slopes', 'Tiles', 'Wedges']),
    loc('sample_loc_tech', 'Technic Tub', 'Blue tub under the desk', ['Technic', 'Wheels & Vehicles']),
    loc('sample_loc_figs', 'Minifig Case', 'Clear case on the shelf', ['Minifigures']),
    loc('sample_loc_red', 'Red Bin', 'Big red tub – all red bricks', ['Bricks'], [], [4]),
  ],
  parts: [
    part('sample_p1', '3001', 'Brick 2 x 4', 'Bricks', 4, 24, 'sample_loc_a1'),
    part('sample_p2', '3001', 'Brick 2 x 4', 'Bricks', 15, 18, 'sample_loc_a1'),
    part('sample_p3', '3003', 'Brick 2 x 2', 'Bricks', 14, 31, 'sample_loc_a1'),
    part('sample_p4', '3004', 'Brick 1 x 2', 'Bricks', 1, 40, 'sample_loc_a1'),
    part('sample_p5', '3010', 'Brick 1 x 4', 'Bricks', 0, 12, 'sample_loc_a1'),
    part('sample_p6', '3020', 'Plate 2 x 4', 'Plates', 71, 22, 'sample_loc_a2'),
    part('sample_p7', '3023', 'Plate 1 x 2', 'Plates', 72, 55, 'sample_loc_a2'),
    part('sample_p8', '3024', 'Plate 1 x 1', 'Plates', 2, 80, 'sample_loc_a2'),
    part('sample_p9', '3039', 'Slope 45° 2 x 2', 'Slopes', 4, 14, 'sample_loc_b1', 'Roof pieces'),
    part('sample_p10', '3069b', 'Tile 1 x 2 with Groove', 'Tiles', 0, 30, 'sample_loc_b1'),
    part('sample_p11', '3068b', 'Tile 2 x 2 with Groove', 'Tiles', 19, 9, 'sample_loc_b1'),
    part('sample_p12', '2780', 'Technic Pin with Friction Ridges', 'Technic', 0, 120, 'sample_loc_tech'),
    part('sample_p13', '32523', 'Technic Beam 1 x 3 Thick', 'Technic', 72, 16, 'sample_loc_tech'),
    part('sample_p14', '4624', 'Wheel 8mm D. x 6mm', 'Wheels & Vehicles', 15, 8, null, 'Found under the couch'),
    part('sample_p15', '973', 'Minifig Torso', 'Minifigures', 1, 6, 'sample_loc_figs', 'Police torsos'),
  ],
  settings: {},
};
