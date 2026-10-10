// Collection data model + persistence.
//
// Shape:
//   { version, locations: [{ id, name, description }],
//     parts: [{ id, partNum, name, category, colorId, quantity, locationId,
//               notes, imageUrl, updatedAt }],
//     settings: { rebrickableKey } }
//
// The store is storage-agnostic so it can run in the browser (localStorage)
// and in Node tests (in-memory backend).

export const STORAGE_KEY = 'lego-organizer:v1';
export const SCHEMA_VERSION = 1;

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
  return { version: SCHEMA_VERSION, locations: [], parts: [], settings: {} };
}

let idCounter = 0;
export function newId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function clean(str) {
  return String(str ?? '').trim();
}

function normalizePart(input, existing = {}) {
  const qty = Number.parseInt(input.quantity ?? existing.quantity ?? 1, 10);
  return {
    id: existing.id ?? input.id ?? newId('part'),
    partNum: clean(input.partNum ?? existing.partNum),
    name: clean(input.name ?? existing.name),
    category: clean(input.category ?? existing.category) || 'Other',
    colorId: Number(input.colorId ?? existing.colorId ?? -1),
    quantity: Number.isFinite(qty) && qty >= 0 ? qty : 0,
    locationId: (input.locationId ?? existing.locationId) || null,
    notes: clean(input.notes ?? existing.notes),
    imageUrl: clean(input.imageUrl ?? existing.imageUrl),
    updatedAt: Date.now(),
  };
}

// Accepts an array or a separated string, e.g. "3001, 3003".
function cleanList(value, separator = /,/) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(separator);
  return [...new Set(list.map(clean).filter(Boolean))];
}

function normalizeLocation(input, existing = {}) {
  return {
    id: existing.id ?? input.id ?? newId('loc'),
    name: clean(input.name ?? existing.name),
    description: clean(input.description ?? existing.description),
    // Sorting rules: what belongs in this bin.
    categories: cleanList(input.categories ?? existing.categories),
    partNums: cleanList(input.partNums ?? existing.partNums, /[\s,]+/),
    colorIds: cleanList(input.colorIds ?? existing.colorIds).map(Number).filter(Number.isFinite),
  };
}

export function validateImport(data) {
  if (!data || typeof data !== 'object') throw new Error('File is not a collection export.');
  if (!Array.isArray(data.parts) || !Array.isArray(data.locations)) {
    throw new Error('Export is missing "parts" or "locations".');
  }
  return {
    version: SCHEMA_VERSION,
    locations: data.locations.map((l) => normalizeLocation(l)),
    parts: data.parts.map((p) => ({ ...normalizePart(p), updatedAt: p.updatedAt ?? Date.now() })),
    settings: typeof data.settings === 'object' && data.settings ? data.settings : {},
  };
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

  return {
    get state() {
      return state;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // --- Locations (bins, drawers, boxes) ---
    addLocation(input) {
      const loc = normalizeLocation(input);
      if (!loc.name) throw new Error('Bin name is required.');
      state.locations.push(loc);
      commit();
      return loc;
    },
    updateLocation(id, input) {
      const idx = state.locations.findIndex((l) => l.id === id);
      if (idx < 0) throw new Error('Bin not found.');
      state.locations[idx] = normalizeLocation(input, state.locations[idx]);
      commit();
      return state.locations[idx];
    },
    removeLocation(id) {
      state.locations = state.locations.filter((l) => l.id !== id);
      // Parts stay in the collection but become "unsorted".
      state.parts.forEach((p) => {
        if (p.locationId === id) p.locationId = null;
      });
      commit();
    },
    getLocation(id) {
      return state.locations.find((l) => l.id === id) ?? null;
    },

    // --- Parts ---
    // Adding a part that already exists with the same number, color and bin
    // just increases the count instead of creating a duplicate row.
    addPart(input) {
      const part = normalizePart(input);
      if (!part.partNum && !part.name) throw new Error('Enter a part number or a name.');
      const dup = state.parts.find(
        (p) =>
          p.partNum &&
          p.partNum.toLowerCase() === part.partNum.toLowerCase() &&
          p.colorId === part.colorId &&
          p.locationId === part.locationId,
      );
      if (dup) {
        dup.quantity += part.quantity;
        dup.updatedAt = Date.now();
        commit();
        return dup;
      }
      state.parts.push(part);
      commit();
      return part;
    },
    updatePart(id, input) {
      const idx = state.parts.findIndex((p) => p.id === id);
      if (idx < 0) throw new Error('Part not found.');
      state.parts[idx] = normalizePart(input, state.parts[idx]);
      commit();
      return state.parts[idx];
    },
    adjustQuantity(id, delta) {
      const part = state.parts.find((p) => p.id === id);
      if (!part) return null;
      part.quantity = Math.max(0, part.quantity + delta);
      part.updatedAt = Date.now();
      commit();
      return part;
    },
    removePart(id) {
      state.parts = state.parts.filter((p) => p.id !== id);
      commit();
    },
    findByPartNum(partNum) {
      const needle = clean(partNum).toLowerCase();
      if (!needle) return [];
      return state.parts.filter((p) => p.partNum.toLowerCase() === needle);
    },

    // --- Settings ---
    updateSettings(patch) {
      state.settings = { ...state.settings, ...patch };
      commit();
    },

    // --- Import / export (share between family devices) ---
    exportJSON() {
      // API keys are personal; don't hand them around in shared files.
      const { rebrickableKey, ...shareable } = state.settings;
      return JSON.stringify({ ...state, settings: shareable, exportedAt: new Date().toISOString() }, null, 2);
    },
    importJSON(text, { merge = false } = {}) {
      const incoming = validateImport(JSON.parse(text));
      if (!merge) {
        state = { ...incoming, settings: { ...incoming.settings, ...pickPrivate(state.settings) } };
      } else {
        const locIds = new Set(state.locations.map((l) => l.id));
        incoming.locations.forEach((l) => {
          if (!locIds.has(l.id)) state.locations.push(l);
        });
        const partsById = new Map(state.parts.map((p) => [p.id, p]));
        incoming.parts.forEach((p) => {
          const mine = partsById.get(p.id);
          if (!mine) state.parts.push(p);
          else if (p.updatedAt > mine.updatedAt) Object.assign(mine, p);
        });
      }
      commit();
    },
    reset() {
      state = { ...emptyState(), settings: pickPrivate(state.settings) };
      commit();
    },
  };
}

function pickPrivate(settings) {
  return settings.rebrickableKey ? { rebrickableKey: settings.rebrickableKey } : {};
}
