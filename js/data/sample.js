// Small demo catalog for trying the app out.
import { CATALOG } from './catalog.js';

const unit = (id, code, name, description, rows) => ({ id, code, name, description, rows });
const slot = (unitId, row, col, partNums, label = '') => ({
  id: `${unitId}:${row}:${col}`, unitId, row, col, partNums, label, needsLabel: false, updatedAt: 1,
});

const units = [
  unit('sample_unit_a', 'A', 'Plate & tile cabinet', 'Playroom, left wall', [6, 6, 3]),
  unit('sample_unit_b', 'B', 'Specialty case', 'Shelf by the window', [4, 4]),
  unit('sample_unit_c', 'C', 'Brick case', 'Under the table', [2, 2]),
];

const slots = [
  slot('sample_unit_a', 1, 1, ['3068']),
  slot('sample_unit_a', 1, 2, ['6636']),
  slot('sample_unit_a', 1, 3, ['15573']),
  slot('sample_unit_a', 1, 4, ['3623', '63864']),
  slot('sample_unit_a', 2, 1, ['3069']),
  slot('sample_unit_a', 2, 2, ['69729', '26603']),
  slot('sample_unit_a', 2, 3, ['87079']),
  slot('sample_unit_a', 2, 6, ['2420', '15397']),
  slot('sample_unit_a', 3, 1, ['3023']),
  slot('sample_unit_a', 3, 2, ['3710']),
  slot('sample_unit_a', 3, 3, ['3666']),
  slot('sample_unit_b', 1, 1, ['4735'], 'Clips & bars'),
  slot('sample_unit_b', 1, 2, [], 'Hinges'),
  slot('sample_unit_c', 1, 1, ['3005', '3004']),
  slot('sample_unit_c', 1, 2, ['3003', '3001']),
  slot('sample_unit_c', 2, 1, ['3010', '3009']),
];

const used = new Set(slots.flatMap((s) => s.partNums));

export const SAMPLE = {
  version: 2,
  units,
  slots,
  parts: CATALOG.filter((p) => used.has(p.partNum)).map((p) => ({ ...p, imageUrl: '', updatedAt: 1 })),
  settings: {},
};
