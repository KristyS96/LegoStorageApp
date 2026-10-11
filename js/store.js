// Collection data model + persistence.
//
// The collection is sorted by part, not color. Storage is described as:
//   units:  storage units (a drawer cabinet, a divided case) with a grid layout.
//           `rows` lists how many drawers/compartments each row has, top to bottom,
//           e.g. [6, 6, 6, 6, 6, 3, 3, 3].
//   slots:  one drawer or compartment, addressed by unit code + row + column
//           ("A-7-1"). Holds one or more part numbers, all colors mixed.
//   parts:  the family's part catalog: number, alternate numbers, name.
//
// Shape (version 2):
//   { version, units: [{ id, code, name, description, rows }],
//     slots: [{ id, unitId, row, col, label, partNums, needsLabel, updatedAt }],
//     parts: [{ partNum, altNums, name, category, imageUrl, updatedAt }],
//     settings: { rebrickableKey } }
//
// The store is storage-agnostic so it runs in the browser (localStorage) and
// in Node tests (in-memory backend).

import { lookupCatalog } from './data/catalog.js';
import { guessCategory } from './sorting.js';

export const STORAGE_KEY = 'lego-organizer:v1';
export const SCHEMA_VERSION = 2;

export function memoryBackend(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

function defaultBackend() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw in private mode; fall through to memory.
  }
  return memoryBackend();
}

function emptyState() {
  return { version: SCHEMA_VERSION, units: [], slots: [], parts: [], settings: {} };
}

let idCounter = 0;
export function newId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function clean(str) {
  return String(str ?? '').trim();
}

// Part numbers are matched case-insensitively ("3069b" == "3069B").
export function normNum(num) {
  return clean(num).toLowerCase();
}

// Accepts an array or a string of numbers separated by commas, slashes or spaces.
export function parseNums(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[\s,/]+/);
  return [...new Set(list.map(clean).filter(Boolean))];
}

export function slotId(unitId, row, col) {
  return `${unitId}:${row}:${col}`;
}

export function parseRows(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
  return list.map((n) => Number.parseInt(n, 10)).filter((n) => Number.isInteger(n) && n > 0 && n <= 30);
}

function normalizeUnit(input, existing = {}) {
  return {
    id: existing.id ?? input.id ?? newId('unit'),
    code: clean(input.code ?? existing.code).toUpperCase(),
    name: clean(input.name ?? existing.name),
    description: clean(input.description ?? existing.description),
    rows: parseRows(input.rows ?? existing.rows),
  };
}

function normalizeSlot(input, existing = {}) {
  const unitId = existing.unitId ?? input.unitId;
  const row = Number(existing.row ?? input.row);
  const col = Number(existing.col ?? input.col);
  return {
    id: slotId(unitId, row, col),
    unitId,
    row,
    col,
    label: clean(input.label ?? existing.label),
    partNums: parseNums(input.partNums ?? existing.partNums),
    needsLabel: Boolean(input.needsLabel ?? existing.needsLabel),
    // How many compartments the drawer is split into (1-8); each holds one kind of part.
    compartments: clampInt(input.compartments ?? existing.compartments ?? 1, 1, MAX_COMPARTMENTS),
    updatedAt: input.updatedAt ?? Date.now(),
  };
}

export const MAX_COMPARTMENTS = 8;

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

// A slot worth storing: anything that differs from an untouched drawer.
function slotHasData(s) {
  return s.partNums.length || s.label || s.needsLabel || s.compartments > 1;
}

function baLabelStatus(input, existing) {
  const relabeled = input.labelNum !== undefined && clean(input.labelNum) !== clean(existing.labelNum);
  const value = input.baLabel ?? (relabeled ? '' : existing.baLabel);
  return value === 'yes' || value === 'no' ? value : '';
}

function normalizePart(input, existing = {}) {
  const partNum = clean(existing.partNum ?? input.partNum);
  const name = clean(input.name ?? existing.name);
  return {
    partNum,
    altNums: parseNums(input.altNums ?? existing.altNums).filter((n) => normNum(n) !== normNum(partNum)),
    name,
    category: clean(input.category ?? existing.category) || guessCategory(name) || 'Other',
    imageUrl: clean(input.imageUrl ?? existing.imageUrl),
    // Number Brick Architect files the label under, when it isn't the part number.
    labelNum: clean(input.labelNum ?? existing.labelNum),
    // Whether Brick Architect has that label: 'yes', 'no' or '' (not known yet).
    // A new label number means it hasn't been checked.
    baLabel: baLabelStatus(input, existing),
    updatedAt: input.updatedAt ?? Date.now(),
  };
}

// Version 1 stored per-color part rows with quantities in flat "locations".
// Turn each old location into a one-column slot of an "Imported bins" unit.
function migrateV1(data) {
  const state = emptyState();
  const locations = data.locations ?? [];
  const unit = { id: 'unit_imported', code: 'Z', name: 'Imported bins', description: '', rows: locations.map(() => 1) };
  if (locations.length) state.units.push(unit);
  const rowOf = new Map(locations.map((l, i) => [l.id, i + 1]));

  for (const old of data.parts ?? []) {
    const partNum = clean(old.partNum) || clean(old.name);
    if (!partNum) continue;
    if (!state.parts.some((p) => normNum(p.partNum) === normNum(partNum))) {
      state.parts.push(normalizePart({ partNum, name: old.name, category: old.category, imageUrl: old.imageUrl }));
    }
    const row = rowOf.get(old.locationId);
    if (!row) continue;
    let slot = state.slots.find((s) => s.row === row);
    if (!slot) {
      slot = normalizeSlot({ unitId: unit.id, row, col: 1, label: locations[row - 1].name });
      state.slots.push(slot);
    }
    if (!slot.partNums.some((n) => normNum(n) === normNum(partNum))) slot.partNums.push(partNum);
  }
  state.settings = data.settings ?? {};
  return state;
}

export function validateImport(data) {
  if (!data || typeof data !== 'object') throw new Error('File is not a collection export.');
  if (data.version === 1 || (Array.isArray(data.locations) && !Array.isArray(data.units))) {
    if (!Array.isArray(data.parts)) throw new Error('Export is missing "parts".');
    return migrateV1(data);
  }
  if (!Array.isArray(data.units) || !Array.isArray(data.slots) || !Array.isArray(data.parts)) {
    throw new Error('Export is missing "units", "slots" or "parts".');
  }
  return {
    version: SCHEMA_VERSION,
    units: data.units.map((u) => normalizeUnit(u)),
    slots: data.slots.filter((s) => s.unitId).map((s) => normalizeSlot(s)),
    parts: data.parts.filter((p) => clean(p.partNum)).map((p) => normalizePart(p)),
    settings: typeof data.settings === 'object' && data.settings ? data.settings : {},
  };
}

export function slotCode(unit, row, col) {
  return `${unit.code}-${row}-${col}`;
}

export function createStore(backend = defaultBackend()) {
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = backend.getItem(STORAGE_KEY);
      return raw ? validateImport(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  function commit() {
    backend.setItem(STORAGE_KEY, JSON.stringify(state));
    listeners.forEach((fn) => fn(state));
  }

  function findPartIndex(num) {
    const n = normNum(num);
    return state.parts.findIndex((p) => normNum(p.partNum) === n || p.altNums.some((a) => normNum(a) === n));
  }

  function nextUnitCode() {
    const used = new Set(state.units.map((u) => u.code));
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXY') if (!used.has(c)) return c;
    return `U${state.units.length + 1}`;
  }

  function slotsOutside(unitId, rows) {
    return state.slots.filter(
      (s) => s.unitId === unitId && (s.partNums.length || s.label) && (s.row > rows.length || s.col > rows[s.row - 1]),
    );
  }

  const api = {
    get state() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // --- Storage units ---
    nextUnitCode,
    addUnit(input) {
      const unit = normalizeUnit({ ...input, code: clean(input.code) || nextUnitCode() });
      if (!unit.name) throw new Error('Give the storage unit a name.');
      if (!unit.rows.length) throw new Error('Enter how many drawers or compartments are in each row, e.g. 6, 6, 3.');
      if (state.units.some((u) => u.code === unit.code)) throw new Error(`Code "${unit.code}" is already used.`);
      state.units.push(unit);
      commit();
      return unit;
    },
    updateUnit(id, input) {
      const idx = state.units.findIndex((u) => u.id === id);
      if (idx < 0) throw new Error('Storage unit not found.');
      const unit = normalizeUnit(input, state.units[idx]);
      if (!unit.name) throw new Error('Give the storage unit a name.');
      if (!unit.code) throw new Error('Give the storage unit a code, e.g. A.');
      if (!unit.rows.length) throw new Error('Enter how many drawers or compartments are in each row.');
      if (state.units.some((u) => u.id !== id && u.code === unit.code)) throw new Error(`Code "${unit.code}" is already used.`);
      const lost = slotsOutside(id, unit.rows);
      if (lost.length) {
        const codes = lost.map((s) => slotCode(unit, s.row, s.col)).join(', ');
        throw new Error(`These slots would disappear but aren't empty: ${codes}. Move their parts first.`);
      }
      state.units[idx] = unit;
      state.slots = state.slots.filter((s) => s.unitId !== id || (s.row <= unit.rows.length && s.col <= unit.rows[s.row - 1]));
      commit();
      return unit;
    },
    removeUnit(id) {
      state.units = state.units.filter((u) => u.id !== id);
      // Parts stay in the catalog; they just lose these homes.
      state.slots = state.slots.filter((s) => s.unitId !== id);
      commit();
    },
    getUnit(id) {
      return state.units.find((u) => u.id === id) ?? null;
    },

    // --- Slots (drawers / compartments) ---
    getSlot(id) {
      const stored = state.slots.find((s) => s.id === id);
      if (stored) return stored;
      const [unitId, row, col] = String(id).split(':');
      const unit = api.getUnit(unitId);
      if (!unit || !(Number(row) <= unit.rows.length && Number(col) <= unit.rows[Number(row) - 1])) return null;
      return normalizeSlot({ unitId, row, col });
    },
    codeOf(slot) {
      const unit = api.getUnit(slot.unitId);
      return unit ? slotCode(unit, slot.row, slot.col) : '?';
    },
    // "A-7-1", "a 7 1" or "A7-1" -> slot.
    findSlotByCode(code) {
      const m = clean(code).toUpperCase().match(/^([A-Z]+)[\s-]*(\d+)[\s-]+(\d+)$/);
      if (!m) return null;
      const unit = state.units.find((u) => u.code === m[1]);
      return unit ? api.getSlot(slotId(unit.id, Number(m[2]), Number(m[3]))) : null;
    },
    updateSlot(id, patch) {
      const current = api.getSlot(id);
      if (!current) throw new Error('Slot not found.');
      const slot = normalizeSlot({ ...patch, updatedAt: Date.now() }, current);
      state.slots = state.slots.filter((s) => s.id !== id);
      if (slotHasData(slot)) state.slots.push(slot);
      commit();
      return slot;
    },
    // Put parts in a slot, creating catalog entries for new numbers.
    // Returns the catalog parts that were added.
    addPartsToSlot(id, nums) {
      const slot = api.getSlot(id);
      if (!slot) throw new Error('Slot not found.');
      const added = [];
      for (const num of parseNums(nums)) {
        const part = api.ensurePart(num, { silent: true });
        if (!slot.partNums.some((n) => normNum(n) === normNum(part.partNum))) {
          slot.partNums = [...slot.partNums, part.partNum];
          added.push(part);
        }
      }
      if (!added.length) return [];
      api.updateSlot(id, { partNums: slot.partNums, needsLabel: true });
      return added;
    },
    removePartFromSlot(id, partNum) {
      const slot = api.getSlot(id);
      if (!slot) return;
      api.updateSlot(id, { partNums: slot.partNums.filter((n) => normNum(n) !== normNum(partNum)) });
    },
    movePart(partNum, fromId, toId) {
      api.removePartFromSlot(fromId, partNum);
      api.addPartsToSlot(toId, [partNum]);
    },
    // Put every slot entry of these part numbers in one slot (and take them out of the others).
    gatherParts(partNums, toId) {
      const nums = new Set(partNums.flatMap((n) => {
        const part = api.getPart(n);
        return [n, ...(part ? [part.partNum, ...part.altNums] : [])];
      }).map(normNum));
      const moving = [];
      for (const slot of state.slots) {
        if (slot.id === toId) continue;
        const mine = slot.partNums.filter((n) => nums.has(normNum(n)));
        if (!mine.length) continue;
        moving.push(...mine);
        api.updateSlot(slot.id, { partNums: slot.partNums.filter((n) => !nums.has(normNum(n))) });
      }
      api.addPartsToSlot(toId, [...new Set(moving)]);
    },
    slotsForPart(partNum) {
      const part = api.getPart(partNum);
      const nums = new Set([partNum, ...(part ? [part.partNum, ...part.altNums] : [])].map(normNum));
      return state.slots.filter((s) => s.partNums.some((n) => nums.has(normNum(n))));
    },

    // --- Part catalog ---
    getPart(num) {
      const idx = findPartIndex(num);
      return idx < 0 ? null : state.parts[idx];
    },
    // Find a part by number or alternate number, or add it, using the
    // built-in catalog to fill in its name.
    ensurePart(num, { silent = false } = {}) {
      const existing = api.getPart(num);
      if (existing) return existing;
      const known = lookupCatalog(num);
      const part = normalizePart(known ? { ...known } : { partNum: clean(num) });
      if (!part.partNum) throw new Error('Enter a part number.');
      state.parts.push(part);
      if (!silent) commit();
      return part;
    },
    savePart(partNum, input) {
      const idx = findPartIndex(partNum);
      if (idx < 0) {
        const part = normalizePart({ ...input, partNum });
        if (!part.partNum) throw new Error('Enter a part number.');
        state.parts.push(part);
        commit();
        return part;
      }
      state.parts[idx] = normalizePart({ ...input, updatedAt: Date.now() }, state.parts[idx]);
      commit();
      return state.parts[idx];
    },
    // Fill in details found online (or from a photo match) without overwriting
    // anything the family already entered. Adds the part to the catalog if needed.
    fillPartDetails(num, { name = '', imageUrl = '' } = {}) {
      const part = api.ensurePart(num, { silent: true });
      const changes = {};
      if (!part.name && clean(name)) changes.name = clean(name);
      if (!part.imageUrl && clean(imageUrl)) changes.imageUrl = clean(imageUrl);
      if (changes.name) changes.category = guessCategory(changes.name) || part.category;
      Object.assign(part, changes, Object.keys(changes).length ? { updatedAt: Date.now() } : {});
      commit();
      return part;
    },
    // Record whether Brick Architect has this part's label ('yes', 'no' or '').
    setBaLabel(num, value) {
      const part = api.getPart(num);
      if (!part || part.baLabel === value) return part;
      Object.assign(part, normalizePart({ baLabel: value, updatedAt: Date.now() }, part));
      commit();
      return part;
    },
    // One part listed twice: keep the first, with the other's numbers as alternates.
    // Slots keep their entries, which now find the kept part.
    mergeParts(keepNum, dropNum) {
      const keep = state.parts.find((p) => normNum(p.partNum) === normNum(keepNum));
      const drop = state.parts.find((p) => normNum(p.partNum) === normNum(dropNum));
      if (!keep || !drop || keep === drop) return keep;
      const altNums = [...keep.altNums, drop.partNum, ...drop.altNums];
      state.parts = state.parts.filter((p) => p !== drop);
      Object.assign(keep, normalizePart({
        altNums,
        name: keep.name || drop.name,
        imageUrl: keep.imageUrl || drop.imageUrl,
        updatedAt: Date.now(),
      }, keep));
      commit();
      return keep;
    },
    removePart(partNum) {
      const part = api.getPart(partNum);
      if (!part) return;
      const nums = new Set([part.partNum, ...part.altNums].map(normNum));
      state.parts = state.parts.filter((p) => p !== part);
      state.slots = state.slots
        .map((s) => ({ ...s, partNums: s.partNums.filter((n) => !nums.has(normNum(n))) }))
        .filter(slotHasData);
      commit();
    },
    partsWithoutSlot() {
      const homed = new Set(state.slots.flatMap((s) => s.partNums).map(normNum));
      return state.parts.filter((p) => ![p.partNum, ...p.altNums].some((n) => homed.has(normNum(n))));
    },

    /**
     * Save a storage unit read from a photo, after review.
     * @param unitInput { name, code, description }
     * @param cells rows top to bottom, each a list of drawers left to right,
     *   each drawer a list of { partNum, altNums, name }
     * @param labeled true if the drawers already carry printed labels
     */
    addScannedUnit(unitInput, cells, { labeled = true } = {}) {
      const unit = api.addUnit({ ...unitInput, rows: cells.map((row) => row.length) });
      cells.forEach((row, r) =>
        row.forEach((parts, c) => {
          const id = slotId(unit.id, r + 1, c + 1);
          for (const p of parts) {
            if (!clean(p.partNum)) continue;
            const part = api.ensurePart(p.partNum, { silent: true });
            // Names and alternates read from the label fill gaps; never overwrite what the family typed.
            if (!part.name && clean(p.name)) {
              part.name = clean(p.name);
              part.category = guessCategory(part.name) || part.category;
            }
            part.altNums = parseNums([...part.altNums, ...(p.altNums ?? [])]).filter(
              (n) => normNum(n) !== normNum(part.partNum),
            );
            part.updatedAt = Date.now();
          }
          const nums = parts.map((p) => api.getPart(p.partNum)?.partNum).filter(Boolean);
          if (nums.length) state.slots.push(normalizeSlot({ unitId: unit.id, row: r + 1, col: c + 1, partNums: nums, needsLabel: !labeled }));
        }),
      );
      commit();
      return unit;
    },

    // --- Settings ---
    updateSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      commit();
    },

    // --- Import / export (share between family devices) ---
    exportJSON() {
      // API keys are personal; don't hand them around in shared files.
      const shareable = Object.fromEntries(Object.entries(state.settings).filter(([k]) => !PRIVATE_SETTINGS.includes(k)));
      return JSON.stringify({ ...state, settings: shareable, exportedAt: new Date().toISOString() }, null, 2);
    },
    importJSON(text, { merge = false } = {}) {
      const incoming = validateImport(JSON.parse(text));
      if (!merge) {
        state = { ...incoming, settings: { ...incoming.settings, ...pickPrivate(state.settings) } };
      } else {
        // Units: add new ones. Slots and parts: add new ones, take newer edits.
        incoming.units.forEach((u) => {
          if (state.units.some((mine) => mine.id === u.id)) return;
          // Two different units can't share a code, or slot codes would be ambiguous.
          state.units.push(state.units.some((mine) => mine.code === u.code) ? { ...u, code: nextUnitCode() } : u);
        });
        const mergeBy = (mine, theirs, key) => {
          const byKey = new Map(mine.map((x) => [key(x), x]));
          theirs.forEach((x) => {
            const current = byKey.get(key(x));
            if (!current) mine.push(x);
            else if (x.updatedAt > current.updatedAt) Object.assign(current, x);
          });
        };
        mergeBy(state.slots, incoming.slots, (s) => s.id);
        mergeBy(state.parts, incoming.parts, (p) => normNum(p.partNum));
      }
      commit();
    },
    // Replace the catalog with the family's shared copy (settings stay local).
    replaceData({ units = [], slots = [], parts = [] }) {
      state = { ...validateImport({ version: SCHEMA_VERSION, units, slots, parts }), settings: state.settings };
      // The database returns items in ID order; show storage units in letter order.
      state.units.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      commit();
    },
    reset() {
      state = { ...emptyState(), settings: pickPrivate(state.settings) };
      commit();
    },
  };
  return api;
}

// Per-device settings: never exported, kept through a replace import.
const PRIVATE_SETTINGS = ['rebrickableKey', 'anthropicKey', 'syncLinked'];

function pickPrivate(settings) {
  return Object.fromEntries(PRIVATE_SETTINGS.filter((k) => settings[k]).map((k) => [k, settings[k]]));
}
