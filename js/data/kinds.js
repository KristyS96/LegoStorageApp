// Kinds of storage unit. `size` is how much one slot holds, in small cabinet drawers;
// `split` says whether a slot can be divided into compartments.
export const UNIT_KINDS = {
  cabinet: { label: 'Drawer cabinet', slot: 'drawer', size: 1, split: true },
  case: { label: 'Compartment case', slot: 'compartment', size: 0.5, split: false },
  tub: { label: 'Tub / bin', slot: 'bin', size: 4, split: true },
};

export function kindOf(unit) {
  return UNIT_KINDS[unit?.kind] ?? UNIT_KINDS.cabinet;
}

export const MAX_SPAN = 4; // a slot can be up to 4 spots wide on the map
