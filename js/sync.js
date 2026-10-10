// Family sharing: keeps this phone's catalog and the family's shared copy in step.
//
// The shared copy is three collections of documents (units, slots, parts),
// one document per item, so two people editing different drawers never clash.
// When both edit the same item, the last save wins.
//
// This module doesn't know about Firebase; it talks to a `backend`:
//   fetchAll()                       -> Promise<{ units, slots, parts }> (from the server)
//   subscribe(onData, onError)       -> unsubscribe; onData(collection, docs) on every change
//   write({ upserts, deletes })      -> Promise; upserts [{ col, id, data }], deletes [{ col, id }]

import { normNum } from './store.js';

export const COLLECTIONS = ['units', 'slots', 'parts'];

const KEY_OF = {
  units: (u) => u.id,
  slots: (s) => s.id,
  parts: (p) => normNum(p.partNum),
};

// JSON with object keys sorted, so the same item always compares equal
// whatever order the database returns its fields in.
export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJSON(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Every item in a catalog as `col/id` -> JSON, for cheap comparison. */
export function docsOf(data) {
  const map = new Map();
  for (const col of COLLECTIONS) {
    for (const item of data[col] ?? []) map.set(`${col}/${KEY_OF[col](item)}`, stableJSON(item));
  }
  return map;
}

/** What has to be written so `prev` becomes `next`. */
export function diffDocs(prev, next) {
  const upserts = [];
  const deletes = [];
  for (const [key, json] of next) {
    if (prev.get(key) !== json) {
      const [col, id] = splitKey(key);
      upserts.push({ col, id, data: JSON.parse(json) });
    }
  }
  for (const key of prev.keys()) {
    if (!next.has(key)) {
      const [col, id] = splitKey(key);
      deletes.push({ col, id });
    }
  }
  return { upserts, deletes };
}

function splitKey(key) {
  const i = key.indexOf('/');
  return [key.slice(0, i), key.slice(i + 1)];
}

function isEmpty(data) {
  return COLLECTIONS.every((col) => !(data[col] ?? []).length);
}

function catalogOf(state) {
  return { units: state.units, slots: state.slots, parts: state.parts };
}

/**
 * @param store the app's store
 * @param backend see top of file
 * @param onStatus called with { state: 'synced' | 'saving' | 'error', error? }
 * @param onRemoteChange called when another phone's edit changed this phone's catalog
 */
export function createSync(store, backend, { onStatus = () => {}, onRemoteChange = () => {} } = {}) {
  let known = new Map(); // what the shared copy holds, as far as this phone knows
  let applyingRemote = false;
  let pending = 0;
  let stopRemote = null;
  let stopLocal = null;

  function report(error) {
    if (error) onStatus({ state: 'error', error });
    else onStatus({ state: pending ? 'saving' : 'synced' });
  }

  async function push(changes) {
    if (!changes.upserts.length && !changes.deletes.length) return;
    pending += 1;
    report();
    try {
      await backend.write(changes);
      pending -= 1;
      report();
    } catch (error) {
      pending -= 1;
      report(error);
    }
  }

  // Local edit -> write just the changed documents.
  function onLocalChange(state) {
    if (applyingRemote) return;
    const next = docsOf(catalogOf(state));
    const changes = diffDocs(known, next);
    known = next;
    push(changes);
  }

  // Replace this phone's catalog without echoing it back to the shared copy.
  function applyRemote(data) {
    applyingRemote = true;
    try {
      store.replaceData(data);
    } finally {
      applyingRemote = false;
    }
  }

  // Someone (maybe this phone) changed the shared copy -> show it here.
  function onRemoteData(col, docs) {
    const before = docsOf({ [col]: store.state[col] });
    applyRemote({ ...catalogOf(store.state), [col]: docs });
    const after = docsOf({ [col]: store.state[col] });
    const changed = before.size !== after.size || [...after].some(([key, json]) => before.get(key) !== json);
    // Record the shared copy as this phone stores it (normalized), so only real edits get written.
    const prefix = `${col}/`;
    for (const key of [...known.keys()]) if (key.startsWith(prefix)) known.delete(key);
    for (const [key, json] of docsOf({ [col]: store.state[col] })) known.set(key, json);
    report();
    // The echo of this phone's own save changes nothing; only real news from elsewhere redraws the screen.
    if (changed) onRemoteChange(col);
  }

  function listen() {
    stopLocal = store.subscribe(onLocalChange);
    stopRemote = backend.subscribe(onRemoteData, (error) => report(error));
    report();
  }

  return {
    /** First time on this phone: how do the two catalogs compare? */
    async inspect() {
      const remote = await backend.fetchAll();
      return {
        remote,
        remoteEmpty: isEmpty(remote),
        localEmpty: isEmpty(catalogOf(store.state)),
      };
    },

    /**
     * Link this phone to the shared copy.
     * @param mode 'combine' adds this phone's catalog to the shared one;
     *             'shared' replaces this phone's catalog with the shared one.
     */
    async link(mode, remote) {
      remote ??= await backend.fetchAll();
      const local = catalogOf(store.state);
      applyRemote(remote);
      known = docsOf(catalogOf(store.state));
      if (mode === 'combine') {
        // Same rules as importing a file with Merge: newer edits win, clashing unit letters get a free one.
        applyingRemote = true;
        try {
          store.importJSON(JSON.stringify({ version: 2, ...local }), { merge: true });
        } finally {
          applyingRemote = false;
        }
        const next = docsOf(catalogOf(store.state));
        const changes = diffDocs(known, next);
        known = next;
        await push(changes);
      }
      store.updateSettings({ syncLinked: true });
      listen();
    },

    /** Later launches: this phone's saved copy is where it left off; catch up and keep listening. */
    resume() {
      known = docsOf(catalogOf(store.state));
      listen();
    },

    stop() {
      stopLocal?.();
      stopRemote?.();
      stopLocal = stopRemote = null;
    },

    get pending() {
      return pending;
    },
  };
}
