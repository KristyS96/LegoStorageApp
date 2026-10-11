// "Check storage": things in the catalog worth tidying up.
//  - versions: different versions of one part (3942a / 3942c) kept in different drawers
//  - spread: the same part in more than one drawer (sometimes on purpose: overflow)
//  - twins: one part listed twice, under numbers that point at each other
import { normNum } from './store.js';
import { isVariant } from './sorting.js';

const numsOf = (p) => [p.partNum, ...(p.altNums ?? [])].map(normNum);

/** `store` is the app's store (state, slotsForPart, codeOf). */
export function storageReport(store) {
  const byCode = (a, b) => store.codeOf(a).localeCompare(store.codeOf(b), undefined, { numeric: true });
  const placed = store.state.parts
    .map((part) => ({ part, slots: store.slotsForPart(part.partNum).sort(byCode) }))
    .filter((x) => x.slots.length);
  const idsOf = (slots) => slots.map((s) => s.id).join(',');

  const spread = placed
    .filter((x) => x.slots.length > 1)
    .map((x) => ({ key: `spread:${normNum(x.part.partNum)}:${idsOf(x.slots)}`, part: x.part, slots: x.slots }));

  // Families of versions: a part joins (and links) every family it's a version of.
  let families = [];
  for (const x of placed) {
    const linked = families.filter((f) => f.some((y) => isVariant(x.part, y.part)));
    families = families.filter((f) => !linked.includes(f));
    families.push([...linked.flat(), x]);
  }
  const versions = families
    .filter((f) => f.length > 1)
    .map((members) => {
      const slots = [...new Map(members.flatMap((m) => m.slots).map((s) => [s.id, s])).values()].sort(byCode);
      const nums = members.map((m) => normNum(m.part.partNum)).sort();
      return { key: `versions:${nums.join('+')}:${idsOf(slots)}`, members, slots };
    })
    .filter((v) => v.slots.length > 1);

  const twins = [];
  const parts = store.state.parts;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const shared = numsOf(parts[i]).filter((n) => numsOf(parts[j]).includes(n));
      if (shared.length) twins.push({ key: `twins:${normNum(parts[i].partNum)}+${normNum(parts[j].partNum)}`, parts: [parts[i], parts[j]], shared });
    }
  }
  return { versions, spread, twins };
}
