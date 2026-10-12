import { createStore, normNum, parseNums, parseRows, slotId, slotCode, MAX_COMPARTMENTS } from './store.js';
import { searchParts } from './search.js';
import { identifyFromPhoto, lookupPart, partByNumber } from './identify.js';
import { compartmentsUsed, guessCategory, suggestSlots } from './sorting.js';
import { cellToText, prepareImage, scanUnit, textToParts } from './scan.js';
import { brickArchitectLabelUrl, checkBrickArchitect, fetchLabelFile, labelNumber, strips } from './labels.js';
import { drawStrip } from './label-image.js';
import { appPiece, lbxPiece, lbxStrips, makeStrips } from './lbx.js';
import { fetchSet, normalizeSetNum, planBuild } from './sets.js';
import { storageReport } from './report.js';
import { UNIT_KINDS, kindOf, MAX_SPAN } from './data/kinds.js';
import { CATEGORIES } from './data/categories.js';
import { CATALOG, lookupCatalog } from './data/catalog.js';
import { SAMPLE } from './data/sample.js';
import { createSync } from './sync.js';
import { connectFirebase, syncErrorMessage } from './firebase-backend.js';
import { FIREBASE_CONFIG, FAMILY_ID } from './firebase-config.js';
import { LABEL_RELAY_URL } from './label-relay-config.js';

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
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}

function parseRoute() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = 'find', id] = path.split('/');
  return { name: name || 'find', id: id ? decodeURIComponent(id) : undefined, params: new URLSearchParams(qs) };
}

function go(hash) {
  location.hash = hash;
}

const slotHref = (id) => `#/slot/${encodeURIComponent(id)}`;
const partHref = (num) => `#/part/${encodeURIComponent(num)}`;

function slotBadge(slot) {
  return `<a class="slot-badge" href="${slotHref(slot.id)}">📦 ${esc(store.codeOf(slot))}</a>`;
}

function slotsBadges(partNum) {
  const slots = store.slotsForPart(partNum);
  return slots.length ? slots.map(slotBadge).join(' ') : '<span class="slot-badge none">No slot yet</span>';
}

function thumb(url) {
  return url
    ? `<img class="thumb" src="${esc(url)}" alt="" loading="lazy" />`
    : '<div class="thumb" aria-hidden="true">🧱</div>';
}

function baLabelLink(part, text = '🏷️ Label') {
  const url = brickArchitectLabelUrl(part);
  return url
    ? `<a class="btn small ba-link" href="${esc(url)}" target="_blank" rel="noopener" title="Brick Architect label ${esc(labelNumber(part))}.lbx">${text}</a>`
    : '';
}

// Compartments a drawer's parts fill (versions of one part, like 3942a and 3942c, share one).
function slotFill(slot) {
  return compartmentsUsed(slot.partNums.map((n) => store.getPart(n) ?? { partNum: n, name: '' }));
}

function numsText(part) {
  return [part.partNum, ...part.altNums].map((n) => `#${n}`).join(' / ');
}

function slotsFor(part) {
  return store.slotsForPart(part.partNum).map((s) => ({ code: store.codeOf(s), label: s.label }));
}

// Datalist options for "which slot?" inputs: every slot code, with its label/contents.
function slotCodeOptions() {
  return store.state.units
    .flatMap((unit) =>
      unit.rows.flatMap((cols, r) =>
        Array.from({ length: cols }, (_, c) => {
          const slot = store.getSlot(slotId(unit.id, r + 1, c + 1));
          const hint = slot.label || slot.partNums.map((n) => store.getPart(n)?.name ?? n).join(', ') || 'empty';
          return `<option value="${esc(slotCode(unit, r + 1, c + 1))}">${esc(`${unit.name}: ${hint}`)}</option>`;
        }),
      ),
    )
    .join('');
}

function partNumOptions() {
  const mine = new Set(store.state.parts.map((p) => normNum(p.partNum)));
  return [...store.state.parts, ...CATALOG.filter((p) => !mine.has(normNum(p.partNum)))]
    .map((p) => `<option value="${esc(p.partNum)}">${esc(p.name)}</option>`)
    .join('');
}

function updateSummary() {
  const { parts, slots, units } = store.state;
  const filled = slots.filter((s) => s.partNums.length).length;
  document.getElementById('summary').textContent = [
    [parts.length, 'part'],
    [filled, 'slot'],
    [units.length, 'unit'],
  ]
    .map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`)
    .join(' · ');
}

// Short text for a map cell: the slot's own label, else its part names.
function cellText(slot) {
  if (slot.label) return slot.label;
  return slot.partNums
    .map((n) => (store.getPart(n)?.name || `#${n}`).replace(/^(Plate|Tile|Brick) /, (m) => `${m[0]}. `))
    .join(', ');
}

/** Visual map of a storage unit; highlighted slots stand out (e.g. search hits). */
function unitMap(unit, { highlight = new Set(), compact = false } = {}) {
  const { split } = kindOf(unit);
  return `<div class="unit-map ${compact ? 'compact' : ''}">
    ${unit.rows
      .map(
        (cols, r) => `<div class="map-row" style="grid-template-columns:${Array.from({ length: cols }, (_, c) => `${store.getSlot(slotId(unit.id, r + 1, c + 1))?.span ?? 1}fr`).join(' ')}">
        ${Array.from({ length: cols }, (_, c) => {
          const slot = store.getSlot(slotId(unit.id, r + 1, c + 1));
          const text = cellText(slot);
          const cls = [text ? 'filled' : '', highlight.has(slot.id) ? 'hit' : ''].join(' ');
          return `<a class="cell ${cls}" href="${slotHref(slot.id)}" title="${esc(`${slotCode(unit, r + 1, c + 1)} ${text}`)}">
            <span class="code">${r + 1}-${c + 1}${
              !compact && split && slot.compartments > 1 ? `<span class="fill">${slotFill(slot)}/${slot.compartments}</span>` : ''
            }</span>${compact ? '' : `<span class="cell-text">${esc(text)}</span>`}</a>`;
        }).join('')}
      </div>`,
      )
      .join('')}
  </div>`;
}

// Maps of every unit holding one of these slots, with those slots highlighted.
function hitMaps(slots) {
  const ids = new Set(slots.map((s) => s.id));
  return store.state.units
    .filter((u) => slots.some((s) => s.unitId === u.id))
    .map((u) => `<div class="card"><h3 style="margin-top:0">${esc(u.code)} · ${esc(u.name)}</h3>${unitMap(u, { highlight: ids, compact: true })}</div>`)
    .join('');
}

function partRow(part) {
  return `
    <li class="part">
      <a class="part-link" href="${partHref(part.partNum)}">
        ${thumb(part.imageUrl)}
        <div>
          <div class="part-title">${esc(part.name || 'Unnamed part')}</div>
          <div class="part-meta"><span>${esc(numsText(part))}</span></div>
        </div>
      </a>
      <div class="part-slots">${slotsBadges(part.partNum)}</div>
    </li>`;
}

// ---------- Find ----------

function renderFind({ params }) {
  const state = { q: params.get('q') ?? '', category: params.get('category') ?? '' };

  view.innerHTML = `
    <input id="q" class="search-big" type="search" placeholder="Search: 3023, 1x2 plate, hinge, A-7-1…"
      value="${esc(state.q)}" autocomplete="off" aria-label="Search parts" />
    <div class="chips" id="cats">
      <button class="chip ${state.category ? '' : 'active'}" data-cat="">All</button>
      ${CATEGORIES.map((c) => `<button class="chip ${state.category === c ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    </div>
    <p class="muted" id="count"></p>
    <div class="card" style="padding:0"><ul class="part-list" id="results"></ul></div>
    <div id="maps"></div>
  `;

  const results = view.querySelector('#results');

  function refresh() {
    const found = searchParts(store.state.parts, state.q, { slotsFor, category: state.category });
    view.querySelector('#count').textContent = store.state.parts.length
      ? `${found.length} part${found.length === 1 ? '' : 's'}`
      : '';
    if (found.length) {
      results.innerHTML = found.slice(0, 300).map(partRow).join('');
    } else if (!store.state.parts.length) {
      results.innerHTML = `<li class="empty">Nothing cataloged yet. Set up your drawers and cases in
        <a href="#/storage">Storage</a>, or load sample data in <a href="#/settings">Settings</a>.</li>`;
    } else {
      const known = lookupCatalog(state.q);
      results.innerHTML = `<li class="empty">No parts match.
        ${known ? `<br><a href="${partHref(known.partNum)}">Give ${esc(known.name)} a slot</a> ·` : ''}
        <a href="#/identify">Identify a part</a></li>`;
    }
    // Show where the top results live on each unit's map.
    const top = state.q ? found.slice(0, 5).flatMap((p) => store.slotsForPart(p.partNum)) : [];
    view.querySelector('#maps').innerHTML = hitMaps(top);

    const qs = new URLSearchParams();
    if (state.q) qs.set('q', state.q);
    if (state.category) qs.set('category', state.category);
    history.replaceState(null, '', `#/find${qs.toString() ? `?${qs}` : ''}`);
  }

  view.querySelector('#q').addEventListener('input', (e) => {
    state.q = e.target.value;
    refresh();
  });
  view.querySelector('#q').addEventListener('keydown', (e) => {
    // Typing a slot code and pressing Enter jumps straight to that slot.
    if (e.key !== 'Enter') return;
    const slot = store.findSlotByCode(state.q);
    if (slot) go(slotHref(slot.id));
  });
  view.querySelector('#cats').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    state.category = chip.dataset.cat;
    view.querySelectorAll('#cats .chip').forEach((c) => c.classList.toggle('active', c === chip));
    refresh();
  });

  refresh();
  if (!state.q && matchMedia('(pointer: fine)').matches) view.querySelector('#q').focus();
}

// ---------- Identify ----------

// For a part without a home: the best suggested spot, if any.
function suggestionLine(part) {
  const [top] = suggestSlots({ ...part, category: part.category || guessCategory(part.name) }, store.state, { limit: 1 });
  if (!top) return '<span class="muted">No slot for this part yet.</span>';
  if (top.kind === 'version') {
    return `Another version of this part (#${esc(top.versionOf)}) is in ${slotBadge(store.getSlot(top.slotId))}<span class="muted">.
      They look the same, so keep them together.</span>`;
  }
  return `<span class="muted">No slot yet.</span> Suggested: ${slotBadge(store.getSlot(top.slotId))}
    <span class="muted">(${esc(top.reason)})</span>`;
}

function resultCard(r) {
  const mine = store.getPart(r.partNum);
  const slots = store.slotsForPart(r.partNum);
  const qs = new URLSearchParams({ name: r.name, img: r.imageUrl });
  return `
    <div class="result">
      ${thumb(r.imageUrl)}
      <div>
        <div class="part-title">${esc(mine?.name || r.name)}</div>
        <div class="part-meta">
          <span>#${esc(r.partNum)}</span>
          ${r.score != null ? `<span>${Math.round(r.score * 100)}% match</span>` : ''}
        </div>
        <div class="owned">${slots.length ? `It goes in ${slots.map(slotBadge).join(' ')}` : suggestionLine(r)}</div>
        <div class="actions">
          <a class="btn" href="${partHref(r.partNum)}?${esc(qs.toString())}">${slots.length ? 'Details' : '➕ Give it a slot'}</a>
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
        <input id="lookup" type="search" placeholder="e.g. 3023 or plate 1 x 2" />
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
    // The family's own catalog and the built-in names answer instantly, even offline.
    const local = searchParts(store.state.parts, q, { slotsFor });
    const known = lookupCatalog(q);
    const offline = local.length
      ? local.slice(0, 6).map((p) => ({ ...p, score: null }))
      : known
        ? [{ ...known, imageUrl: '', score: null }]
        : [];
    if (!store.state.settings.rebrickableKey) {
      if (offline.length) showResults(offline, 'your catalog');
      else showError(new Error('Not in your catalog. Add a Rebrickable API key in Settings to look up any part online.'));
      return;
    }
    out.innerHTML = '<div class="card empty">🔎 Looking up…</div>';
    try {
      const online = await lookupPart(q, store.state.settings.rebrickableKey);
      showResults(online.length ? online : offline, online.length ? 'Rebrickable' : 'your catalog');
    } catch (err) {
      if (offline.length) showResults(offline, 'your catalog');
      else showError(err);
    }
  });
}

// ---------- Part ----------

function renderPart({ id: num, params }) {
  const existing = store.getPart(num);
  const known = lookupCatalog(num);
  const p = existing ?? {
    partNum: known?.partNum ?? num,
    altNums: known?.altNums ?? [],
    name: params.get('name') || known?.name || '',
    category: known?.category || guessCategory(params.get('name')),
    imageUrl: params.get('img') ?? '',
  };
  const slots = existing ? store.slotsForPart(existing.partNum) : [];
  const suggestions = slots.length ? [] : suggestSlots(p, store.state);

  view.innerHTML = `
    <form id="part-form" class="card">
      <div class="row" style="align-items:center;flex-wrap:nowrap">
        <div style="flex:0 0 auto">${thumb(p.imageUrl)}</div>
        <div>
          <h2 style="margin:0">${esc(p.name || 'New part')}</h2>
          <div class="muted">#${esc(p.partNum)}${existing ? '' : ' · not in your catalog yet'}</div>
        </div>
      </div>
      <label for="name">Name</label>
      <input id="name" name="name" value="${esc(p.name)}" placeholder="e.g. Plate 1 x 2" />
      <div class="grid2">
        <div>
          <label for="altNums">Other part numbers for the same part</label>
          <input id="altNums" name="altNums" value="${esc(p.altNums.join(', '))}" placeholder="e.g. 3794" />
        </div>
        <div>
          <label for="category">Kind of part</label>
          <select id="category" name="category">
            ${CATEGORIES.map((c) => `<option ${p.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="grid2">
        <div>
          <label for="labelNum">Brick Architect label number</label>
          <input id="labelNum" name="labelNum" value="${esc(p.labelNum ?? '')}" placeholder="${esc(p.partNum)}" />
        </div>
        <div>
          <label>&nbsp;</label>
          ${p.baLabel === 'no' ? '' : baLabelLink(p, '🏷️ Download label (.lbx)')}
        </div>
      </div>
      <label class="check"><input type="checkbox" name="baMissing" ${p.baLabel === 'no' ? 'checked' : ''} />
        Brick Architect doesn't have this label (the app makes one: number and name)</label>
      ${p.baLabel === 'no' ? '<div class="app-labels" id="app-label"></div>' : ''}
      <label for="imageUrl">Picture URL (optional)</label>
      <input id="imageUrl" name="imageUrl" value="${esc(p.imageUrl)}" placeholder="https://…" />
      <div class="actions">
        <button class="primary" type="submit">${existing ? 'Save' : 'Add to catalog'}</button>
        ${existing ? '<button type="button" class="danger" id="delete">Delete part</button>' : ''}
      </div>
    </form>

    <div class="card">
      <h3 style="margin-top:0">Where it's stored</h3>
      <div class="slot-list">${
        slots.length
          ? slots
              .map(
                (s) => `<span class="slot-chip">${slotBadge(s)}
                  <button type="button" class="small" data-remove="${esc(s.id)}" aria-label="Remove from ${esc(store.codeOf(s))}">✕</button></span>`,
              )
              .join(' ')
          : '<span class="muted">Not in any slot yet.</span>'
      }</div>
      ${
        suggestions.length
          ? `<h4 class="suggest-head">Suggested spots</h4>
             <ul class="suggestions">${suggestions
               .map(
                 (sg) => `<li><button type="button" class="suggestion" data-suggest="${esc(sg.slotId)}">
                   <span class="slot-badge">📦 ${esc(sg.code)}</span><span>${esc(sg.reason)}</span></button></li>`,
               )
               .join('')}</ul>`
          : ''
      }
      <form id="assign-form" class="row" style="margin-top:12px">
        <input id="assign" list="slot-codes" placeholder="Slot code, e.g. A-7-1" autocomplete="off" aria-label="Slot code" />
        <datalist id="slot-codes">${slotCodeOptions()}</datalist>
        <button class="primary" style="flex:0 0 auto">${slots.length ? 'Also in this slot' : 'Put in slot'}</button>
      </form>
      ${store.state.units.length ? '' : '<p class="muted">Set up your drawers and cases in <a href="#/storage">Storage</a> first.</p>'}
    </div>
    <div id="maps">${hitMaps(slots.length ? slots : suggestions.map((sg) => store.getSlot(sg.slotId)))}</div>
  `;

  const form = view.querySelector('#part-form');
  const save = () => {
    const input = Object.fromEntries(new FormData(form));
    const missing = 'baMissing' in input;
    delete input.baMissing;
    if (missing) input.baLabel = 'no';
    else if (p.baLabel === 'no') input.baLabel = '';
    return store.savePart(p.partNum, input);
  };
  if (p.baLabel === 'no') {
    const box = view.querySelector('#app-label');
    const { html, files } = appLabelsHtml([p]);
    box.innerHTML = html;
    wireAppLabels(box, files);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      save();
      toast('Saved');
      renderPart({ id: p.partNum, params: new URLSearchParams() });
    } catch (err) {
      toast(err.message);
    }
  });

  function putIn(slot) {
    try {
      save(); // keep any edits to the name etc.
      store.addPartsToSlot(slot.id, [p.partNum]);
      toast(`Put in ${store.codeOf(slot)}`);
      renderPart({ id: p.partNum, params: new URLSearchParams() });
    } catch (err) {
      toast(err.message);
    }
  }

  view.querySelector('#assign-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const slot = store.findSlotByCode(view.querySelector('#assign').value);
    if (!slot) {
      toast('No slot with that code. Use unit-row-column, e.g. A-7-1.');
      return;
    }
    putIn(slot);
  });
  view.querySelectorAll('[data-suggest]').forEach((btn) =>
    btn.addEventListener('click', () => putIn(store.getSlot(btn.dataset.suggest))),
  );

  view.querySelectorAll('[data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => {
      store.removePartFromSlot(btn.dataset.remove, p.partNum);
      renderPart({ id: p.partNum, params: new URLSearchParams() });
    }),
  );

  view.querySelector('#delete')?.addEventListener('click', () => {
    if (!confirm('Delete this part from the catalog and from every slot?')) return;
    store.removePart(p.partNum);
    toast('Deleted');
    go('#/find');
  });
}

// ---------- Storage ----------

function kindSelect(current = 'cabinet') {
  return `<label for="u-kind">Kind</label>
    <select id="u-kind" name="kind">${Object.entries(UNIT_KINDS)
      .map(([k, v]) => `<option value="${k}" ${k === current ? 'selected' : ''}>${esc(v.label)}</option>`)
      .join('')}</select>`;
}

const PRESETS = [
  { label: 'Drawer cabinet (5 rows of 6, 3 rows of 3)', rows: '6, 6, 6, 6, 6, 3, 3, 3', kind: 'cabinet' },
  { label: 'Divided case (6 × 6)', rows: '6, 6, 6, 6, 6, 6', kind: 'case' },
  { label: 'Case with 8 compartments', rows: '2, 2, 2, 2', kind: 'case' },
  { label: 'One tub', rows: '1', kind: 'tub' },
];

function renderStorage() {
  const { units } = store.state;
  const homeless = store.partsWithoutSlot();

  view.innerHTML = `
    <h2>Storage</h2>
    <a class="btn primary-outline wide" href="#/scan">📷 Add a storage unit from a photo</a>
    ${units.length ? '<a class="btn wide" href="#/check">🔎 Check storage: versions apart, parts in two places</a>' : ''}
    ${units
      .map(
        (u) => `<div class="card">
          <div class="unit-head">
            <h3 style="margin:0"><span class="unit-code">${esc(u.code)}</span> ${esc(u.name)}</h3>
            <a class="btn small" href="#/unit/${encodeURIComponent(u.id)}">Edit</a>
          </div>
          ${u.description ? `<p class="muted">${esc(u.description)}</p>` : ''}
          ${unitMap(u)}
        </div>`,
      )
      .join('')}

    <form id="unit-form" class="card">
      <h3 style="margin-top:0">${units.length ? 'Add another storage unit' : 'Add your first storage unit'}</h3>
      <p class="muted">A drawer cabinet, a divided case or a tub with compartments. Slots are named
        <strong>unit-row-column</strong>: row 7, column 1 of cabinet A is <strong>A-7-1</strong>.</p>
      <div class="grid2">
        <div>
          <label for="u-name">Name</label>
          <input id="u-name" name="name" placeholder="e.g. Plate & tile cabinet" required />
        </div>
        <div>
          <label for="u-code">Code (letter on its labels)</label>
          <input id="u-code" name="code" placeholder="${esc(store.nextUnitCode())}" maxlength="3" />
        </div>
      </div>
      ${kindSelect()}
      <label for="u-rows">Drawers or compartments in each row, top to bottom</label>
      <input id="u-rows" name="rows" placeholder="e.g. 6, 6, 6, 6, 6, 3, 3, 3" required />
      <p class="muted" style="margin:4px 0 0">Uneven compartments? Count each one, then set its width on its own page.</p>
      <div class="chips wrap">
        ${PRESETS.map((pr) => `<button type="button" class="chip" data-rows="${esc(pr.rows)}" data-kind="${pr.kind}">${esc(pr.label)}</button>`).join('')}
      </div>
      <label for="u-desc">Where is it? (optional)</label>
      <input id="u-desc" name="description" placeholder="e.g. Playroom, left wall" />
      <div class="actions"><button class="primary">Add storage unit</button></div>
    </form>

    ${
      homeless.length
        ? `<div class="card" style="padding:0"><h3 style="margin:14px 14px 0">Parts without a slot (${homeless.length})</h3>
            <ul class="part-list">${homeless.map(partRow).join('')}</ul></div>`
        : ''
    }
  `;

  const form = view.querySelector('#unit-form');
  form.addEventListener('click', (e) => {
    const preset = e.target.closest('[data-rows]');
    if (!preset) return;
    form.elements.rows.value = preset.dataset.rows;
    form.elements.kind.value = preset.dataset.kind;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const unit = store.addUnit(Object.fromEntries(new FormData(form)));
      toast(`Added ${unit.code} · ${unit.name}`);
      renderStorage();
    } catch (err) {
      toast(err.message);
    }
  });
}

function renderUnit({ id }) {
  const unit = store.getUnit(id);
  if (!unit) {
    view.innerHTML = '<div class="card empty">That storage unit no longer exists. <a href="#/storage">Back</a></div>';
    return;
  }
  view.innerHTML = `
    <p><a href="#/storage">← Storage</a></p>
    <h2><span class="unit-code">${esc(unit.code)}</span> ${esc(unit.name)}</h2>
    <div class="card">${unitMap(unit)}</div>
    <form id="unit-form" class="card">
      <div class="grid2">
        <div><label for="u-name">Name</label><input id="u-name" name="name" value="${esc(unit.name)}" required /></div>
        <div><label for="u-code">Code</label><input id="u-code" name="code" value="${esc(unit.code)}" maxlength="3" required /></div>
      </div>
      ${kindSelect(unit.kind)}
      <label for="u-rows">Drawers or compartments in each row, top to bottom</label>
      <input id="u-rows" name="rows" value="${esc(unit.rows.join(', '))}" required />
      <p class="muted" style="margin:4px 0 0">Uneven compartments? Tap one on the map to set its width.</p>
      <label for="u-desc">Where is it?</label>
      <input id="u-desc" name="description" value="${esc(unit.description)}" />
      <div class="actions">
        <button class="primary">Save</button>
        <a class="btn" href="#/labels?unit=${encodeURIComponent(unit.id)}">🖨️ Labels</a>
        <button type="button" class="danger" id="delete">Delete unit</button>
      </div>
    </form>
  `;
  view.querySelector('#unit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      store.updateUnit(id, Object.fromEntries(new FormData(e.target)));
      toast('Saved');
      renderUnit({ id });
    } catch (err) {
      toast(err.message);
    }
  });
  view.querySelector('#delete').addEventListener('click', () => {
    if (!confirm(`Delete ${unit.name}? Its parts stay in the catalog without a slot.`)) return;
    store.removeUnit(id);
    go('#/storage');
  });
}

// ---------- Add a storage unit from a photo ----------

function renderScan() {
  const hasKey = Boolean(store.state.settings.anthropicKey);
  view.innerHTML = `
    <p><a href="#/storage">← Storage</a></p>
    <h2>Add a storage unit from a photo</h2>
    ${
      hasKey
        ? ''
        : `<div class="card notice">This uses Claude to read the labels, which needs an Anthropic API key.
            Add yours in <a href="#/settings">Settings</a> first.</div>`
    }
    <form id="scan-form" class="card">
      <div class="grid2">
        <div>
          <label for="s-name">Name</label>
          <input id="s-name" name="name" placeholder="e.g. Brick cabinet" required />
        </div>
        <div>
          <label for="s-code">Code (letter on its labels)</label>
          <input id="s-code" name="code" placeholder="${esc(store.nextUnitCode())}" maxlength="3" />
        </div>
      </div>
      ${kindSelect().replace(/u-kind/g, 's-kind')}
      <label for="s-desc">Where is it? (optional)</label>
      <input id="s-desc" name="description" placeholder="e.g. Garage, back wall" />
      <label class="photo-drop" for="s-photo" style="margin-top:14px">
        <span>📷</span>
        <strong>Photo of the whole unit, straight on</strong>
        <small class="muted">All four edges in frame, labels facing the camera, no glare.</small>
        <input id="s-photo" type="file" accept="image/*" capture="environment" />
      </label>
      <div id="s-preview"></div>
      <div class="actions">
        <button class="primary" id="s-go" disabled>Read the labels</button>
      </div>
      <p class="muted">Takes about a minute. Each photo is sent to Anthropic and costs roughly 10–20¢ on your API key.
        You'll check everything before it's saved.</p>
    </form>
    <div id="s-status"></div>
  `;

  const form = view.querySelector('#scan-form');
  const readBtn = view.querySelector('#s-go');
  const status = view.querySelector('#s-status');
  let image = null;

  view.querySelector('#s-photo').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      image = await prepareImage(file);
      view.querySelector('#s-preview').innerHTML = `<img class="scan-photo" src="${image.previewUrl}" alt="Your photo" />`;
      readBtn.disabled = !store.state.settings.anthropicKey;
    } catch {
      toast('Could not open that photo.');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!image) return;
    const unitInput = Object.fromEntries(new FormData(form));
    if (!unitInput.name.trim()) {
      toast('Give the storage unit a name.');
      return;
    }
    readBtn.disabled = true;
    status.innerHTML = '<div class="card empty">🔎 Reading the labels… this can take a minute.</div>';
    try {
      const scan = await scanUnit(image, store.state.settings.anthropicKey);
      if (!scan.rows.length) throw new Error('No drawers found in this photo. Try a straighter, closer shot.');
      renderScanReview(unitInput, image, scan);
    } catch (err) {
      status.innerHTML = `<div class="card empty">⚠️ ${esc(err.message)}</div>`;
      readBtn.disabled = false;
    }
  });
}

function renderScanReview(unitInput, image, scan) {
  // Each drawer: the text the family edits, plus what Claude read (for names).
  let rows = scan.rows.map((row) => row.map((cell) => ({ ...cell, text: cellToText(cell) })));
  const uncertainCount = rows.flat().filter((c) => c.uncertain).length;

  view.innerHTML = `
    <h2>Check what was read</h2>
    <div class="card">
      <img class="scan-photo" src="${image.previewUrl}" alt="Your photo" />
      ${scan.notes ? `<p class="notice">📝 ${esc(scan.notes)}</p>` : ''}
      <p class="muted">Compare each drawer with its label and fix any numbers.
        ${uncertainCount ? `<strong>${uncertainCount} drawer${uncertainCount === 1 ? ' was' : 's were'} hard to read</strong> and ${uncertainCount === 1 ? 'is' : 'are'} marked in yellow.` : ''}
        Separate parts with commas, and alternate numbers for the same part with a slash (15573/3794).</p>
      <label for="r-rows">Drawers in each row, top to bottom</label>
      <input id="r-rows" value="${rows.map((r) => r.length).join(', ')}" />
    </div>
    <div class="card"><div id="r-map"></div></div>
    <div class="card" id="r-list"></div>
    <div class="card">
      <label class="check" style="margin-top:0"><input type="checkbox" id="r-labeled" checked /> These drawers already have printed labels</label>
      <div class="actions">
        <button class="primary" id="r-save">Save ${esc(unitInput.name)}</button>
        <a class="btn" href="#/scan">Start over</a>
      </div>
    </div>
  `;

  const list = view.querySelector('#r-list');

  function syncTexts() {
    list.querySelectorAll('input[data-r]').forEach((input) => {
      rows[input.dataset.r][input.dataset.c].text = input.value;
    });
  }

  function drawMap() {
    view.querySelector('#r-map').innerHTML = `<div class="unit-map">${rows
      .map(
        (row, r) => `<div class="map-row" style="grid-template-columns:repeat(${row.length},1fr)">${row
          .map(
            (cell, c) => `<button type="button" class="cell ${cell.text.trim() ? 'filled' : ''} ${cell.uncertain ? 'hit' : ''}" data-jump="r-${r}-${c}">
              <span class="code">${r + 1}-${c + 1}</span><span class="cell-text">${esc(cell.text)}</span></button>`,
          )
          .join('')}</div>`,
      )
      .join('')}</div>`;
  }

  function drawList() {
    list.innerHTML = rows
      .map(
        (row, r) => `<h3 style="margin-top:${r ? 16 : 0}px">Row ${r + 1}</h3>${row
          .map((cell, c) => {
            const names = cell.parts.map((p) => p.name).filter(Boolean).join(' · ');
            return `<div class="review-cell ${cell.uncertain ? 'uncertain' : ''}" id="r-${r}-${c}">
              <span class="slot-badge">${esc(`${unitInput.code?.trim().toUpperCase() || store.nextUnitCode()}-${r + 1}-${c + 1}`)}</span>
              <div>
                <input data-r="${r}" data-c="${c}" value="${esc(cell.text)}" placeholder="empty" autocomplete="off" aria-label="Drawer ${r + 1}-${c + 1}" />
                ${names ? `<small class="muted">${esc(names)}</small>` : ''}
              </div>
            </div>`;
          })
          .join('')}`,
      )
      .join('');
  }

  drawMap();
  drawList();
  view.querySelector('#r-map').addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    if (!jump) return;
    const target = view.querySelector(`#${jump.dataset.jump}`);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.querySelector('input').focus({ preventScroll: true });
  });
  list.addEventListener('input', () => {
    syncTexts();
    drawMap();
  });

  view.querySelector('#r-rows').addEventListener('change', (e) => {
    const layout = parseRows(e.target.value);
    if (!layout.length) {
      toast('Enter how many drawers are in each row, e.g. 6, 6, 3.');
      return;
    }
    syncTexts();
    rows = layout.map((cols, r) =>
      Array.from({ length: cols }, (_, c) => rows[r]?.[c] ?? { parts: [], uncertain: false, text: '' }),
    );
    drawMap();
    drawList();
  });

  view.querySelector('#r-save').addEventListener('click', () => {
    syncTexts();
    const cells = rows.map((row) => row.map((cell) => textToParts(cell.text, cell.parts)));
    try {
      const unit = store.addScannedUnit(unitInput, cells, { labeled: view.querySelector('#r-labeled').checked });
      const filled = cells.flat().filter((parts) => parts.length).length;
      toast(`Saved ${unit.code} · ${unit.name}: ${filled} drawers`);
      go('#/storage');
    } catch (err) {
      toast(err.message);
    }
  });
}

// ---------- Part names from Rebrickable ----------

/**
 * Look up names (and pictures) for parts that have none. Returns how many were named,
 * or null when there's no Rebrickable key to look them up with.
 */
async function fillNamesOnline(parts, onProgress = () => {}) {
  const key = store.state.settings.rebrickableKey;
  if (!key) return null;
  let named = 0;
  for (const [i, part] of parts.entries()) {
    onProgress(i + 1, parts.length);
    for (const num of [part.partNum, ...part.altNums]) {
      const found = await partByNumber(num, key); // stops on a bad key or network error
      if (found?.name) {
        store.fillPartDetails(part.partNum, found);
        named += 1;
        break;
      }
    }
  }
  return named;
}

// ---------- Slot ----------

function neighborSlots(unit, slot) {
  const all = unit.rows.flatMap((cols, r) => Array.from({ length: cols }, (_, c) => slotId(unit.id, r + 1, c + 1)));
  const i = all.indexOf(slot.id);
  return { prev: all[i - 1], next: all[i + 1] };
}

function renderSlot({ id }) {
  const slot = store.getSlot(id);
  const unit = slot && store.getUnit(slot.unitId);
  if (!slot || !unit) {
    view.innerHTML = '<div class="card empty">That slot no longer exists. <a href="#/storage">Back to storage</a></div>';
    return;
  }
  const { prev, next } = neighborSlots(unit, slot);
  const kind = kindOf(unit);
  const parts = slot.partNums.map((n) => store.getPart(n) ?? { partNum: n, altNums: [], name: '', imageUrl: '' });

  view.innerHTML = `
    <div class="slot-nav">
      ${prev ? `<a class="btn" href="${slotHref(prev)}">← ${esc(store.codeOf(store.getSlot(prev)))}</a>` : '<span></span>'}
      <a href="#/storage">${esc(unit.code)} · ${esc(unit.name)}</a>
      ${next ? `<a class="btn" href="${slotHref(next)}">${esc(store.codeOf(store.getSlot(next)))} →</a>` : '<span></span>'}
    </div>
    <h2 class="slot-title">📦 ${esc(store.codeOf(slot))}</h2>
    ${
      kind.split && slot.compartments > 1
        ? `<p class="muted">${slotFill(slot)} of ${slot.compartments} compartments used</p>`
        : `<p class="muted">${esc(kind.label)} · ${esc(kind.slot)}</p>`
    }

    <div class="card" style="padding:0">
      <ul class="part-list">
        ${
          parts.length
            ? parts
                .map(
                  (p) => `<li class="part">
                    <a class="part-link" href="${partHref(p.partNum)}">${thumb(p.imageUrl)}
                      <div><div class="part-title">${esc(p.name || 'Unnamed part')}</div>
                      <div class="part-meta"><span>${esc(numsText(p))}</span></div></div></a>
                    <div class="part-slots">
                      ${baLabelLink(p)}
                      <button class="small" data-move="${esc(p.partNum)}">Move</button>
                      <button class="small danger" data-remove="${esc(p.partNum)}" aria-label="Remove">✕</button>
                    </div>
                  </li>`,
                )
                .join('')
            : `<li class="empty">Empty. Add the part numbers on this ${esc(kind.slot)}'s label below.</li>`
        }
      </ul>
    </div>

    <form id="add-form" class="card">
      <label for="nums" style="margin-top:0">Add part numbers</label>
      <div class="row">
        <input id="nums" list="part-nums" placeholder="e.g. 3623, 63864" autocomplete="off" />
        <datalist id="part-nums">${partNumOptions()}</datalist>
        <button class="primary" style="flex:0 0 auto">Add</button>
        <label class="btn" for="slot-photo" style="flex:0 0 auto">📷 Photo</label>
        <input id="slot-photo" type="file" accept="image/*" capture="environment" hidden />
      </div>
      <p class="muted">Separate several numbers with commas. Names and pictures are filled in
        ${store.state.settings.rebrickableKey ? 'from the built-in list or Rebrickable' : 'for known parts (add a Rebrickable key in Settings to look up the rest)'}.
        Or snap a 📷 photo of the part.</p>
      <div id="slot-photo-results"></div>
    </form>

    <form id="slot-form" class="card">
      <label for="label" style="margin-top:0">Slot name (optional)</label>
      <input id="label" name="label" value="${esc(slot.label)}" placeholder="e.g. Hinges, or Clips & bars" />
      ${
        kind.split
          ? `<label for="compartments">Compartments in this ${esc(kind.slot)}</label>
            <select id="compartments" name="compartments">
              ${Array.from({ length: MAX_COMPARTMENTS }, (_, i) => i + 1)
                .map((n) => `<option value="${n}" ${slot.compartments === n ? 'selected' : ''}>${n === 1 ? '1 (not divided)' : n}</option>`)
                .join('')}
            </select>`
          : ''
      }
      <label for="span">Width</label>
      <select id="span" name="span">
        ${Array.from({ length: MAX_SPAN }, (_, i) => i + 1)
          .map((n) => `<option value="${n}" ${slot.span === n ? 'selected' : ''}>${n === 1 ? 'Normal' : `${n} spots wide`}</option>`)
          .join('')}
      </select>
      <label class="check"><input type="checkbox" name="needsLabel" ${slot.needsLabel ? 'checked' : ''} /> Needs a printed label</label>
      <div class="actions"><button class="primary">Save</button></div>
    </form>

    <div class="card">${unitMap(unit, { highlight: new Set([slot.id]), compact: true })}</div>
  `;

  const nums = view.querySelector('#nums');
  view.querySelector('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!parseNums(nums.value).length) return;
    try {
      const added = store.addPartsToSlot(slot.id, nums.value);
      toast(added.length ? `Added ${added.map((p) => p.name || p.partNum).join(', ')}` : 'Already in this slot');
      renderSlot({ id });
      view.querySelector('#nums').focus();
      const unnamed = added.filter((p) => !p.name);
      if (unnamed.length && store.state.settings.rebrickableKey) {
        toast('Looking up names on Rebrickable…');
        fillNamesOnline(unnamed)
          .then((named) => {
            toast(named ? `Found ${named} name${named === 1 ? '' : 's'}` : 'Rebrickable doesn\'t know that number; add the name on the part\'s page.');
            if (parseRoute().name !== 'slot' || parseRoute().id !== id) return;
            // Redraw with the new names, keeping anything half-typed in the box.
            const typing = document.activeElement?.id === 'nums';
            const draft = view.querySelector('#nums')?.value ?? '';
            renderSlot({ id });
            const box = view.querySelector('#nums');
            box.value = draft;
            if (typing) box.focus();
          })
          .catch((err) => toast(err.message));
      }
    } catch (err) {
      toast(err.message);
    }
  });

  // Photo of a part: pick the right match and it goes into this drawer, name and picture included.
  const photoOut = view.querySelector('#slot-photo-results');
  view.querySelector('#slot-photo').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    photoOut.innerHTML = '<p class="muted">🔎 Identifying…</p>';
    try {
      const matches = (await identifyFromPhoto(file)).slice(0, 4);
      photoOut.innerHTML = matches.length
        ? `<p class="muted">Tap the right one to add it here:</p><ul class="suggestions">${matches
            .map(
              (m, i) => `<li><button type="button" class="suggestion" data-match="${i}">${thumb(m.imageUrl)}
                <span><strong>${esc(m.name)}</strong><br><span class="muted">#${esc(m.partNum)}${
                  m.score != null ? ` · ${Math.round(m.score * 100)}% match` : ''
                }</span></span></button></li>`,
            )
            .join('')}</ul>`
        : '<p class="muted">No matches. Try another angle or lighting.</p>';
      photoOut.querySelectorAll('[data-match]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const m = matches[btn.dataset.match];
          store.fillPartDetails(m.partNum, m);
          const added = store.addPartsToSlot(slot.id, [m.partNum]);
          toast(added.length ? `Added ${m.name}` : 'Already in this slot');
          renderSlot({ id });
        }),
      );
    } catch (err) {
      photoOut.innerHTML = `<p class="muted">⚠️ ${esc(err.message)}</p>`;
    }
    e.target.value = '';
  });

  view.querySelector('#slot-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    store.updateSlot(slot.id, {
      label: fd.get('label'),
      ...(fd.has('compartments') ? { compartments: fd.get('compartments') } : {}),
      span: fd.get('span'),
      needsLabel: fd.has('needsLabel'),
    });
    toast('Saved');
    renderSlot({ id });
  });

  view.querySelectorAll('[data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => {
      store.removePartFromSlot(slot.id, btn.dataset.remove);
      renderSlot({ id });
    }),
  );
  view.querySelectorAll('[data-move]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const code = prompt('Move to which slot? (e.g. A-3-2)');
      if (!code) return;
      const target = store.findSlotByCode(code);
      if (!target) {
        toast('No slot with that code.');
        return;
      }
      store.movePart(btn.dataset.move, slot.id, target.id);
      toast(`Moved to ${store.codeOf(target)}`);
      renderSlot({ id });
    }),
  );
}

// ---------- Build a set ----------

const RECENT_SETS_KEY = 'brick-finder:recent-sets';
const setCache = new Map(); // set number -> fetched set, for this visit

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: ticks and recent sets just aren't remembered.
  }
}

function renderBuild({ params }) {
  const setParam = params.get('set') ?? '';
  const recent = readLocal(RECENT_SETS_KEY, []);
  view.innerHTML = `
    <h2>Build a set</h2>
    <form id="set-form" class="card">
      <label for="set-num" style="margin-top:0">Set number</label>
      <div class="row">
        <input id="set-num" value="${esc(setParam)}" placeholder="e.g. 60337" inputmode="text" autocomplete="off" />
        <button class="primary" style="flex:0 0 auto">Find parts</button>
      </div>
      ${
        recent.length
          ? `<div class="chips wrap">${recent
              .map((r) => `<a class="chip" href="#/build?set=${encodeURIComponent(r.setNum)}">${esc(r.setNum)} · ${esc(r.name)}</a>`)
              .join('')}</div>`
          : ''
      }
      ${store.state.settings.rebrickableKey ? '' : '<p class="notice">Set parts lists come from Rebrickable. Add your Rebrickable API key in <a href="#/settings">Settings</a>.</p>'}
    </form>
    <div id="build-out"></div>
  `;
  view.querySelector('#set-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const num = normalizeSetNum(view.querySelector('#set-num').value);
    if (num) go(`#/build?set=${encodeURIComponent(num)}`);
  });
  if (setParam) loadBuild(normalizeSetNum(setParam));
}

async function loadBuild(setNum) {
  const out = view.querySelector('#build-out');
  out.innerHTML = '<div class="card empty">🔎 Getting the parts list…</div>';
  let set = setCache.get(setNum);
  try {
    set ??= await fetchSet(setNum, store.state.settings.rebrickableKey);
  } catch (err) {
    out.innerHTML = `<div class="card empty">⚠️ ${esc(err.message)}</div>`;
    return;
  }
  if (parseRoute().name !== 'build') return; // moved on while loading
  if (!set) {
    out.innerHTML = `<div class="card empty">Rebrickable doesn't know set ${esc(setNum)}. Check the number on the box (e.g. 60337 or 60337-1).</div>`;
    return;
  }
  setCache.set(setNum, set);
  writeLocal(
    RECENT_SETS_KEY,
    [{ setNum: set.setNum, name: set.name }, ...readLocal(RECENT_SETS_KEY, []).filter((r) => r.setNum !== set.setNum)].slice(0, 6),
  );
  drawBuild(set);
}

function drawBuild(set) {
  const out = view.querySelector('#build-out');
  const plan = planBuild(set, store);
  const ticksKey = `brick-finder:build:${set.setNum}`;
  const ticks = new Set(readLocal(ticksKey, []));
  const kinds = set.lines.length;
  const foundKinds = kinds - plan.missing.length;

  const lineHtml = (l) => `<li class="part build-line ${ticks.has(l.key) ? 'done' : ''}">
      <label class="part-link">
        ${thumb(l.imageUrl)}
        <div>
          <div class="part-title">${l.quantity}× ${esc(l.name)}</div>
          <div class="part-meta">
            <span>#${esc(l.partNum)}</span>
            <span>${l.colorRgb ? `<span class="swatch" style="background:${esc(l.colorRgb)}"></span>` : ''}${esc(l.color)}</span>
            ${l.alsoIn?.length ? `<span>also in ${esc(l.alsoIn.join(', '))}</span>` : ''}
          </div>
        </div>
      </label>
      <input type="checkbox" class="tick" data-key="${esc(l.key)}" ${ticks.has(l.key) ? 'checked' : ''} aria-label="Got it" />
    </li>`;

  out.innerHTML = `
    <div class="card set-head">
      ${set.imageUrl ? `<img src="${esc(set.imageUrl)}" alt="" />` : ''}
      <div>
        <h3 style="margin:0">${esc(set.name)}</h3>
        <div class="muted">${esc(set.setNum)}${set.year ? ` · ${set.year}` : ''} · ${plan.totalPieces} pieces, ${kinds} kinds</div>
        <p style="margin:6px 0 0"><strong>${foundKinds} of ${kinds}</strong> kinds are in your storage
          (${plan.foundPieces} pieces), in <strong>${plan.stops.length}</strong> drawer${plan.stops.length === 1 ? '' : 's'}.</p>
        <p class="muted" id="tick-count"></p>
      </div>
    </div>
    ${hitMaps(plan.stops.map((s) => s.slot))}
    ${plan.stops
      .map(
        (stop) => `<div class="card" style="padding:0">
          <h3 class="stop-head"><a class="slot-badge" href="${slotHref(stop.slot.id)}">📦 ${esc(stop.code)}</a>
            <span class="muted">${esc(store.getUnit(stop.slot.unitId)?.name ?? '')}</span></h3>
          <ul class="part-list">${stop.lines.map(lineHtml).join('')}</ul>
        </div>`,
      )
      .join('')}
    ${
      plan.missing.length
        ? `<div class="card" style="padding:0">
            <h3 class="stop-head">Not in your storage (${plan.missing.length})</h3>
            <ul class="part-list">${plan.missing.map(lineHtml).join('')}</ul>
          </div>`
        : ''
    }
    <div class="actions"><button id="untick">Clear ticks</button></div>
  `;

  const allKeys = set.lines.map((l) => l.key);
  const updateCount = () => {
    const n = allKeys.filter((k) => ticks.has(k)).length;
    out.querySelector('#tick-count').textContent = n ? `✓ ${n} of ${kinds} collected` : 'Tick parts off as you collect them.';
  };
  updateCount();
  out.addEventListener('change', (e) => {
    const box = e.target.closest('.tick');
    if (!box) return;
    if (box.checked) ticks.add(box.dataset.key);
    else ticks.delete(box.dataset.key);
    box.closest('.build-line').classList.toggle('done', box.checked);
    writeLocal(ticksKey, [...ticks]);
    updateCount();
  });
  out.querySelector('#untick').addEventListener('click', () => {
    writeLocal(ticksKey, []);
    drawBuild(set);
  });
}

// ---------- Labels ----------

function labelHtml(slot, style) {
  const code = store.codeOf(slot);
  const parts = slot.partNums.map((n) => store.getPart(n) ?? { partNum: n, altNums: [], name: '', imageUrl: '' });
  if (style === 'code') {
    return `<div class="label code-only"><strong>${esc(code)}</strong></div>`;
  }
  return `<div class="label">
    <div class="label-code">${esc(code)}</div>
    ${slot.label ? `<div class="label-name">${esc(slot.label)}</div>` : ''}
    ${parts
      .map(
        (p) => `<div class="label-part">
          ${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="" />` : ''}
          <div><div class="label-name">${esc(p.name || '')}</div><div class="label-num">${esc([p.partNum, ...p.altNums].join(' / '))}</div></div>
        </div>`,
      )
      .join('')}
  </div>`;
}

const PRINTED_KEY = 'brick-finder:printed-labels'; // label numbers ticked off on this phone

// Hand a file to the share sheet (to open it in the Brother app), or download it.
// Call straight from a tap: phones only allow sharing right after one.
function shareFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch((err) => {
      if (err.name !== 'AbortError') toast(`Couldn't share: ${err.message}`);
    });
  } else {
    downloadFile(file);
  }
}

function downloadFile(file) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// Text widths in points, measured with a font close to the Brother app's Helsinki.
const measureCtx = document.createElement('canvas').getContext('2d');
function measureText(text, size, bold) {
  measureCtx.font = `${bold ? 700 : 400} ${size}px Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(text).width * 1.1;
}

// App-made labels as .lbx files: one strip per file (up to 10 parts, under 28 cm),
// each with a preview and buttons to open it in the Brother app or download it.
function appLabelsHtml(parts) {
  const strips = lbxStrips(parts, { measure: measureText });
  const files = strips.map((s) => new File([s.bytes], s.name, { type: 'application/octet-stream' }));
  const html = strips
    .map(
      (s, i) => `<div class="app-strip">
        <img src="${drawStrip(s.parts).toDataURL('image/png')}" alt="Preview: ${esc(s.parts.map((p) => p.partNum).join(', '))}" />
        <div class="actions">
          <button type="button" class="primary small" data-lbx-share="${i}">📤 Open ${strips.length > 1 ? `file ${i + 1} ` : ''}in the Brother app</button>
          <button type="button" class="small" data-lbx-download="${i}">⬇️ ${esc(s.name)}</button>
        </div>
      </div>`,
    )
    .join('');
  return { html, files };
}

function wireAppLabels(box, files) {
  box.querySelectorAll('[data-lbx-share]').forEach((b) => b.addEventListener('click', () => shareFile(files[b.dataset.lbxShare])));
  box.querySelectorAll('[data-lbx-download]').forEach((b) => b.addEventListener('click', () => downloadFile(files[b.dataset.lbxDownload])));
}

// Ask Brick Architect which labels it has. Answers are saved on the part (and shared
// with the family), so each label is only asked about once.
// Most browsers aren't allowed to ask, so a refusal is remembered on the phone for a month.
const BA_BLOCKED_KEY = 'brick-finder:ba-check-blocked';
const baCheck = {
  state: !LABEL_RELAY_URL && Date.now() - readLocal(BA_BLOCKED_KEY, 0) < 30 * 864e5 ? 'blocked' : 'unknown', // unknown | works | blocked
  asked: new Set(),
};
async function checkLabels(parts) {
  const todo = parts.filter((p) => !p.baLabel && !baCheck.asked.has(labelNumber(p)));
  if (!todo.length || baCheck.state === 'blocked') return;
  todo.forEach((p) => baCheck.asked.add(labelNumber(p)));
  let changed = false;
  for (const batch of strips(todo, 4)) {
    const answers = await Promise.all(batch.map((p) => checkBrickArchitect(p, fetch, { relay: LABEL_RELAY_URL })));
    answers.forEach((has, i) => {
      if (has === null) {
        baCheck.state = 'blocked';
        if (!LABEL_RELAY_URL) writeLocal(BA_BLOCKED_KEY, Date.now());
        return;
      }
      if (baCheck.state === 'unknown') baCheck.state = 'works';
      store.setBaLabel(batch[i].partNum, has ? 'yes' : 'no');
      changed = true;
    });
    if (baCheck.state === 'blocked') break;
  }
  const route = parseRoute();
  if (route.name === 'labels' && (changed || baCheck.state === 'blocked')) renderLabels(route);
}

// Strips ready to print, shown under "Print in batches".
function showPrintStrips(made, note = '') {
  const out = view.querySelector('#print-out');
  if (!out) return;
  const files = made.map((s) => new File([s.bytes], s.name, { type: 'application/octet-stream' }));
  out.innerHTML = `${note ? `<p class="muted">${note}</p>` : ''}<div class="app-labels">${made
    .map(
      (s, i) => `<div class="app-strip">
        <div><strong>Strip ${i + 1} of ${made.length}</strong> <span class="muted">· ${esc(s.keys.join(', '))}</span></div>
        <div class="actions">
          <button type="button" class="primary small" data-lbx-share="${i}">📤 Open in the Brother app</button>
          <button type="button" class="small" data-lbx-download="${i}">⬇️ ${esc(s.name)}</button>
        </div>
      </div>`,
    )
    .join('')}</div>`;
  wireAppLabels(out, files);
}

// With the relay: fetch each Brick Architect label (parts it doesn't have get an
// app-made one, and are remembered) and put them all on strips, in drawer order.
async function makePrintFiles(parts, button) {
  const out = view.querySelector('#print-out');
  button.disabled = true;
  const pieces = [];
  let made = 0;
  try {
    for (const [i, p] of parts.entries()) {
      out.innerHTML = `<p class="muted">Getting label ${i + 1} of ${parts.length}…</p>`;
      const bytes = p.baLabel === 'no' ? null : await fetchLabelFile(p, LABEL_RELAY_URL);
      if (bytes) {
        pieces.push(await lbxPiece(bytes, { key: labelNumber(p), measure: measureText }));
        if (p.baLabel !== 'yes') store.setBaLabel(p.partNum, 'yes');
      } else {
        pieces.push(appPiece(p, measureText));
        if (p.baLabel !== 'no') store.setBaLabel(p.partNum, 'no');
        made++;
      }
    }
  } catch (err) {
    out.innerHTML = `<p class="notice">⚠️ ${esc(err.message)} Try again in a moment.</p>`;
    button.disabled = false;
    return;
  }
  if (parseRoute().name !== 'labels') return;
  button.disabled = false;
  showPrintStrips(makeStrips(pieces), made ? `${plural(made, 'part')} Brick Architect doesn't have got an app-made label.` : '');
}

// Without the relay: combine label files picked from the phone, in drawer order,
// with app-made labels for parts Brick Architect doesn't have.
async function combineFiles(files, parts) {
  const order = new Map(parts.map((p, i) => [labelNumber(p), i]));
  const pieces = [];
  try {
    for (const file of files) {
      const key = file.name.replace(/\.lbx$/i, '').replace(/\s*\(\d+\)$/, ''); // "3001 (1).lbx" from a second download
      pieces.push(await lbxPiece(new Uint8Array(await file.arrayBuffer()), { key, measure: measureText }));
    }
  } catch (err) {
    toast(err.message);
    return;
  }
  for (const p of parts.filter((x) => x.baLabel === 'no')) pieces.push(appPiece(p, measureText));
  const rank = (piece) => order.get(piece.key) ?? parts.length;
  pieces.sort((a, b) => rank(a) - rank(b));
  const unique = [...new Map(pieces.map((p) => [p.key, p])).values()];
  showPrintStrips(makeStrips(unique));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function renderLabels({ params }) {
  const source = params.get('unit') ?? 'queue';
  const style = params.get('style') ?? 'ba';
  const queue = store.state.slots.filter((s) => s.needsLabel);
  const slots =
    source === 'queue'
      ? queue
      : store.state.slots.filter((s) => s.unitId === source && (s.partNums.length || s.label));
  slots.sort((a, b) => store.codeOf(a).localeCompare(store.codeOf(b), undefined, { numeric: true }));
  const link = (patch) => {
    const qs = new URLSearchParams({ unit: source, style, ...patch });
    return `#/labels?${qs}`;
  };
  // Brick Architect labels are per part: one file for each part in each slot.
  // Parts Brick Architect doesn't have get an app-made label instead.
  const partOf = (n) => store.getPart(n) ?? { partNum: n, altNums: [], name: '', baLabel: '' };
  const baParts = [
    ...new Map(slots.flatMap((s) => s.partNums.map(partOf)).map((p) => [labelNumber(p), p])).values(),
  ];
  const appParts = baParts.filter((p) => p.baLabel === 'no');
  const lbxParts = baParts.filter((p) => p.baLabel !== 'no');
  const printed = new Set(readLocal(PRINTED_KEY, []));

  const baStatus = (p) =>
    p.baLabel === 'yes'
      ? '<span>✓ on Brick Architect</span>'
      : baCheck.state === 'blocked' || baCheck.asked.has(labelNumber(p))
        ? ''
        : '<span class="muted">checking…</span>';
  const baRow = (s, p) =>
    p.baLabel === 'no'
      ? `<li class="part"><div class="part-link"><span class="slot-badge">${esc(store.codeOf(s))}</span>
          <div><div class="part-title">${esc(p.name || 'Unnamed part')}</div>
          <div class="part-meta"><span>#${esc(p.partNum)}</span><span>app-made label</span></div></div></div>
          <div class="part-slots"><button class="small" data-ba="" data-num="${esc(p.partNum)}" title="Brick Architect does have it">↩︎ Brick Architect</button></div></li>`
      : `<li class="part ba-row ${printed.has(labelNumber(p)) ? 'done' : ''}"><div class="part-link"><span class="slot-badge">${esc(store.codeOf(s))}</span>
          <div><div class="part-title">${esc(p.name || 'Unnamed part')}</div>
          <div class="part-meta"><span>#${esc(labelNumber(p))}.lbx</span>${baStatus(p)}</div></div></div>
          <div class="part-slots">${baLabelLink(p, '⬇️ Label')}
            <button class="small" data-ba="no" data-num="${esc(p.partNum)}" title="Brick Architect doesn't have this label">✗ Missing</button>
            <input type="checkbox" class="tick" data-label="${esc(labelNumber(p))}" ${printed.has(labelNumber(p)) ? 'checked' : ''} aria-label="Printed" title="Printed" /></div></li>`;

  view.innerHTML = `
    <div class="no-print">
      <h2>Labels</h2>
      <div class="card">
        <label style="margin-top:0">Which slots?</label>
        <div class="chips wrap">
          <a class="chip ${source === 'queue' ? 'active' : ''}" href="${link({ unit: 'queue' })}">Needs a label (${queue.length})</a>
          ${store.state.units
            .map((u) => `<a class="chip ${source === u.id ? 'active' : ''}" href="${link({ unit: u.id })}">${esc(u.code)} · ${esc(u.name)}</a>`)
            .join('')}
        </div>
        <label>Style</label>
        <div class="chips wrap">
          <a class="chip ${style === 'ba' ? 'active' : ''}" href="${link({ style: 'ba' })}">Brick Architect</a>
          <a class="chip ${style === 'full' ? 'active' : ''}" href="${link({ style: 'full' })}">Full label</a>
          <a class="chip ${style === 'code' ? 'active' : ''}" href="${link({ style: 'code' })}">Code sticker only</a>
        </div>
        <p class="muted">${
          style === 'ba'
            ? 'Official Brick Architect labels (12 mm), one per part: open each .lbx file in the Brother app to print. Parts Brick Architect doesn\'t have get an app-made label with the part number and name.'
            : style === 'code'
              ? 'Small stickers with just the slot code.'
              : 'Slot code, part names and numbers (and pictures, when a part has one).'
        }</p>
        <div class="actions">
          ${
            style === 'ba'
              ? `<button class="primary" id="ba-all" ${lbxParts.length ? '' : 'disabled'}>⬇️ Download ${plural(lbxParts.length, 'label')}</button>`
              : `<button class="primary" id="print" ${slots.length ? '' : 'disabled'}>🖨️ Print ${plural(slots.length, 'label')}</button>`
          }
          ${source === 'queue' && slots.length ? '<button id="done">✓ Mark as labeled</button>' : ''}
        </div>
      </div>
    </div>
    ${
      style === 'ba' && baCheck.state === 'blocked' && lbxParts.some((p) => !p.baLabel)
        ? `<p class="muted no-print">Brick Architect doesn't let the app check which labels it has from this browser. If a
            label won't download (Brick Architect says "not found"), tap <strong>✗ Missing</strong> and the app makes one instead.</p>`
        : ''
    }
    ${
      style === 'ba' && baParts.length
        ? `<div class="card">
            <h3 style="margin-top:0">Print in batches</h3>
            ${
              LABEL_RELAY_URL
                ? `<p class="muted" style="margin-top:0">Puts all ${plural(baParts.length, 'label')} on strips of up to 10 (under
                    28 cm each), in drawer order: Brick Architect's labels, and app-made ones for parts it doesn't have.
                    Open each strip in the Brother app, print once, then cut at the | marks.</p>
                   <div class="actions"><button class="primary" id="make-print">🖨️ Make print files</button></div>`
                : `<p class="muted" style="margin-top:0">Download the Brick Architect labels, then pick them all here: the app puts
                    them on strips of up to 10 (under 28 cm each), with the app-made labels below, so each strip prints in one go.</p>
                   <label class="btn" for="combine-files">📂 Combine downloaded labels</label>
                   <input type="file" id="combine-files" multiple hidden />`
            }
            <div id="print-out"></div>
          </div>`
        : ''
    }
    ${
      style === 'ba' && appParts.length && !LABEL_RELAY_URL
        ? `<div class="card">
            <h3 style="margin-top:0">App-made labels (${appParts.length})</h3>
            <p class="muted" style="margin-top:0">Brick Architect doesn't have these, so the app makes label files with the part
              number and name. Each file holds up to 10 parts on one strip (under 28 cm), so it prints in one go: open it in the
              Brother app, print, then cut at the | marks.</p>
            <div class="app-labels" id="app-labels"></div>
          </div>`
        : ''
    }
    ${
      slots.length && style === 'ba'
        ? `<div class="card ba-list" style="padding:0"><ul class="part-list">${slots
            .filter((s) => s.partNums.length)
            .map((s) => s.partNums.map(partOf).map((p) => baRow(s, p)).join(''))
            .join('')}</ul></div>`
        : slots.length
        ? `<div class="labels ${style === 'code' ? 'codes' : ''}">${slots.map((s) => labelHtml(s, style)).join('')}</div>`
        : '<div class="card empty no-print">No slots to label here. Slots are added to "Needs a label" when you put parts in them.</div>'
    }
  `;
  view.querySelector('#print')?.addEventListener('click', () => window.print());
  view.querySelector('#ba-all')?.addEventListener('click', () => {
    // Hidden frames download each file without opening a tab per label (pop-up blockers stop those).
    lbxParts.forEach((p, i) =>
      setTimeout(() => {
        const frame = Object.assign(document.createElement('iframe'), { src: brickArchitectLabelUrl(p), hidden: true });
        document.body.append(frame);
        setTimeout(() => frame.remove(), 60000);
      }, i * 600),
    );
    toast(`Downloading ${plural(lbxParts.length, 'label')}… your browser may ask to allow several downloads.`);
  });
  view.querySelectorAll('[data-ba]').forEach((btn) =>
    btn.addEventListener('click', () => {
      store.setBaLabel(btn.dataset.num, btn.dataset.ba);
      if (btn.dataset.ba === '') baCheck.asked.add(labelNumber(store.getPart(btn.dataset.num)));
      renderLabels({ params });
    }),
  );
  view.querySelectorAll('.ba-row .tick').forEach((box) =>
    box.addEventListener('change', () => {
      if (box.checked) printed.add(box.dataset.label);
      else printed.delete(box.dataset.label);
      box.closest('.ba-row').classList.toggle('done', box.checked);
      writeLocal(PRINTED_KEY, [...printed]);
    }),
  );
  view.querySelector('#done')?.addEventListener('click', () => {
    slots.forEach((s) => store.updateSlot(s.id, { needsLabel: false }));
    writeLocal(PRINTED_KEY, [...printed].filter((n) => !baParts.some((p) => labelNumber(p) === n)));
    toast('Marked as labeled');
    renderLabels({ params });
  });
  view.querySelector('#make-print')?.addEventListener('click', (e) => makePrintFiles(baParts, e.target));
  view.querySelector('#combine-files')?.addEventListener('change', (e) => combineFiles([...e.target.files], baParts));
  if (style === 'ba') {
    if (appParts.length && !LABEL_RELAY_URL) {
      const box = view.querySelector('#app-labels');
      const { html, files } = appLabelsHtml(appParts);
      box.innerHTML = html;
      wireAppLabels(box, files);
    }
    checkLabels(lbxParts);
  }
}

// ---------- Check storage ----------

const REPORT_OK_KEY = 'brick-finder:report-ok'; // findings marked "that's on purpose" on this phone

function renderCheck() {
  const ok = new Set(readLocal(REPORT_OK_KEY, []));
  const report = storageReport(store);
  const open = (list) => list.filter((x) => !ok.has(x.key));
  const versions = open(report.versions);
  const spread = open(report.spread);
  const twins = report.twins;
  const hidden = report.versions.length + report.spread.length - versions.length - spread.length;
  const partLink = (p) => `<a href="${partHref(p.partNum)}">#${esc(p.partNum)}</a>${p.name ? ` ${esc(p.name)}` : ''}`;
  const gatherButtons = (key, slots) =>
    slots
      .map((s) => `<button type="button" class="small" data-gather="${esc(key)}" data-to="${esc(s.id)}">All in ${esc(store.codeOf(s))}</button>`)
      .join('');
  const section = (title, intro, items) =>
    items.length ? `<div class="card"><h3 style="margin-top:0">${title} (${items.length})</h3><p class="muted">${intro}</p>${items.join('')}</div>` : '';

  view.innerHTML = `
    <h2>Check storage</h2>
    ${
      versions.length + spread.length + twins.length
        ? ''
        : '<div class="card empty">✓ Nothing to tidy: no versions apart, no part in two places, no part listed twice.</div>'
    }
    ${section(
      'Versions of one part in different drawers',
      'These look the same (e.g. 3942a and 3942c), so they\'re easier to find together.',
      versions.map(
        (v) => `<div class="finding">
          <ul class="finding-list">${v.members
            .map((m) => `<li>${partLink(m.part)} <span class="muted">in</span> ${m.slots.map(slotBadge).join(' ')}</li>`)
            .join('')}</ul>
          <div class="actions">${gatherButtons(v.key, v.slots)}<button type="button" class="small" data-ok="${esc(v.key)}">Keep apart</button></div>
        </div>`,
      ),
    )}
    ${section(
      'The same part in more than one drawer',
      'Fine if one is an overflow drawer: tap "That\'s on purpose" and it won\'t be listed again.',
      spread.map(
        (x) => `<div class="finding">
          <div>${partLink(x.part)} <span class="muted">in</span> ${x.slots.map(slotBadge).join(' ')}</div>
          <div class="actions">${gatherButtons(x.key, x.slots)}<button type="button" class="small" data-ok="${esc(x.key)}">That's on purpose</button></div>
        </div>`,
      ),
    )}
    ${section(
      'One part listed twice',
      'These share a part number. Merging keeps the first, with the other\'s numbers as alternates; drawers keep their parts.',
      twins.map(
        (t) => `<div class="finding">
          <div>${partLink(t.parts[0])} <span class="muted">and</span> ${partLink(t.parts[1])} <span class="muted">share #${esc(t.shared.join(', #'))}</span></div>
          <div class="actions"><button type="button" class="small" data-merge="${esc(t.parts[0].partNum)}" data-drop="${esc(t.parts[1].partNum)}">Merge into #${esc(t.parts[0].partNum)}</button></div>
        </div>`,
      ),
    )}
    ${hidden ? `<p class="muted">${hidden} marked as on purpose. <button type="button" class="small" id="unhide">Show them again</button></p>` : ''}
  `;

  const findings = new Map([...report.versions, ...report.spread].map((x) => [x.key, x]));
  view.querySelectorAll('[data-gather]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const finding = findings.get(btn.dataset.gather);
      const nums = finding.members ? finding.members.map((m) => m.part.partNum) : [finding.part.partNum];
      store.gatherParts(nums, btn.dataset.to);
      toast(`Now all in ${store.codeOf(store.getSlot(btn.dataset.to))}: move the pieces there too`);
      renderCheck();
    }),
  );
  view.querySelectorAll('[data-ok]').forEach((btn) =>
    btn.addEventListener('click', () => {
      writeLocal(REPORT_OK_KEY, [...ok, btn.dataset.ok]);
      renderCheck();
    }),
  );
  view.querySelectorAll('[data-merge]').forEach((btn) =>
    btn.addEventListener('click', () => {
      store.mergeParts(btn.dataset.merge, btn.dataset.drop);
      toast('Merged');
      renderCheck();
    }),
  );
  view.querySelector('#unhide')?.addEventListener('click', () => {
    writeLocal(REPORT_OK_KEY, []);
    renderCheck();
  });
}

// ---------- Family sharing ----------

const sharing = {
  conn: null, // Firebase connection, loaded only when needed
  loading: null,
  user: undefined, // undefined = not known yet, null = signed out
  sync: null,
  status: null, // { state, error? } from the sync engine
  error: '',
  linkInfo: null, // first-time comparison of this phone vs the shared copy
};
let refreshPending = false;

function sharingLinked() {
  return Boolean(store.state.settings.syncLinked);
}

function updateSyncBadge() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  let icon = '';
  let title = '';
  if (sharingLinked()) {
    if (sharing.user === null) [icon, title] = ['⚠️', 'Signed out: changes are not shared'];
    else if (sharing.status?.state === 'error') [icon, title] = ['⚠️', sharing.error];
    else if (sharing.status?.state === 'saving') [icon, title] = ['⏳', 'Saving to the family catalog…'];
    else if (sharing.status?.state === 'synced') [icon, title] = ['☁️', 'Shared with the family'];
  }
  el.textContent = icon;
  el.title = title;
  el.hidden = !icon;
}

// Another phone changed something: redraw, unless someone is typing or reviewing a photo.
function refreshForRemote() {
  if (parseRoute().name === 'scan') return;
  const active = document.activeElement;
  if (active && view.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
    refreshPending = true;
    return;
  }
  render();
}

function connectSharing() {
  if (!FIREBASE_CONFIG) return Promise.resolve(null);
  sharing.loading ??= connectFirebase(FIREBASE_CONFIG, FAMILY_ID)
    .then((conn) => {
      sharing.conn = conn;
      conn.onUser((user) => {
        sharing.user = user;
        sharing.sync?.stop();
        sharing.sync = null;
        sharing.linkInfo = null;
        if (user && sharingLinked()) {
          sharing.sync = newSync();
          sharing.sync.resume();
        }
        updateSyncBadge();
        if (parseRoute().name === 'settings') renderSettings();
      });
      return conn;
    })
    .catch((err) => {
      sharing.error = syncErrorMessage(err);
      sharing.loading = null;
      updateSyncBadge();
      return null;
    });
  return sharing.loading;
}

function newSync() {
  return createSync(store, sharing.conn.backend, {
    onStatus: (status) => {
      sharing.status = status;
      sharing.error = status.error ? syncErrorMessage(status.error) : '';
      updateSyncBadge();
      if (parseRoute().name === 'settings' && document.getElementById('share-status')) {
        document.getElementById('share-status').textContent = sharingStatusText();
      }
    },
    onRemoteChange: refreshForRemote,
  });
}

function sharingStatusText() {
  if (sharing.error) return `⚠️ ${sharing.error}`;
  if (sharing.status?.state === 'saving') return '⏳ Saving…';
  return navigator.onLine === false ? "📴 Offline: changes will sync when you're back online." : '☁️ Up to date.';
}

function sharingCardHtml() {
  const head = '<h3 style="margin-top:0">Family sharing</h3>';
  if (!FIREBASE_CONFIG) {
    return `${head}<p class="muted">Sharing isn't set up yet. Once the family's Firebase project is connected
      (see "Family sharing" in the README), everyone signs in here and sees the same catalog.</p>`;
  }
  if (!sharing.conn) {
    return `${head}<p class="muted">Share one catalog with the family: sign in with Google and every change
      shows up on everyone's phone.</p>
      ${sharing.error ? `<p class="notice">⚠️ ${esc(sharing.error)}</p>` : ''}
      <div class="actions"><button class="primary" id="share-start">Set up sharing on this phone</button></div>`;
  }
  if (!sharing.user) {
    return `${head}<p class="muted">${sharingLinked() ? 'This phone is signed out, so changes are not being shared.' : 'Sign in with a family Google account.'}</p>
      ${sharing.error ? `<p class="notice">⚠️ ${esc(sharing.error)}</p>` : ''}
      <div class="actions"><button class="primary" id="share-signin">Sign in with Google</button></div>`;
  }
  const who = `<p>Signed in as <strong>${esc(sharing.user.email)}</strong></p>`;
  const signOut = `<button id="share-signout">${sharingLinked() ? 'Sign out and stop sharing on this phone' : 'Sign out'}</button>`;
  if (sharingLinked()) {
    return `${head}${who}<p id="share-status">${esc(sharingStatusText())}</p><div class="actions">${signOut}</div>`;
  }
  const info = sharing.linkInfo;
  if (!info) return `${head}${who}<p class="muted">Checking the family catalog…</p><div class="actions">${signOut}</div>`;
  if (info.error) return `${head}${who}<p class="notice">⚠️ ${esc(info.error)}</p><div class="actions">${signOut}</div>`;
  const mine = `${store.state.units.length} storage units and ${store.state.parts.length} parts`;
  const theirs = `${info.remote.units.length} storage units and ${info.remote.parts.length} parts`;
  let choice;
  if (info.remoteEmpty) {
    choice = `<p>The family catalog is empty. Start it with this phone's catalog (${mine}).</p>
      <div class="actions"><button class="primary" data-link="combine">Start sharing</button>${signOut}</div>`;
  } else if (info.localEmpty) {
    choice = `<p>The family catalog has ${theirs}.</p>
      <div class="actions"><button class="primary" data-link="shared">Use the family catalog</button>${signOut}</div>`;
  } else {
    choice = `<p>The family catalog has ${theirs}. This phone has ${mine}.</p>
      <div class="actions">
        <button class="primary" data-link="combine">Combine them</button>
        <button data-link="shared">Use the family catalog (replace this phone's)</button>
        ${signOut}
      </div>`;
  }
  return `${head}${who}${choice}`;
}

function wireSharingCard() {
  view.querySelector('#share-start')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Loading…';
    await connectSharing();
    renderSettings();
  });
  view.querySelector('#share-signin')?.addEventListener('click', async () => {
    try {
      await sharing.conn.signIn();
    } catch (err) {
      sharing.error = syncErrorMessage(err);
      renderSettings();
    }
  });
  view.querySelector('#share-signout')?.addEventListener('click', async () => {
    sharing.sync?.stop();
    sharing.sync = null;
    store.updateSettings({ syncLinked: false });
    await sharing.conn.signOut();
    toast('Signed out. This phone keeps its own copy.');
  });
  view.querySelectorAll('[data-link]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.link;
      if (mode === 'shared' && store.state.parts.length && !confirm("Replace this phone's catalog with the family catalog?")) return;
      view.querySelectorAll('[data-link]').forEach((b) => (b.disabled = true));
      try {
        sharing.sync = newSync();
        await sharing.sync.link(mode, sharing.linkInfo.remote);
        toast('Sharing is on');
      } catch (err) {
        sharing.sync?.stop();
        sharing.sync = null;
        toast(syncErrorMessage(err));
      }
      sharing.linkInfo = null;
      updateSyncBadge();
      renderSettings();
    }),
  );
  // First sign-in on this phone: compare with the shared copy before linking.
  if (sharing.user && !sharingLinked() && !sharing.linkInfo) {
    createSync(store, sharing.conn.backend)
      .inspect()
      .then((info) => (sharing.linkInfo = info))
      .catch((err) => (sharing.linkInfo = { error: syncErrorMessage(err) }))
      .then(() => parseRoute().name === 'settings' && renderSettings());
  }
}

// ---------- Settings ----------

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderSettings() {
  view.innerHTML = `
    <h2>Settings</h2>
    <div class="card" id="share-card">${sharingCardHtml()}</div>
    <div class="card">
      <h3 style="margin-top:0">Share with the family</h3>
      <p class="muted">The catalog is saved on this device. Export a file and open it on another
        phone or tablet (via email, AirDrop, Google Drive…) to share. <strong>Merge</strong> keeps both
        sets of changes; <strong>Replace</strong> overwrites this device.</p>
      <div class="actions">
        <button id="export" class="primary">⬇️ Export catalog</button>
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
      <p class="muted">Photo identification works without setup. To look up any part by number or name,
        create a free account at rebrickable.com → Settings → API and paste your key here.
        The key stays on this device and is never included in exports.</p>
      <label for="rbKey">Rebrickable API key</label>
      <input id="rbKey" name="rebrickableKey" value="${esc(store.state.settings.rebrickableKey)}" autocomplete="off" />
      ${(() => {
        const unnamed = store.state.parts.filter((p) => !p.name).length;
        return unnamed
          ? `<p class="muted" style="margin-bottom:0">${unnamed} part${unnamed === 1 ? ' has' : 's have'} no name yet.
              <button type="button" class="small" id="fill-names" ${store.state.settings.rebrickableKey ? '' : 'disabled'}>Look up missing names</button></p>`
          : '';
      })()}
      <h3>Reading cabinets from photos</h3>
      <p class="muted">Adding a storage unit from a photo uses Claude to read the drawer labels. Create an API key at
        console.anthropic.com → API keys and paste it here. Each photo costs roughly 10–20¢. The key stays on this
        device and is never included in exports; each family member who scans adds their own.</p>
      <label for="anKey">Anthropic API key</label>
      <input id="anKey" name="anthropicKey" value="${esc(store.state.settings.anthropicKey)}" autocomplete="off" placeholder="sk-ant-…" />
      <div class="actions"><button class="primary">Save</button></div>
    </form>
    <div class="card">
      <h3 style="margin-top:0">Data</h3>
      <div class="actions">
        <button id="sample">🧪 Load sample data</button>
        <button id="reset" class="danger">Erase catalog on this device</button>
      </div>
    </div>
  `;

  view.querySelector('#export').addEventListener('click', () => {
    download(`lego-catalog-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON());
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
  view.querySelector('#fill-names')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const named = await fillNamesOnline(
        store.state.parts.filter((p) => !p.name),
        (i, n) => (e.target.textContent = `Looking up ${i} of ${n}…`),
      );
      toast(`Named ${named} part${named === 1 ? '' : 's'}`);
    } catch (err) {
      toast(err.message);
    }
    renderSettings();
  });
  view.querySelector('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.updateSettings({
      rebrickableKey: view.querySelector('#rbKey').value.trim(),
      anthropicKey: view.querySelector('#anKey').value.trim(),
    });
    toast('Saved');
  });
  wireSharingCard();
  view.querySelector('#sample').addEventListener('click', () => {
    const where = sharingLinked() ? 'the family catalog (everyone will see them)' : 'your catalog';
    if ((store.state.parts.length || sharingLinked()) && !confirm(`Add the sample storage units and parts to ${where}?`)) return;
    store.importJSON(JSON.stringify(SAMPLE), { merge: true });
    toast('Sample data loaded');
  });
  view.querySelector('#reset').addEventListener('click', () => {
    const message = sharingLinked()
      ? 'Erase ALL storage units, slots and parts from the family catalog, for everyone? Export first if you want a backup.'
      : 'Erase all storage units, slots and parts on this device? Export first if you want a backup.';
    if (!confirm(message)) return;
    store.reset();
    toast('Catalog erased');
  });
}

// ---------- router ----------

const routes = {
  find: renderFind,
  identify: renderIdentify,
  part: renderPart,
  storage: renderStorage,
  scan: renderScan,
  unit: renderUnit,
  slot: renderSlot,
  labels: renderLabels,
  build: renderBuild,
  check: renderCheck,
  settings: renderSettings,
};
const TAB_FOR = { part: 'find', unit: 'storage', slot: 'storage', scan: 'storage', check: 'storage' };

function render() {
  const route = parseRoute();
  const fn = routes[route.name] ?? renderFind;
  const tab = TAB_FOR[route.name] ?? route.name;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  fn(route);
  updateSummary();
}

store.subscribe(updateSummary);
window.addEventListener('hashchange', () => {
  refreshPending = false;
  render();
  window.scrollTo(0, 0);
});
view.addEventListener('focusout', () => {
  if (!refreshPending) return;
  refreshPending = false;
  setTimeout(refreshForRemote, 0);
});
window.addEventListener('online', updateSyncBadge);
window.addEventListener('offline', updateSyncBadge);
render();
view.dataset.started = '1'; // index.html stops watching for a failed start
// Phones already sharing reconnect at startup; others load Firebase only if they open sharing.
if (sharingLinked()) connectSharing();
