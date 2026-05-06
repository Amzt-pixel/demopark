// ════════════════════════════════════════════
// app.js — CRUD Panel
// Depends on: state.js, data.js (load first)
// ════════════════════════════════════════════

'use strict';

// ── UI State ───────────────────────────────
let selectedUids    = new Set();
let holdTimer       = null;
let holdFired       = false;
let currentFilters  = {};
let currentSort     = 'word_asc';
let filteredList    = [];

// Map panel state
let mapOpenCardId   = null;
let mapSelectedRefs = new Set();

// Create tab counters
let exCount = 1;
let bCount  = 1;

let _toastTimer;

// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════
function showToast(msg, type = '') {
  const el = document.getElementById('toastEl');
  el.textContent = msg;
  el.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
window.addEventListener('load', () => {
  if (isLoggedIn()) {
    showScreen('crudScreen');
    updateBadge();
    updateMenuState();
    initData();
  }
  bindModalOverlayClose();
});

async function initData() {
  showLoading('Loading words from GitHub…');
  try {
    const rows = await loadFromGitHub();
    buildDataList(rows);
    hideLoading();
    applyAndRender();
    updateSyncLabel();
    showToast('✓ ' + dataList.length + ' words loaded', 'success');
  } catch (err) {
    console.warn('GitHub fetch failed:', err);
    hideLoading();
    showToast('GitHub unavailable — upload CSV in Transport', 'error');
    renderTiles([]);
    updateViewCount(0, 0);
  }
}

// ════════════════════════════════════════════
// LOADING
// ════════════════════════════════════════════
function showLoading(msg) {
  const el = document.getElementById('loadingOverlay');
  if (!el) return;
  el.classList.remove('hidden');
  const txt = document.getElementById('loadingText');
  if (txt) txt.textContent = msg || 'Loading…';
}
function hideLoading() {
  document.getElementById('loadingOverlay')?.classList.add('hidden');
}
function updateSyncLabel() {
  const el = document.getElementById('syncLabel');
  if (!el || !lastSyncedAt) return;
  el.textContent = 'Synced ' + lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ════════════════════════════════════════════
// SCREENS
// ════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ════════════════════════════════════════════
// GATE
// ════════════════════════════════════════════
function unlockAdmin() {
  const val = document.getElementById('gateInput').value;
  if (!val.trim()) {
    const err = document.getElementById('gateError');
    err.classList.remove('hidden');
    setTimeout(() => err.classList.add('hidden'), 2500);
    return;
  }
  setSession();
  showScreen('crudScreen');
  updateBadge();
  updateMenuState();
  initData();
}

document.getElementById('gateInput')
  .addEventListener('keydown', e => { if (e.key === 'Enter') unlockAdmin(); });

function toggleEye() {
  const i = document.getElementById('gateInput');
  i.type = i.type === 'password' ? 'text' : 'password';
}

// ════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════
function goToCommits() { window.location.href = '../commits/'; }

// ════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════
function switchTab(name, btn) {
  document.querySelectorAll('.crud-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.crud-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

// ════════════════════════════════════════════
// BADGE
// ════════════════════════════════════════════
function updateBadge() {
  const n     = getPendingCount();
  const badge = document.getElementById('commitBadge');
  if (!badge) return;
  badge.textContent   = n;
  badge.style.display = n > 0 ? 'flex' : 'none';
}

// ════════════════════════════════════════════
// TILE RENDERING
// ════════════════════════════════════════════
function applyAndRender() {
  filteredList = applyFilters(dataList, currentFilters);
  filteredList = applySort(filteredList, currentSort);
  renderTiles(filteredList);
  updateViewCount(filteredList.length, dataList.length);
}

function renderTiles(entries) {
  const container = document.getElementById('wordTilesList');
  const empty     = document.getElementById('viewEmpty');
  if (!container) return;
  container.innerHTML = '';
  if (entries.length === 0) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  const frag = document.createDocumentFragment();
  entries.forEach(e => frag.appendChild(buildTile(e)));
  container.appendChild(frag);
}

function buildTile(entry) {
  const tile = document.createElement('div');

  const badgeClass = entry.category === 2 ? 'badge-idiom'
                   : entry.category === 3 ? 'badge-phrasal'
                   : 'badge-word';

  let tileClass = 'word-tile';
  if (entry.isInvalid)       tileClass += ' invalid-tile';
  else if (entry.isInactive) tileClass += ' inactive-tile';
  if (selectedUids.has(String(entry.uid))) tileClass += ' selected';

  const meta      = buildTileMeta(entry);
  const indStr    = meta.indicators
    .map(ind => ind.active
      ? ind.key
      : `<span class="meta-dim">${ind.key}</span>`)
    .join(' | ');
  const metaStr   = `${meta.label} | ${indStr}`;

  const numidDisplay = entry.numid < 0 ? '−' + Math.abs(entry.numid) : String(entry.numid);

  tile.className     = tileClass;
  tile.dataset.uid   = entry.uid;
  tile.dataset.word  = entry.word;
  tile.dataset.numid = entry.numid;
  tile.dataset.cat   = entry.categoryLabel;
  tile.dataset.label = entry.usageLabel !== 'Common' ? entry.usageLabel : '';
  tile.dataset.def   = entry.definition1;
  tile.dataset.note  = entry.review_note ? '1' : '0';

  tile.innerHTML = `
    <div class="tile-inner">
      <div class="tile-body">
        <div class="tile-line1">
          <span class="tile-word${entry.isInvalid ? ' invalid' : ''}">${escHtml(entry.word)}${entry.isInvalid ? ' ⚠' : ''}</span>
          <span class="tile-numid-wrap">
            <span class="tile-bracket">[</span>
            <span class="tile-numid"${entry.isInvalid ? ' style="color:var(--warn)"' : ''}>${escHtml(numidDisplay)}</span>
            <span class="tile-bracket">]</span>
          </span>
        </div>
        <div class="tile-line2"><span class="tile-meta-text">${metaStr}</span></div>
      </div>
      <div class="tile-right">
        ${entry.review_note ? '<span class="tile-note-icon">📌</span>' : ''}
        <span class="tile-badge ${badgeClass}">${entry.categoryLabel}</span>
        <div class="tile-check">✓</div>
      </div>
    </div>`;

  tile.addEventListener('mousedown',  () => startHold(tile));
  tile.addEventListener('touchstart', () => startHold(tile), { passive: true });
  tile.addEventListener('mouseup',    cancelHold);
  tile.addEventListener('mouseleave', cancelHold);
  tile.addEventListener('touchend',   cancelHold);
  tile.addEventListener('click',      () => onTileClick(tile));
  return tile;
}

function updateViewCount(shown, total) {
  const el = document.getElementById('viewCount');
  if (!el) return;
  el.textContent = shown === total
    ? total.toLocaleString() + ' words'
    : shown.toLocaleString() + ' of ' + total.toLocaleString() + ' words';
}

// ════════════════════════════════════════════
// TILE SELECTION
// ════════════════════════════════════════════
function onTileClick(tile) {
  if (holdFired) { holdFired = false; return; }
  const uid = tile.dataset.uid;
  if (selectedUids.has(uid)) {
    selectedUids.delete(uid);
    tile.classList.remove('selected');
  } else {
    selectedUids.add(uid);
    tile.classList.add('selected');
  }
  updateSelectionLabel();
  updateMenuState();
}

function updateSelectionLabel() {
  const lbl = document.getElementById('selectedLabel');
  if (!lbl) return;
  if (selectedUids.size === 1)      { lbl.textContent = getFirstSelectedWord(); lbl.classList.add('show'); }
  else if (selectedUids.size > 1)   { lbl.textContent = selectedUids.size + ' selected'; lbl.classList.add('show'); }
  else                               { lbl.classList.remove('show'); }
}

function getFirstSelectedTile() {
  if (!selectedUids.size) return null;
  return document.querySelector(`.word-tile[data-uid="${[...selectedUids][0]}"]`);
}
function getFirstSelectedWord()  { return getFirstSelectedTile()?.dataset.word  || ''; }
function getFirstSelectedNumid() { return getFirstSelectedTile()?.dataset.numid || ''; }
function getFirstSelectedEntry() {
  const tile = getFirstSelectedTile();
  return tile ? getEntryByUid(parseInt(tile.dataset.uid)) : null;
}
function getSelectionMode() {
  return selectedUids.size === 0 ? 'none' : selectedUids.size === 1 ? 'single' : 'multi';
}

// ════════════════════════════════════════════
// HOLD POPUP
// ════════════════════════════════════════════
function startHold(tile) {
  holdFired = false;
  holdTimer = setTimeout(() => { holdFired = true; holdTimer = null; showHoldPopup(tile); }, 500);
}
function cancelHold() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
}
function showHoldPopup(tile) {
  document.getElementById('popupWord').textContent = tile.dataset.word;
  document.getElementById('popupMeta').textContent = tile.dataset.cat + ' · NumId ' + tile.dataset.numid;
  document.getElementById('popupDef').textContent  = tile.dataset.def || 'No definition available.';
  document.getElementById('holdOverlay').classList.add('open');
}
function closeHoldPopup() {
  document.getElementById('holdOverlay').classList.remove('open');
}

// ════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════
function filterView(q) {
  currentFilters.search = q.trim();
  applyAndRender();
}

// ════════════════════════════════════════════
// MENU — context-sensitive
// ════════════════════════════════════════════
const MENU_VISIBILITY = {
  menuAdd:     ['none', 'single', 'multi'],
  menuEdit:    ['single'],
  menuUpdate:  ['single'],
  menuRename:  ['single'],
  menuRegroup: ['single', 'multi'],
  menuMapBtn:  ['single', 'multi'],
  menuDisable: ['single', 'multi'],
  menuTrash:   ['single', 'multi'],
};

function updateMenuState() {
  const mode = getSelectionMode();
  Object.entries(MENU_VISIBILITY).forEach(([id, allowed]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = allowed.includes(mode) ? '' : 'none';
  });
  const desc = document.getElementById('mapMenuDesc');
  if (desc) {
    if      (mode === 'none')   desc.textContent = 'Select a word first';
    else if (mode === 'single') desc.textContent = 'Managing: ' + getFirstSelectedWord();
    else                        desc.textContent = selectedUids.size + ' words selected';
  }
}

function openMenu() {
  updateMenuState();
  document.getElementById('sidebarOverlay').classList.add('open');
  document.getElementById('crudMenuSidebar').classList.add('open');
}
function closeMenu() {
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.getElementById('crudMenuSidebar').classList.remove('open');
}

// ════════════════════════════════════════════
// OPTIONS SHEET
// ════════════════════════════════════════════
function openOptions()  {
  document.getElementById('optionsOverlay').classList.add('open');
  document.getElementById('optionsSheet').classList.add('open');
}
function closeOptions() {
  document.getElementById('optionsOverlay').classList.remove('open');
  document.getElementById('optionsSheet').classList.remove('open');
}
function toggleChip(chip) { chip.classList.toggle('active'); }
function selectSort(opt) {
  document.querySelectorAll('.sort-option').forEach(s => s.classList.remove('active'));
  opt.classList.add('active');
}

function applyOptions() {
  currentFilters.category      = document.querySelector('#filterCategory .opt-chip.active')?.dataset.value || 'all';
  currentFilters.usage         = document.querySelector('#filterUsage .opt-chip.active')?.dataset.value    || 'all';
  currentFilters.onlyDefs      = !!document.querySelector('[data-cond="onlyDefs"].active');
  currentFilters.noExamples    = !!document.querySelector('[data-cond="noExamples"].active');
  currentFilters.reviewNote    = !!document.querySelector('[data-cond="reviewNote"].active');
  currentFilters.invalid       = !!document.querySelector('[data-cond="invalid"].active');
  currentFilters.inactive      = !!document.querySelector('[data-cond="inactive"].active');
  currentFilters.hasTranslation= !!document.querySelector('[data-cond="hasTranslation"].active');
  currentFilters.isolated      = !!document.querySelector('[data-cond="isolated"].active');
  currentFilters.numidMin      = document.getElementById('filterNumidMin')?.value || '';
  currentFilters.numidMax      = document.getElementById('filterNumidMax')?.value || '';
  currentSort = document.querySelector('.sort-option.active')?.dataset.sort || 'word_asc';
  closeOptions();
  applyAndRender();
}

function resetOptions() {
  currentFilters = { search: currentFilters.search || '' };
  currentSort    = 'word_asc';
  document.querySelectorAll('.opt-chip').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.opt-chip[data-value="all"]').forEach(c => c.classList.add('active'));
  document.querySelectorAll('.sort-option').forEach((s, i) => s.classList.toggle('active', i === 0));
  const min = document.getElementById('filterNumidMin'); if (min) min.value = '';
  const max = document.getElementById('filterNumidMax'); if (max) max.value = '';
  applyAndRender();
  showToast('Options reset');
}

// ════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════
const OP_MODAL_MAP = {
  add:'addModal', edit:'editModal', update:'updateModal',
  rename:'renameModal', regroup:'regroupModal',
  trash:'trashModal', disable:'disableModal',
};

function openOpModal(type) {
  const id = OP_MODAL_MAP[type];
  if (!id) return;
  prefillModal(type);
  openModal(id);
}

function prefillModal(type) {
  const entry = getFirstSelectedEntry();
  if (type === 'edit' && entry) {
    setVal('editWord', entry.word); setVal('editNumid', entry.numid);
    setVal('editRole', entry.role); setVal('editDef1', entry.definition1);
    setVal('editDef2', entry.definition2);
    setCheck('editActive', entry.active); setCheck('editReview', entry.review_note);
    setText('editModalTitle', entry.word);
  }
  if (type === 'update' && entry) {
    setVal('updateRole', entry.role); setVal('updateDef1', entry.definition1);
    setVal('updateDef2', entry.definition2);
    setText('updateModalTitle', entry.word);
  }
  if (type === 'rename' && entry) {
    setVal('renameWord', entry.word);
    setVal('renameComment', 'Renamed from: ' + entry.word);
    setText('renameCurrentLabel', 'Current: ' + entry.word);
  }
  if (type === 'regroup' && entry) {
    setText('regroupCurrentLabel', entry.word + ' · Current NumId: ' + entry.numid);
    setText('regroupHint', 'Current: ' + entry.numid + ' · Positive = syn · Negative = ant');
  }
  if (type === 'trash' && entry) {
    setText('trashModalTitle', entry.word);
    setText('trashAutoComment', 'Original numid=' + entry.numid);
  }
  if (type === 'disable' && entry) {
    setText('disableModalTitle', entry.word);
    setText('disableCurrentStatus', entry.active ? 'Currently active — visible in app' : 'Currently inactive — hidden everywhere');
    setCheck('disableActive', entry.active);
  }
  if (type === 'add') {
    setText('addGroupLabel', entry
      ? 'Adding to group of: ' + entry.word + ' [' + entry.numid + ']'
      : 'No word selected — standalone');
  }
}

function setVal(id, val)   { const el = document.getElementById(id); if (el) el.value       = val ?? ''; }
function setCheck(id, val) { const el = document.getElementById(id); if (el) el.checked     = !!val; }
function setText(id, val)  { const el = document.getElementById(id); if (el) el.textContent = val ?? ''; }
function getVal(id)        { return document.getElementById(id)?.value || ''; }

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function bindModalOverlayClose() {
  document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('click', function(e) { if (e.target === this) closeModal(this.id); });
  });
}

// ════════════════════════════════════════════
// QUEUE — from modal forms
// ════════════════════════════════════════════
function queueFromModal(type, modalId) {
  const entry = getFirstSelectedEntry();
  const word  = entry?.word  || '—';
  const numid = entry?.numid ?? null;
  const extra = {};

  if (type === 'edit')    extra.newData = { word: getVal('editWord'), numid: parseFloat(getVal('editNumid')), role: getVal('editRole'), definition1: getVal('editDef1'), definition2: getVal('editDef2'), active: document.getElementById('editActive')?.checked, review_note: document.getElementById('editReview')?.checked, comment: getVal('editComment') };
  if (type === 'update')  extra.newData = { role: getVal('updateRole'), definition1: getVal('updateDef1'), definition2: getVal('updateDef2'), comment: getVal('updateComment') };
  if (type === 'rename')  { extra.newData = { word: getVal('renameWord') };  extra.comment = getVal('renameComment'); }
  if (type === 'regroup') { extra.newData = { numid: parseFloat(getVal('regroupNumid')) }; extra.comment = getVal('regroupComment'); }
  if (type === 'trash')   { extra.newData = { numid: 0 }; extra.comment = 'Original numid=' + numid + '. ' + getVal('trashComment'); }
  if (type === 'disable') { extra.newData = { active: document.getElementById('disableActive')?.checked }; extra.comment = getVal('disableComment'); }
  if (type === 'add')     extra.newData = { word: getVal('addWord'), addAs: getVal('addAs'), category: getVal('addCategory'), comment: getVal('addComment') };

  const result = pushCommit(makeCommit(type, word, numid, extra));
  if (!result.ok) { showToast('🔴 Hard limit — review Commits', 'error'); return; }
  updateBadge();
  closeModal(modalId);
  showToast('↪ ' + capFirst(type) + ' queued', 'success');
  if (result.reason === 'soft_limit') setTimeout(() => showToast('⚠️ ' + getPendingCount() + ' pending', 'warn'), 2400);
}

function queueCreate() {
  const word  = getVal('createWord').trim();
  const numid = parseFloat(getVal('createNumid'));
  if (!word)       { showToast('Word is required', 'error'); return; }
  if (isNaN(numid)){ showToast('NumId is required', 'error'); return; }
  const ex = [...document.querySelectorAll('#examplesList textarea')].map(t => t.value.trim());
  const bx = [...document.querySelectorAll('#bengaliExList textarea')].map(t => t.value.trim());
  const result = pushCommit(makeCommit('create', word, numid, { newData: {
    word, numid,
    category: getVal('createCategory'), usage: getVal('createUsage'), role: getVal('createRole'),
    definition1: getVal('createDef1'), definition2: getVal('createDef2'),
    example1: ex[0]||'', example2: ex[1]||'', example3: ex[2]||'', example4: ex[3]||'', example5: ex[4]||'',
    bengali_def: getVal('createBengaliDef'), bengali_ex1: bx[0]||'', bengali_ex2: bx[1]||'', bengali_ex3: bx[2]||'',
    active: document.getElementById('createActive')?.checked,
    review_note: document.getElementById('createReview')?.checked,
    comment: getVal('createComment'),
  }}));
  if (!result.ok) { showToast('🔴 Hard limit — review Commits', 'error'); return; }
  updateBadge();
  showToast('↪ Create queued', 'success');
  if (result.reason === 'soft_limit') setTimeout(() => showToast('⚠️ ' + getPendingCount() + ' pending', 'warn'), 2400);
}

// ════════════════════════════════════════════
// CREATE TAB
// ════════════════════════════════════════════
function addExample() {
  if (exCount >= 5) { showToast('Maximum 5 examples'); return; }
  exCount++;
  const row = document.createElement('div');
  row.className = 'example-row';
  row.innerHTML = `<textarea class="form-input" placeholder="Example sentence ${exCount}…"></textarea><button class="example-remove" onclick="this.closest('.example-row').remove()">✕</button>`;
  document.getElementById('examplesList').appendChild(row);
}
function addBengaliExample() {
  if (bCount >= 3) { showToast('Maximum 3 Bengali examples'); return; }
  bCount++;
  const row = document.createElement('div');
  row.className = 'example-row';
  row.innerHTML = `<textarea class="form-input" placeholder="Bengali example ${bCount}…"></textarea><button class="example-remove" onclick="this.closest('.example-row').remove()">✕</button>`;
  document.getElementById('bengaliExList').appendChild(row);
}
function resetForm() {
  document.querySelectorAll('#panel-create input, #panel-create textarea, #panel-create select')
    .forEach(el => {
      if (el.type === 'checkbox') el.checked = el.id === 'createActive';
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
  document.getElementById('examplesList').innerHTML = '<div class="example-row"><textarea class="form-input" placeholder="Example sentence 1…"></textarea></div>';
  document.getElementById('bengaliExList').innerHTML = '<div class="example-row"><textarea class="form-input" placeholder="Bengali example 1…"></textarea></div>';
  exCount = 1; bCount = 1;
  showToast('Form cleared');
}

// ════════════════════════════════════════════
// TRANSPORT TAB
// ════════════════════════════════════════════
function simulateUpload() {
  document.getElementById('dropZone').style.display          = 'none';
  document.getElementById('importPreviewWrap').style.display = 'block';
}
function resetImport() {
  document.getElementById('importPreviewWrap').style.display = 'none';
  document.getElementById('dropZone').style.display          = 'block';
}
function selectFormat(chip) {
  document.querySelectorAll('.format-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
}

// ════════════════════════════════════════════
// MAP PANEL
// ════════════════════════════════════════════
function openMapPanel() {
  if (getSelectionMode() === 'none') { showToast('Select a word first', 'error'); return; }
  const tile = getFirstSelectedTile();
  if (!tile) return;

  document.getElementById('mapBaseWord').textContent = tile.dataset.word;
  document.getElementById('mapBaseMeta').textContent =
    '[' + tile.dataset.numid + '] · ' + tile.dataset.cat +
    (tile.dataset.label ? ' · ' + tile.dataset.label : '');
  document.getElementById('mapBaseDef').textContent  = tile.dataset.def || 'No definition available.';

  mapSelectedRefs.clear();
  mapOpenCardId = null;
  document.getElementById('mapRefSelectedLabel').classList.remove('show');

  const overlay = document.getElementById('mapOverlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));
  const firstTab = document.querySelector('.map-tab');
  if (firstTab) switchMapTab('list', firstTab);
  closeMenu();
}

function closeMapPanel() {
  const overlay = document.getElementById('mapOverlay');
  overlay.classList.remove('open');
  overlay.addEventListener('transitionend', () => { overlay.style.display = 'none'; }, { once: true });
  mapSelectedRefs.clear();
  mapOpenCardId = null;
  closeMapMenu();
}

function switchMapTab(name, btn) {
  document.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.map-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mpanel-' + name)?.classList.add('active');
}

function toggleMapRefSelect(id) {
  const row = document.getElementById('mrow-' + id);
  if (!row) return;
  if (mapSelectedRefs.has(id)) { mapSelectedRefs.delete(id); row.classList.remove('selected'); }
  else { mapSelectedRefs.add(id); row.classList.add('selected'); }
  const lbl = document.getElementById('mapRefSelectedLabel');
  if (mapSelectedRefs.size > 0) { lbl.textContent = mapSelectedRefs.size + ' selected'; lbl.classList.add('show'); }
  else { lbl.classList.remove('show'); }
}

function deleteMapRef(id) {
  const wrap = document.getElementById('mwrap-' + id);
  if (!wrap) return;
  wrap.style.opacity = '0'; wrap.style.transform = 'translateX(20px)'; wrap.style.transition = 'all .2s ease';
  setTimeout(() => { wrap.remove(); showToast('↪ Ref queued for deletion', 'warn'); }, 200);
  mapSelectedRefs.delete(id);
  if (!mapSelectedRefs.size) document.getElementById('mapRefSelectedLabel').classList.remove('show');
}

function deleteMapSelected() {
  if (!mapSelectedRefs.size) { showToast('Select references first'); return; }
  [...mapSelectedRefs].forEach(id => deleteMapRef(id));
  mapSelectedRefs.clear();
}

function toggleMapCard(id) {
  const wrapId = 'mwrap-' + id, rowId = 'mrow-' + id, cardId = 'mcard-' + id;
  if (mapOpenCardId !== null && mapOpenCardId !== id) {
    document.getElementById('mcard-' + mapOpenCardId)?.remove();
    document.getElementById('mrow-'  + mapOpenCardId)?.classList.remove('has-card');
    mapOpenCardId = null;
  }
  const existing = document.getElementById(cardId);
  if (existing) { existing.remove(); document.getElementById(rowId)?.classList.remove('has-card'); mapOpenCardId = null; return; }

  const tpl  = document.getElementById('mapCardTemplate');
  const card = tpl.content.cloneNode(true).querySelector('.ref-card');
  card.id    = cardId;
  card.querySelectorAll('[id]').forEach(el => { el.id = el.id.replace(/ID/g, id); });
  card.querySelectorAll('[onclick]').forEach(el => { el.setAttribute('onclick', el.getAttribute('onclick').replace(/ID/g, id)); });
  card.querySelectorAll('[oninput]').forEach(el => { el.setAttribute('oninput', el.getAttribute('oninput').replace(/ID/g, id)); });

  if (id !== 'new') {
    const row = document.getElementById(rowId);
    const w   = row?.querySelector('.ref-word')?.textContent  || '';
    const n   = row?.querySelector('.ref-numid')?.textContent.replace('·', '').trim() || '';
    if (w) card.querySelector('.ref-word-input').value  = w;
    if (n) card.querySelector('.ref-numid-input').value = n;
  }

  document.getElementById(rowId)?.classList.add('has-card');
  document.getElementById(wrapId)?.appendChild(card);
  mapOpenCardId = id;
  updateMapTier(id);
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

function updateMapTier(id) {
  const card  = document.getElementById('mcard-' + id);
  if (!card) return;
  const word  = card.querySelector('.ref-word-input')?.value.trim()  || '';
  const numid = card.querySelector('.ref-numid-input')?.value.trim() || '';
  const uid   = card.querySelector('.ref-uid-input')?.value.trim()   || '';
  const dot   = document.getElementById('mtier-' + id)?.querySelector('.tier-dot');
  const label = document.getElementById('mtier-label-' + id);
  if (!dot || !label) return;
  dot.className = 'tier-dot';
  if      (word && numid && uid) { dot.classList.add('frozen');     label.textContent = 'Frozen — word + NumId + UID'; }
  else if (word && uid)           { dot.classList.add('dynamic');    label.textContent = 'Dynamic — word + UID'; }
  else if (word && numid)         { dot.classList.add('persistent'); label.textContent = 'Persistent — word + NumId'; }
  else                            { dot.classList.add('isolated');   label.textContent = 'Isolated — word string only'; }
}

function onMapFieldInput(input, id) {
  const field = input.dataset.field, val = input.value.trim();
  const drop  = document.getElementById('mdrop-' + field + '-' + id);
  if (!drop) { updateMapTier(id); return; }
  if (val.length < 1) { drop.classList.remove('show'); updateMapTier(id); return; }
  if (field === 'word') {
    const results = searchEntries(val, 8);
    drop.innerHTML = '';
    results.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'ref-dropdown-item';
      item.dataset.word = entry.word; item.dataset.numid = entry.numid; item.dataset.uid = entry.uid;
      item.setAttribute('onclick', `selectMapFromDropdown(this,'${id}')`);
      item.innerHTML = `<div class="ref-dropdown-word">${escHtml(entry.word)}</div><div class="ref-dropdown-meta">UID ${entry.uid} · NumId ${entry.numid} · ${entry.role || entry.categoryLabel}</div>`;
      drop.appendChild(item);
    });
    drop.classList.toggle('show', !!drop.children.length);
  }
  updateMapTier(id);
}

function selectMapFromDropdown(item, id) {
  const card = document.getElementById('mcard-' + id);
  if (!card) return;
  card.querySelector('.ref-word-input').value  = item.dataset.word  || '';
  card.querySelector('.ref-numid-input').value = item.dataset.numid || '';
  card.querySelector('.ref-uid-input').value   = item.dataset.uid   || '';
  card.querySelectorAll('.ref-dropdown').forEach(d => d.classList.remove('show'));
  updateMapTier(id);
}

function clearMapCard(id) {
  const card = document.getElementById('mcard-' + id);
  if (!card) return;
  card.querySelectorAll('input').forEach(el => el.value = '');
  card.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
  card.querySelectorAll('.ref-dropdown').forEach(d => d.classList.remove('show'));
  updateMapTier(id); showToast('Card reset');
}

function saveMapCard(id) {
  const card = document.getElementById('mcard-' + id);
  if (!card) return;
  if (!card.querySelector('.ref-word-input')?.value.trim()) { showToast('Word is required', 'error'); return; }
  showToast('↪ Reference saved locally', 'success');
  card.remove();
  document.getElementById('mrow-' + id)?.classList.remove('has-card');
  mapOpenCardId = null;
}

function openMapMenu()  { document.getElementById('sidebarOverlay').classList.add('open');    document.getElementById('mapMenuSidebar').classList.add('open'); }
function closeMapMenu() { document.getElementById('sidebarOverlay').classList.remove('open'); document.getElementById('mapMenuSidebar').classList.remove('open'); }
function toggleMapLookup() { document.getElementById('mapLookupPanel').classList.toggle('show'); }

function mapSaveAll() {
  const entry  = getFirstSelectedEntry();
  const result = pushCommit(makeCommit('map', entry?.word || '—', entry?.numid ?? null));
  if (!result.ok) { showToast('🔴 Hard limit — review Commits', 'error'); return; }
  updateBadge(); showToast('↪ Map changes queued', 'success'); closeMapPanel();
}

document.addEventListener('click', e => {
  if (!e.target.closest('.ref-search-field'))
    document.querySelectorAll('.ref-dropdown').forEach(d => d.classList.remove('show'));
});
