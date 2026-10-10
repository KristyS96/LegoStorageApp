import { createStore } from './store.js';
import { searchParts } from './search.js';
import { identifyFromPhoto, lookupPart } from './identify.js';
import { COLORS, getColor } from './data/colors.js';
import { CATEGORIES } from './data/categories.js';
import { SAMPLE } from './data/sample.js';

const store = createStore();
const view = document.getElementById('view');

// ---------- helpers ----------

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

function parseRoute() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = 'find', id] = path.split('/');
  return { name: name || 'find', id, params: new URLSearchParams(qs) };
}

function go(hash) {
  location.hash = hash;
}

function binName(locationId) {
  return store.getLocation(locationId)?.name ?? null;
}

function binBadge(locationId) {
  const name = binName(locationId);
  return name
    ? `<span class="bin-badge">📦 ${esc(name)}</span>`
    : '<span class="bin-badge unsorted">Unsorted</span>';
}

function swatch(colorId) {
  const c = getColor(colorId);
  return `<span><span class="swatch" style="background:${c.hex}"></span>${esc(c.name)}</span>`;
}

function thumb(url) {
  return url
    ? `<img class="thumb" src="${esc(url)}" alt="" loading="lazy" />`
    : '<div class="thumb" aria-hidden="true">🧱</div>';
}

function colorOptions(selected, { any = false } = {}) {
  const head = any ? `<option value="">All colors</option>` : '';
  return (
    head +
    COLORS.map((c) => `<option value="${c.id}" ${String(selected) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
  );
}

function binOptions(selected, { any = false } = {}) {
  const head = any
    ? `<option value="">All bins</option><option value="unsorted" ${selected === 'unsorted' ? 'selected' : ''}>Unsorted</option>`
    : `<option value="">— Unsorted —</option>`;
  return (
    head +
    store.state.locations
      .map((l) => `<option value="${esc(l.id)}" ${selected === l.id ? 'selected' : ''}>${esc(l.name)}</option>`)
      .join('')
  );
}

function updateSummary() {
  const { parts, locations } = store.state;
  const pieces = parts.reduce((n, p) => n + p.quantity, 0);
  document.getElementById('summary').textContent =
    `${pieces.toLocaleString()} pcs · ${parts.length} kinds · ${locations.length} bins`;
}

function partRow(p) {
  return `
    <li class="part" data-id="${esc(p.id)}">
      ${thumb(p.imageUrl)}
      <div>
        <div class="part-title">${esc(p.name || 'Unnamed part')}</div>
        <div class="part-meta">
          ${p.partNum ? `<span>#${esc(p.partNum)}</span>` : ''}
          ${swatch(p.colorId)}
          ${binBadge(p.locationId)}
        </div>
      </div>
      <div class="qty">
        <button class="small" data-act="dec" aria-label="Remove one">−</button>
        <strong>${p.quantity}</strong>
        <button class="small" data-act="inc" aria-label="Add one">+</button>
      </div>
    </li>`;
}

// Shared click handling for any rendered part list.
function wirePartList(listEl) {
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('.part');
    if (!li) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'inc' || act === 'dec') {
      const part = store.adjustQuantity(li.dataset.id, act === 'inc' ? 1 : -1);
      if (part) li.querySelector('.qty strong').textContent = part.quantity;
      return;
    }
    go(`#/edit/${li.dataset.id}`);
  });
}

// ---------- views ----------

function renderFind({ params }) {
  const state = {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    colorId: params.get('color') ?? '',
    locationId: params.get('bin') ?? '',
  };

  view.innerHTML = `
    <input id="q" class="search-big" type="search" placeholder="Search: 3001, red 2x4, wheel, bin A…"
      value="${esc(state.q)}" autocomplete="off" aria-label="Search parts" />
    <div class="chips" id="cats">
      <button class="chip ${state.category ? '' : 'active'}" data-cat="">All</button>
      ${CATEGORIES.map((c) => `<button class="chip ${state.category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <div class="row">
      <select id="color" aria-label="Filter by color">${colorOptions(state.colorId, { any: true })}</select>
      <select id="bin" aria-label="Filter by bin">${binOptions(state.locationId, { any: true })}</select>
    </div>
    <p class="muted" id="count"></p>
    <div class="card" style="padding:0"><ul class="part-list" id="results"></ul></div>
  `;

  const results = view.querySelector('#results');
  wirePartList(results);

  function refresh() {
    const found = searchParts(store.state.parts, store.state.locations, state.q, {
      category: state.category,
      colorId: state.colorId,
      locationId: state.locationId,
    });
    view.querySelector('#count').textContent = store.state.parts.length
      ? `${found.length} match${found.length === 1 ? '' : 'es'}`
      : '';
    results.innerHTML = found.length
      ? found.slice(0, 300).map(partRow).join('')
      : `<li class="empty">${
          store.state.parts.length
            ? 'No parts match. Try fewer words, or <a href="#/identify">identify it from a photo</a>.'
            : 'Your collection is empty. <a href="#/add">Add a part</a>, or load sample data in <a href="#/settings">Settings</a>.'
        }</li>`;
    // Keep filters in the URL so a search can be bookmarked or shared.
    const qs = new URLSearchParams();
    if (state.q) qs.set('q', state.q);
    if (state.category) qs.set('category', state.category);
    if (state.colorId) qs.set('color', state.colorId);
    if (state.locationId) qs.set('bin', state.locationId);
    history.replaceState(null, '', `#/find${qs.toString() ? `?${qs}` : ''}`);
  }

  view.querySelector('#q').addEventListener('input', (e) => {
    state.q = e.target.value;
    refresh();
  });
  view.querySelector('#cats').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    state.category = chip.dataset.cat;
    view.querySelectorAll('#cats .chip').forEach((c) => c.classList.toggle('active', c === chip));
    refresh();
  });
  view.querySelector('#color').addEventListener('change', (e) => {
    state.colorId = e.target.value;
    refresh();
  });
  view.querySelector('#bin').addEventListener('change', (e) => {
    state.locationId = e.target.value;
    refresh();
  });

  refresh();
  if (!state.q && matchMedia('(pointer: fine)').matches) view.querySelector('#q').focus();
}

function resultCard(r) {
  const owned = store.findByPartNum(r.partNum);
  const ownedHtml = owned.length
    ? `<div class="owned">✅ You have this:<br>${owned
        .map((p) => `${p.quantity} × ${swatch(p.colorId)} in ${binBadge(p.locationId)}`)
        .join('<br>')}</div>`
    : '<div class="owned muted">Not in your collection yet.</div>';
  const addQs = new URLSearchParams({ partNum: r.partNum, name: r.name, img: r.imageUrl });
  return `
    <div class="result">
      ${thumb(r.imageUrl)}
      <div>
        <div class="part-title">${esc(r.name)}</div>
        <div class="part-meta">
          <span>#${esc(r.partNum)}</span>
          ${r.score != null ? `<span>${Math.round(r.score * 100)}% match</span>` : ''}
        </div>
        ${ownedHtml}
        <div class="actions">
          <a class="btn" href="#/add?${esc(addQs.toString())}">➕ Add to collection</a>
          ${owned.length ? `<a class="btn" href="#/find?q=${encodeURIComponent(r.partNum)}">🔍 Show</a>` : ''}
        </div>
      </div>
    </div>`;
}

function renderIdentify() {
  view.innerHTML = `
    <h2>What part is this?</h2>
    <div class="card">
      <label class="photo-drop" for="photo">
        <span>📷</span>
        <strong>Take or choose a photo of one part</strong>
        <small class="muted">Plain background, good light, one part at a time works best.</small>
        <input id="photo" type="file" accept="image/*" capture="environment" />
      </label>
      <div id="preview"></div>
    </div>
    <div class="card">
      <label for="lookup">Or look it up by number or name</label>
      <form id="lookup-form" class="row">
        <input id="lookup" type="search" placeholder="e.g. 3001 or brick 2 x 4" />
        <button class="primary" style="flex:0 0 auto">Look up</button>
      </form>
      <p class="muted">Tip: part numbers are molded in tiny print on most parts (often under or inside).</p>
    </div>
    <div id="id-results"></div>
  `;

  const out = view.querySelector('#id-results');
  const showResults = (items, source) => {
    out.innerHTML = items.length
      ? `<div class="card"><h3 style="margin-top:0">Best guesses <small class="muted">via ${source}</small></h3>${items
          .slice(0, 6)
          .map(resultCard)
          .join('')}</div>`
      : '<div class="card empty">No matches found. Try another angle or lighting.</div>';
  };
  const showError = (err) => {
    out.innerHTML = `<div class="card empty">⚠️ ${esc(err.message)}</div>`;
  };

  view.querySelector('#photo').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    view.querySelector('#preview').innerHTML = `<img class="preview" src="${URL.createObjectURL(file)}" alt="Your photo" />`;
    out.innerHTML = '<div class="card empty">🔎 Identifying…</div>';
    try {
      showResults(await identifyFromPhoto(file), 'Brickognize');
    } catch (err) {
      showError(err);
    }
  });

  view.querySelector('#lookup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = view.querySelector('#lookup').value.trim();
    if (!q) return;
    // Always check the family's own collection first: it's instant and works offline.
    const local = searchParts(store.state.parts, store.state.locations, q);
    out.innerHTML = '<div class="card empty">🔎 Looking up…</div>';
    try {
      showResults(await lookupPart(q, store.state.settings.rebrickableKey), 'Rebrickable');
    } catch (err) {
      if (local.length) {
        out.innerHTML = `<div class="card"><p class="muted">${esc(err.message)}</p><h3>In your collection</h3>
          <ul class="part-list" id="local">${local.slice(0, 20).map(partRow).join('')}</ul></div>`;
        wirePartList(out.querySelector('#local'));
      } else {
        showError(err);
      }
    }
  });
}

function renderPartForm({ id, params }) {
  const existing = id ? store.state.parts.find((p) => p.id === id) : null;
  if (id && !existing) {
    view.innerHTML = '<div class="card empty">That part no longer exists. <a href="#/find">Back to search</a></div>';
    return;
  }
  const p = existing ?? {
    partNum: params.get('partNum') ?? '',
    name: params.get('name') ?? '',
    imageUrl: params.get('img') ?? '',
    category: params.get('category') ?? '',
    colorId: Number(params.get('color') ?? store.state.settings.lastColorId ?? -1),
    quantity: 1,
    locationId: params.get('bin') ?? store.state.settings.lastLocationId ?? '',
    notes: '',
  };

  view.innerHTML = `
    <h2>${existing ? 'Edit part' : 'Add a part'}</h2>
    <form id="part-form" class="card">
      <div class="row" style="align-items:flex-start">
        <div style="flex:0 0 auto">${thumb(p.imageUrl)}</div>
        <div>
          <label for="partNum" style="margin-top:0">Part number</label>
          <input id="partNum" name="partNum" value="${esc(p.partNum)}" placeholder="e.g. 3001" inputmode="text" />
        </div>
      </div>
      <label for="name">Name / description</label>
      <input id="name" name="name" value="${esc(p.name)}" placeholder="e.g. Brick 2 x 4" />
      <div class="grid2">
        <div>
          <label for="colorId">Color</label>
          <select id="colorId" name="colorId">${colorOptions(p.colorId)}</select>
        </div>
        <div>
          <label for="category">Category</label>
          <select id="category" name="category">
            ${CATEGORIES.map((c) => `<option ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="locationId">Bin / location</label>
          <select id="locationId" name="locationId">${binOptions(p.locationId)}</select>
        </div>
        <div>
          <label for="quantity">Quantity</label>
          <input id="quantity" name="quantity" type="number" min="0" value="${p.quantity}" inputmode="numeric" />
        </div>
      </div>
      <label for="notes">Notes</label>
      <textarea id="notes" name="notes" placeholder="e.g. from the fire station set">${esc(p.notes)}</textarea>
      <input type="hidden" name="imageUrl" value="${esc(p.imageUrl)}" />
      <div class="actions">
        <button class="primary" type="submit">${existing ? 'Save' : 'Add part'}</button>
        ${existing ? '<button type="button" class="danger" id="delete">Delete</button>' : ''}
        <a class="btn" href="#/find">Cancel</a>
      </div>
      ${store.state.locations.length ? '' : '<p class="muted">Tip: create bins in the <a href="#/bins">Bins</a> tab so you know where things live.</p>'}
    </form>
  `;

  const form = view.querySelector('#part-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try {
      if (existing) {
        store.updatePart(existing.id, data);
        toast('Saved');
        history.back();
      } else {
        const part = store.addPart(data);
        // Remember choices: when sorting a pile you often add many parts to one bin.
        store.updateSettings({ lastColorId: part.colorId, lastLocationId: part.locationId });
        toast(`Added ${part.name || part.partNum} → ${binName(part.locationId) ?? 'Unsorted'}`);
        renderPartForm({ params: new URLSearchParams() });
        view.querySelector('#partNum').focus();
      }
    } catch (err) {
      toast(err.message);
    }
  });

  view.querySelector('#delete')?.addEventListener('click', () => {
    if (!confirm('Delete this part from the collection?')) return;
    store.removePart(existing.id);
    toast('Deleted');
    go('#/find');
  });
}

function renderBins() {
  const { locations, parts } = store.state;
  const stats = new Map();
  parts.forEach((p) => {
    const key = p.locationId ?? 'unsorted';
    const s = stats.get(key) ?? { kinds: 0, pcs: 0 };
    s.kinds += 1;
    s.pcs += p.quantity;
    stats.set(key, s);
  });
  const unsorted = stats.get('unsorted');

  view.innerHTML = `
    <div class="no-print">
      <h2>Bins & storage</h2>
      <form id="bin-form" class="card">
        <div class="row">
          <input name="name" placeholder="Bin name, e.g. A1 or Red drawer" required />
          <input name="description" placeholder="Where is it? (optional)" />
          <button class="primary" style="flex:0 0 auto">Add bin</button>
        </div>
      </form>
      ${
        locations.length
          ? locations
              .map((l) => {
                const s = stats.get(l.id) ?? { kinds: 0, pcs: 0 };
                return `<div class="card bin-card" data-id="${esc(l.id)}">
                  <div>
                    <div class="name">📦 ${esc(l.name)}</div>
                    <div class="muted">${esc(l.description) || '&nbsp;'}</div>
                    <div class="muted">${s.pcs} pcs · ${s.kinds} kinds</div>
                  </div>
                  <div class="row" style="flex:0 0 auto">
                    <a class="btn" href="#/find?bin=${encodeURIComponent(l.id)}">Open</a>
                    <a class="btn" href="#/add?bin=${encodeURIComponent(l.id)}">➕</a>
                    <button data-act="rename" aria-label="Rename">✏️</button>
                    <button data-act="delete" class="danger" aria-label="Delete">🗑️</button>
                  </div>
                </div>`;
              })
              .join('')
          : '<div class="card empty">No bins yet. Add your first one above — a drawer, box, bag or shelf.</div>'
      }
      ${
        unsorted
          ? `<div class="card bin-card"><div><div class="name">Unsorted</div><div class="muted">${unsorted.pcs} pcs · ${unsorted.kinds} kinds</div></div>
             <a class="btn" href="#/find?bin=unsorted">Open</a></div>`
          : ''
      }
      ${locations.length ? '<div class="actions"><button id="print">🖨️ Print bin labels</button></div>' : ''}
    </div>
    <div class="labels">
      ${locations
        .map((l) => {
          const cats = [...new Set(parts.filter((p) => p.locationId === l.id).map((p) => p.category))];
          return `<div class="label"><h4>${esc(l.name)}</h4><p>${esc(cats.join(' · ') || l.description)}</p></div>`;
        })
        .join('')}
    </div>
  `;

  view.querySelector('#bin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      store.addLocation(Object.fromEntries(new FormData(e.target)));
      renderBins();
      toast('Bin added');
    } catch (err) {
      toast(err.message);
    }
  });

  view.querySelectorAll('.bin-card[data-id]').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-act="rename"]').addEventListener('click', () => {
      const loc = store.getLocation(id);
      const name = prompt('Bin name', loc.name);
      if (!name?.trim()) return;
      const description = prompt('Where is it? (optional)', loc.description) ?? loc.description;
      store.updateLocation(id, { name, description });
      renderBins();
    });
    card.querySelector('[data-act="delete"]').addEventListener('click', () => {
      if (!confirm('Delete this bin? Its parts will move to "Unsorted".')) return;
      store.removeLocation(id);
      renderBins();
    });
  });

  view.querySelector('#print')?.addEventListener('click', () => window.print());
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderSettings() {
  view.innerHTML = `
    <h2>Settings</h2>
    <div class="card">
      <h3 style="margin-top:0">Share with the family</h3>
      <p class="muted">The collection is saved on this device. Export a file and open it on another
        phone/tablet (via email, AirDrop, Google Drive…) to share. <strong>Merge</strong> keeps both
        sets of changes; <strong>Replace</strong> overwrites this device.</p>
      <div class="actions">
        <button id="export" class="primary">⬇️ Export collection</button>
        <label class="btn" style="margin:0;color:inherit;font-size:1rem">⬆️ Import…
          <input id="import" type="file" accept="application/json,.json" hidden />
        </label>
        <label class="row" style="margin:0;flex:0 0 auto;gap:4px;color:inherit">
          <input type="checkbox" id="merge" checked style="width:auto" /> Merge
        </label>
      </div>
    </div>
    <form id="settings-form" class="card">
      <h3 style="margin-top:0">Online part lookup</h3>
      <p class="muted">Photo identification works without setup. To look parts up by number or name,
        create a free account at rebrickable.com → Settings → API and paste your key here.
        The key stays on this device and is never included in exports.</p>
      <label for="rbKey">Rebrickable API key</label>
      <input id="rbKey" name="rebrickableKey" value="${esc(store.state.settings.rebrickableKey)}" autocomplete="off" />
      <div class="actions"><button class="primary">Save</button></div>
    </form>
    <div class="card">
      <h3 style="margin-top:0">Data</h3>
      <div class="actions">
        <button id="sample">🧪 Load sample data</button>
        <button id="reset" class="danger">Erase collection on this device</button>
      </div>
    </div>
  `;

  view.querySelector('#export').addEventListener('click', () => {
    download(`lego-collection-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
  });
  view.querySelector('#import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const merge = view.querySelector('#merge').checked;
    if (!merge && !confirm('Replace everything on this device with the imported file?')) return;
    try {
      store.importJSON(await file.text(), { merge });
      toast(merge ? 'Merged!' : 'Imported!');
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  });
  view.querySelector('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.updateSettings({ rebrickableKey: view.querySelector('#rbKey').value.trim() });
    toast('Saved');
  });
  view.querySelector('#sample').addEventListener('click', () => {
    if (store.state.parts.length && !confirm('Add sample bins and parts to your collection?')) return;
    store.importJSON(JSON.stringify(SAMPLE), { merge: true });
    toast('Sample data loaded');
  });
  view.querySelector('#reset').addEventListener('click', () => {
    if (!confirm('Erase all parts and bins on this device? Export first if you want a backup.')) return;
    store.reset();
    toast('Collection erased');
  });
}

// ---------- router ----------

const routes = {
  find: renderFind,
  identify: renderIdentify,
  add: renderPartForm,
  edit: renderPartForm,
  bins: renderBins,
  settings: renderSettings,
};

function render() {
  const route = parseRoute();
  const fn = routes[route.name] ?? renderFind;
  const tab = route.name === 'edit' ? 'find' : route.name;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  fn(route);
  updateSummary();
}

store.subscribe(updateSummary);
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
render();
