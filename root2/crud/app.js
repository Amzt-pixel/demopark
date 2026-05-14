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
let activeTab       = 'view';

// Word list sidebar state
let wlCategoryFilter = 'all';
let wlGroupFilter    = 'all';    // all | same | diff
let wlIsolation      = 'all';    // all | isolated | grouped
let wlStatusFilter   = 'all';    // all | active | inactive
let wlSearchVal      = '';
let frozenNumId      = null;     // numId from frozen op card

// Map panel state
let mapOpenCardId   = null;
let mapSelectedRefs = new Set();

// Form operation state
let currentOp       = 'create';
let formSnapshot    = null;

// Create tab counters
let exCount = 1;
let bCount  = 1;

let _toastTimer;

// ── Category colors ────────────────────────
const CAT_COLORS = {
  1: '#5B9BD5',   // Word    → Blue
  2: '#2A8C7E',   // Idiom   → Teal
  3: '#D4973B',   // Phrasal → Gold
};

// ── Operation config ───────────────────────
const OP_CONFIG = {
  create:  { label: 'Create',  badge: '＋ Create',  badgeClass: 'op-add',     subtitle: 'Fill in all fields to create a new entry', frozen: [] },
  add:     { label: 'Add',     badge: '＋ Add',     badgeClass: 'op-add',     subtitle: 'New word added to the same NumId group as selected', frozen: ['createNumid'] },
  edit:    { label: 'Edit',    badge: '✏ Edit',    badgeClass: 'op-edit',    subtitle: 'Full edit — all fields modifiable', frozen: [] },
  update:  { label: 'Update',  badge: '📝 Update',  badgeClass: 'op-update',  subtitle: 'Non-essential fields only — NumId and category unchanged',
             frozen: ['createNumid', 'createCategory', 'createWord'] },
  rename:  { label: 'Rename',  badge: 'Aa Rename', badgeClass: 'op-rename',  subtitle: 'Change the word string only',
             frozen: ['createNumid', 'createCategory', 'createUsage', 'createRole', 'createDef1', 'createDef2', 'createActive', 'createReview'] },
  regroup: { label: 'Regroup', badge: '⬡ Regroup', badgeClass: 'op-regroup', subtitle: 'Change NumId — moves word to a different group',
             frozen: ['createWord', 'createCategory', 'createUsage', 'createRole', 'createDef1', 'createDef2', 'createActive', 'createReview'] },
  trash:   { label: 'Trash',   badge: '🗑 Trash',   badgeClass: 'op-trash',   subtitle: 'Sets NumId → 0. Word becomes invalid.',
             frozen: ['createWord', 'createNumid', 'createCategory', 'createUsage', 'createRole', 'createDef1', 'createDef2', 'createActive', 'createReview'] },
  disable: { label: 'Disable', badge: '⊘ Disable', badgeClass: 'op-disable', subtitle: 'Toggle active — word hidden everywhere',
             frozen: ['createWord', 'createNumid', 'createCategory', 'createUsage', 'createRole', 'createDef1', 'createDef2', 'createReview'] },
};

const ALL_FIELDS = [
  'createWord', 'createCategory', 'createUsage', 'createRole',
  'createNumid', 'createDef1', 'createDef2', 'createActive', 'createReview',
];

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
    updateNavDynamicBtn('view');
    updateMenuState();
    initData();
  }
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
  updateNavDynamicBtn('view');
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
function goToCommits() { window.open('../commits/', '_blank'); }

// ════════════════════════════════════════════
// DYNAMIC NAV BUTTON
// ════════════════════════════════════════════
function updateNavDynamicBtn(tab) {
  activeTab = tab;
  const actionsBtn       = document.getElementById('navActionsBtn');
  const wordListBtn      = document.getElementById('navWordListBtn');
  const transportListBtn = document.getElementById('navTransportListBtn');
  actionsBtn.style.display       = 'none';
  wordListBtn.style.display      = 'none';
  transportListBtn.style.display = 'none';
  if (tab === 'view')      actionsBtn.style.display       = 'flex';
  if (tab === 'form')      wordListBtn.style.display      = 'flex';
  if (tab === 'transport') transportListBtn.style.display = 'flex';
}

// ════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════
function switchTab(name, btn) {
  document.querySelectorAll('.crud-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.crud-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  updateNavDynamicBtn(name);
  closeAllSidebars();
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
  if (entries.length === 0) { empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');
  const frag = document.createDocumentFragment();
  entries.forEach(e => frag.appendChild(buildTile(e)));
  container.appendChild(frag);
}

function buildTile(entry) {
  const tile = document.createElement('div');

  const catColor    = CAT_COLORS[entry.category] || CAT_COLORS[1];
  const activeColor = entry.active ? '#2ecc71' : '#cc3333';

  // Bookmark logic
  const hasNote    = entry.review_note;
  const hasComment = !!(entry.comment && String(entry.comment).trim());
  let bookmarkTitle = '';
  if (hasNote && hasComment) bookmarkTitle = 'Review note & comment';
  else if (hasNote)          bookmarkTitle = 'Review note';
  else if (hasComment)       bookmarkTitle = 'Comment';
  const showBookmark = hasNote || hasComment;

  const numidDisplay = entry.numid < 0 ? '−' + Math.abs(entry.numid) : String(entry.numid);

  // Meta indicators — [D|E|T|TE] format
  const meta   = buildTileMeta(entry);
  const indFormatted = '[' + meta.indicators
    .map(ind => ind.active ? ind.key : `<span class="meta-dim">${ind.key}</span>`)
    .join('|') + ']';
  const metaStr = `${meta.label} · ${indFormatted}`;

  const isSelected = selectedUids.has(String(entry.uid));

  tile.className = 'word-tile' +
    (entry.isInvalid  ? ' invalid-tile'  : '') +
    (entry.isInactive ? ' inactive-tile' : '') +
    (isSelected       ? ' selected'      : '');

  tile.dataset.uid   = entry.uid;
  tile.dataset.eKey  = entry.e_key;
  tile.dataset.word  = entry.word;
  tile.dataset.numid = entry.numid;
  tile.dataset.cat   = entry.categoryLabel;
  tile.dataset.label = entry.usageLabel !== 'Common' ? entry.usageLabel : '';
  tile.dataset.def   = entry.definition1;

  // Left border only — no right border
  tile.style.cssText = `border-left: 3.5px solid ${catColor}; border-left-color: ${catColor};`;

  tile.innerHTML = `
    <div class="tile-inner">
      <div class="tile-body">
        <div class="tile-line1">
          <span class="tile-word${entry.isInvalid ? ' invalid' : ''}">${escHtml(entry.word)}${entry.isInvalid ? ' ⚠' : ''}</span>
          ${showBookmark ? `<svg class="tile-bookmark" title="${bookmarkTitle}" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:5px;flex-shrink:0"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>` : ''}
        </div>
        <div class="tile-line2"><span class="tile-meta-text">${metaStr}</span></div>
      </div>
      <div class="tile-right">
        <div class="tile-top-right">
          <div class="tile-status-dot" style="background:${activeColor}"></div>
          <div class="tile-numid-chip${entry.isInvalid ? ' warn' : ''}">${escHtml(numidDisplay)}</div>
        </div>
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
// TILE SELECTION — view panel only, fully decoupled from form
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
  if (selectedUids.size === 1)    { lbl.textContent = getFirstSelectedWord(); lbl.classList.add('show'); }
  else if (selectedUids.size > 1) { lbl.textContent = selectedUids.size + ' selected'; lbl.classList.add('show'); }
  else                             { lbl.classList.remove('show'); }
}

function getFirstSelectedTile()  { return selectedUids.size ? document.querySelector(`.word-tile[data-uid="${[...selectedUids][0]}"]`) : null; }
function getFirstSelectedWord()  { return getFirstSelectedTile()?.dataset.word  || ''; }
function getFirstSelectedNumid() { return getFirstSelectedTile()?.dataset.numid || ''; }
function getFirstSelectedEKey()  { return parseInt(getFirstSelectedTile()?.dataset.eKey) || null; }
function getFirstSelectedEntry() {
  const tile = getFirstSelectedTile();
  return tile ? getEntryByEKey(parseInt(tile.dataset.eKey)) : null;
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
// SIDEBAR MANAGEMENT
// ════════════════════════════════════════════
function closeAllSidebars() {
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.getElementById('crudMenuSidebar').classList.remove('open');
  document.getElementById('wordListSidebar').classList.remove('open');
}

function openMenu() {
  updateMenuState();
  document.getElementById('sidebarOverlay').classList.add('open');
  document.getElementById('crudMenuSidebar').classList.add('open');
}
function closeMenu() { closeAllSidebars(); }

// ════════════════════════════════════════════
// WORD LIST SIDEBAR
// ════════════════════════════════════════════
function openWordListSidebar() {
  renderWordList();
  document.getElementById('sidebarOverlay').classList.add('open');
  document.getElementById('wordListSidebar').classList.add('open');
}

function renderWordList() {
  let entries = [...dataList];

  // Category filter
  if (wlCategoryFilter !== 'all') {
    const map = { word: 1, idiom: 2, phrasal: 3 };
    const val = map[wlCategoryFilter];
    if (val) entries = entries.filter(e => e.category === val);
  }

  // Group filter — relative to frozen numId
  if (wlGroupFilter !== 'all' && frozenNumId != null) {
    const absId = Math.abs(frozenNumId);
    if (wlGroupFilter === 'same') entries = entries.filter(e => Math.abs(e.numid) === absId);
    if (wlGroupFilter === 'diff') entries = entries.filter(e => Math.abs(e.numid) !== absId);
  }

  // Isolation filter
  if (wlIsolation === 'isolated') entries = entries.filter(e => !e.refword);
  if (wlIsolation === 'grouped')  entries = entries.filter(e => !!e.refword);

  // Status filter
  if (wlStatusFilter === 'active')   entries = entries.filter(e => e.active);
  if (wlStatusFilter === 'inactive') entries = entries.filter(e => !e.active);

  // Search
  if (wlSearchVal) {
    const q = wlSearchVal.toLowerCase();
    entries = entries.filter(e => e.word.toLowerCase().includes(q));
  }

  // Sort alpha
  entries = entries.sort((a, b) => a.word.localeCompare(b.word));

  const list  = document.getElementById('wlList');
  const count = document.getElementById('wlCount');
  list.innerHTML = '';
  count.textContent = entries.length + ' word' + (entries.length !== 1 ? 's' : '');

  if (entries.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:30px 10px;color:rgba(255,255,255,.3);font-size:12px">No words found</div>';
    return;
  }

  entries.forEach(entry => {
    const catColor     = CAT_COLORS[entry.category] || CAT_COLORS[1];
    const activeColor  = entry.active ? '#2ecc71' : '#cc3333';
    const numidDisplay = entry.numid < 0 ? '−' + Math.abs(entry.numid) : String(entry.numid);
    const item = document.createElement('div');
    item.className = 'wl-item';
    item.style.borderLeft  = `3px solid ${catColor}`;
    item.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="wl-item-word">${escHtml(entry.word)}</div>
      </div>
      <div class="wl-numid-chip">${escHtml(numidDisplay)}</div>`;
    item.addEventListener('click', () => loadWordIntoForm(entry));
    list.appendChild(item);
  });
}

// Load word into form — NEVER touches selectedUids
function loadWordIntoForm(entry) {
  const op = (currentOp === 'create') ? 'edit' : currentOp;
  _openFormOpWithEntry(op, entry);
  closeAllSidebars();
  showToast('Loaded: ' + entry.word);
}

function filterWordList(q) {
  wlSearchVal = q.trim();
  renderWordList();
}

function toggleWlCatChip(chip) {
  document.querySelectorAll('#wlCatChips .wl-cat-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  wlCategoryFilter = chip.dataset.cat;
  renderWordList();
}

// ── 3 cycle toggle buttons ──
const WL_GROUP_STATES     = ['all', 'same', 'diff'];
const WL_ISOLATION_STATES = ['all', 'isolated', 'grouped'];
const WL_STATUS_STATES    = ['all', 'active', 'inactive'];

const WL_GROUP_ICONS = [
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
];
const WL_GROUP_TITLES     = ['All groups', 'Same group', 'Different group'];

const WL_ISOLATION_ICONS = [
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="6" height="6" rx="1"/><rect x="16" y="7" width="6" height="6" rx="1"/><line x1="8" y1="10" x2="16" y2="10"/></svg>`,
];
const WL_ISOLATION_TITLES = ['All words', 'Isolated only', 'Grouped only'];

const WL_STATUS_ICONS = [
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
];
const WL_STATUS_TITLES    = ['All statuses', 'Active only', 'Inactive only'];

function cycleWlGroup() {
  const idx = (WL_GROUP_STATES.indexOf(wlGroupFilter) + 1) % WL_GROUP_STATES.length;
  wlGroupFilter = WL_GROUP_STATES[idx];
  const btn = document.getElementById('wlGroupBtn');
  if (btn) { btn.innerHTML = WL_GROUP_ICONS[idx]; btn.title = WL_GROUP_TITLES[idx]; btn.classList.toggle('wl-toggle-active', idx !== 0); }
  renderWordList();
}

function cycleWlIsolation() {
  const idx = (WL_ISOLATION_STATES.indexOf(wlIsolation) + 1) % WL_ISOLATION_STATES.length;
  wlIsolation = WL_ISOLATION_STATES[idx];
  const btn = document.getElementById('wlIsolationBtn');
  if (btn) { btn.innerHTML = WL_ISOLATION_ICONS[idx]; btn.title = WL_ISOLATION_TITLES[idx]; btn.classList.toggle('wl-toggle-active', idx !== 0); }
  renderWordList();
}

function cycleWlStatus() {
  const idx = (WL_STATUS_STATES.indexOf(wlStatusFilter) + 1) % WL_STATUS_STATES.length;
  wlStatusFilter = WL_STATUS_STATES[idx];
  const btn = document.getElementById('wlStatusBtn');
  if (btn) { btn.innerHTML = WL_STATUS_ICONS[idx]; btn.title = WL_STATUS_TITLES[idx]; btn.classList.toggle('wl-toggle-active', idx !== 0); }
  renderWordList();
}

// ════════════════════════════════════════════
// MENU — context-sensitive
// ════════════════════════════════════════════
const MENU_VISIBILITY = {
  menuCreate:  ['none'],
  menuAdd:     ['single'],
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
  currentFilters.category       = document.querySelector('#filterCategory .opt-chip.active')?.dataset.value || 'all';
  currentFilters.usage          = document.querySelector('#filterUsage .opt-chip.active')?.dataset.value    || 'all';
  currentFilters.onlyDefs       = !!document.querySelector('[data-cond="onlyDefs"].active');
  currentFilters.noExamples     = !!document.querySelector('[data-cond="noExamples"].active');
  currentFilters.reviewNote     = !!document.querySelector('[data-cond="reviewNote"].active');
  currentFilters.invalid        = !!document.querySelector('[data-cond="invalid"].active');
  currentFilters.inactive       = !!document.querySelector('[data-cond="inactive"].active');
  currentFilters.hasTranslation = !!document.querySelector('[data-cond="hasTranslation"].active');
  currentFilters.isolated       = !!document.querySelector('[data-cond="isolated"].active');
  currentFilters.numidMin       = document.getElementById('filterNumidMin')?.value || '';
  currentFilters.numidMax       = document.getElementById('filterNumidMax')?.value || '';
  currentSort = document.querySelector('.sort-option.active')?.dataset.sort || 'word_asc';
  const hasActiveFilter = Object.values(currentFilters).some(v => v && v !== 'all' && v !== '');
  document.getElementById('filterBtn')?.classList.toggle('active', hasActiveFilter);
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
  document.getElementById('filterBtn')?.classList.remove('active');
  applyAndRender();
  showToast('Options reset');
}

// ════════════════════════════════════════════
// SETTINGS SHEET
// ════════════════════════════════════════════
function openSettings() {
  document.getElementById('settingsOverlay').classList.add('open');
  document.getElementById('settingsSheet').classList.add('open');
}
function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('open');
  document.getElementById('settingsSheet').classList.remove('open');
}

// ════════════════════════════════════════════
// FORM OPERATION
// ════════════════════════════════════════════

// From Actions menu — uses view selection
function openFormOp(type) {
  const entry = (type === 'create') ? null : getFirstSelectedEntry();
  _openFormOpWithEntry(type, entry);
}

// Internal — never touches selectedUids
function _openFormOpWithEntry(type, entry) {
  currentOp = type;
  const cfg = OP_CONFIG[type];

  document.getElementById('formTabLabel').textContent = cfg.label;

  const opCard  = document.getElementById('formOpCard');
  const refCard = document.getElementById('formRefsCard');

  if (type === 'create') {
    if (opCard)  opCard.style.display  = 'none';
    if (refCard) refCard.style.display = 'none';
    frozenNumId = null;
  } else {
    // Op card
    if (opCard) {
      opCard.style.display = 'block';
      const opColors = {
        add: '#D4973B', edit: '#5B9BD5', update: '#5B9BD5',
        rename: '#5A6175', regroup: '#2A8C7E', trash: '#C62828', disable: '#5A6175',
      };
      const modeEl = document.getElementById('opCardMode');
      if (modeEl) { modeEl.textContent = cfg.label.toUpperCase(); modeEl.style.color = opColors[type] || '#5A6175'; }
      const descEl = document.getElementById('opCardDesc');
      if (descEl) descEl.textContent = cfg.subtitle.split(' — ')[0];
      const wordEl  = document.getElementById('opCardWord');
      const numidEl = document.getElementById('opCardNumid');
      const frozenWord  = entry?.word  || '—';
      const frozenNum   = entry?.numid != null ? entry.numid : null;
      frozenNumId = frozenNum;
      if (wordEl)  wordEl.textContent  = frozenWord;
      if (numidEl) numidEl.textContent = frozenNum != null
        ? (frozenNum < 0 ? '−' + Math.abs(frozenNum) : String(frozenNum))
        : '—';
    }

    // References card
    if (refCard && entry) {
      refCard.style.display = 'block';
      const hasRefs   = !!(entry.refword && String(entry.refword).trim());
      const statusEl  = document.getElementById('refCardStatus');
      const dotEl     = document.getElementById('refCardDot');
      if (statusEl) statusEl.textContent       = hasRefs ? 'Has references' : 'No references';
      if (dotEl)    dotEl.style.background     = hasRefs ? '#2ecc71' : '#cc3333';
    }
  }

  document.getElementById('formCancelBtn').style.display = type === 'create' ? 'none' : '';

  ALL_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
  cfg.frozen.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });

  prefillForm(type, entry);
  formSnapshot = captureFormSnapshot();

  const formTab = document.getElementById('formTab');
  switchTab('form', formTab);
}

function prefillForm(type, entry) {
  clearDynamicLists();
  if (!entry && type !== 'create' && type !== 'add') return;
  if (type === 'create') { clearAllFormFields(); return; }
  if (type === 'add') { clearAllFormFields(); if (entry) setVal('createNumid', entry.numid); return; }

  setVal('createWord',     entry.word);
  setVal('createNumid',    entry.numid);
  setSelectByValue('createCategory', String(entry.category));
  setSelectByValue('createUsage',    String(entry.usage));
  setVal('createRole',     entry.role);
  setVal('createDef1',     entry.definition1);
  setVal('createDef2',     entry.definition2);
  setCheck('createActive', entry.active);
  setCheck('createReview', entry.review_note);

  const exVals = [entry.example1, entry.example2, entry.example3, entry.example4, entry.example5].filter(Boolean);
  fillDynamicList('examplesList', exVals, 5, 'Example sentence');
  exCount = Math.max(exVals.length, 1);

  const bxVals = [entry.bengali_ex1, entry.bengali_ex2, entry.bengali_ex3].filter(Boolean);
  fillDynamicList('bengaliExList', bxVals, 3, 'Bengali example');
  bCount = Math.max(bxVals.length, 1);

  setVal('createBengaliDef', entry.bengali_def);
}

function fillDynamicList(listId, vals, max, placeholder) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';
  const count = Math.max(vals.length, 1);
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'example-row';
    const isFirst = i === 0;
    row.innerHTML = `<textarea class="form-input" placeholder="${placeholder} ${i + 1}…">${escHtml(vals[i] || '')}</textarea>`
      + (isFirst ? '' : `<button class="example-remove" onclick="this.closest('.example-row').remove()">✕</button>`);
    list.appendChild(row);
  }
}

function clearDynamicLists() {
  const ex = document.getElementById('examplesList');
  if (ex) ex.innerHTML = '<div class="example-row"><textarea class="form-input" placeholder="Example sentence 1…"></textarea></div>';
  const bx = document.getElementById('bengaliExList');
  if (bx) bx.innerHTML = '<div class="example-row"><textarea class="form-input" placeholder="Bengali example 1…"></textarea></div>';
  exCount = 1; bCount = 1;
}

function clearAllFormFields() {
  document.querySelectorAll('#panel-form input:not([type="checkbox"]), #panel-form textarea, #panel-form select')
    .forEach(el => { if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = ''; });
  const activeChk = document.getElementById('createActive');
  const reviewChk = document.getElementById('createReview');
  if (activeChk) activeChk.checked = true;
  if (reviewChk) reviewChk.checked = false;
}

function captureFormSnapshot() {
  const snap = {};
  document.querySelectorAll('#panel-form input, #panel-form textarea, #panel-form select')
    .forEach(el => { if (!el.id) return; snap[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  snap._examples = [...document.querySelectorAll('#examplesList textarea')].map(t => t.value);
  snap._bengali  = [...document.querySelectorAll('#bengaliExList textarea')].map(t => t.value);
  return snap;
}

function restoreFormSnapshot(snap) {
  if (!snap) return;
  Object.entries(snap).forEach(([id, val]) => {
    if (id.startsWith('_')) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = val; else el.value = val;
  });
  if (snap._examples) fillDynamicList('examplesList', snap._examples, 5, 'Example sentence');
  if (snap._bengali)  fillDynamicList('bengaliExList', snap._bengali,  3, 'Bengali example');
}

// ════════════════════════════════════════════
// OPEN MAP FROM FORM (preserves form state)
// ════════════════════════════════════════════
function openMapFromForm() {
  const word  = document.getElementById('opCardWord')?.textContent  || '—';
  const numid = document.getElementById('opCardNumid')?.textContent || '—';
  document.getElementById('mapBaseWord').textContent = word;
  document.getElementById('mapBaseMeta').textContent = '[' + numid + ']';
  document.getElementById('mapBaseDef').textContent  = '—';
  mapSelectedRefs.clear();
  mapOpenCardId = null;
  document.getElementById('mapRefSelectedLabel').classList.remove('show');
  const overlay = document.getElementById('mapOverlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));
  const firstTab = document.querySelector('.map-tab');
  if (firstTab) switchMapTab('list', firstTab);
}

// ════════════════════════════════════════════
// CANCEL / RESET
// ════════════════════════════════════════════
function cancelForm() {
  currentOp    = 'create';
  formSnapshot = null;
  frozenNumId  = null;
  clearAllFormFields();
  clearDynamicLists();
  ALL_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
  document.getElementById('formTabLabel').textContent    = 'Create';
  const opCard  = document.getElementById('formOpCard');
  const refCard = document.getElementById('formRefsCard');
  if (opCard)  opCard.style.display  = 'none';
  if (refCard) refCard.style.display = 'none';
  document.getElementById('formCancelBtn').style.display = 'none';
  const viewTab = document.querySelector('.crud-tab');
  switchTab('view', viewTab);
}

function resetForm() {
  if (currentOp === 'create') { clearAllFormFields(); clearDynamicLists(); showToast('Form cleared'); }
  else { restoreFormSnapshot(formSnapshot); showToast('Changes undone'); }
}

// ════════════════════════════════════════════
// COMMIT
// ════════════════════════════════════════════
function queueCommit() {
  const entry  = getFirstSelectedEntry();
  const word   = entry?.word  || getVal('createWord').trim() || '—';
  const numid  = entry?.numid ?? parseFloat(getVal('createNumid'));
  const e_key  = entry?.e_key ?? null;
  const extra  = {};

  if (currentOp === 'create') return queueCreate();

  if (currentOp === 'add') {
    const newWord = getVal('createWord').trim();
    if (!newWord) { showToast('Word is required', 'error'); return; }
    extra.newData = { word: newWord, numid: entry?.numid ?? null, category: parseInt(getVal('createCategory')) || 1, role: getVal('createRole'), definition1: getVal('createDef1'), definition2: getVal('createDef2') };
  }
  if (currentOp === 'edit') {
    extra.newData = { word: getVal('createWord'), numid: parseFloat(getVal('createNumid')), category: parseInt(getVal('createCategory')) || 1, usage: parseInt(getVal('createUsage')) || 0, role: getVal('createRole'), definition1: getVal('createDef1'), definition2: getVal('createDef2'), active: document.getElementById('createActive')?.checked, review_note: document.getElementById('createReview')?.checked, comment: getVal('createComment') };
  }
  if (currentOp === 'update') {
    extra.newData = { usage: parseInt(getVal('createUsage')) || 0, role: getVal('createRole'), definition1: getVal('createDef1'), definition2: getVal('createDef2'), comment: getVal('createComment') };
  }
  if (currentOp === 'rename') {
    const newWord = getVal('createWord').trim();
    if (!newWord) { showToast('New word string is required', 'error'); return; }
    extra.newData = { word: newWord }; extra.comment = 'Renamed from: ' + (entry?.word || '—');
  }
  if (currentOp === 'regroup') {
    const newNumid = parseFloat(getVal('createNumid'));
    if (isNaN(newNumid)) { showToast('New NumId is required', 'error'); return; }
    extra.newData = { numid: newNumid }; extra.comment = 'Regrouped from numid=' + (entry?.numid ?? '—');
  }
  if (currentOp === 'trash') {
    extra.newData = { numid: 0 }; extra.comment = 'Original numid=' + (entry?.numid ?? '—') + '. ' + getVal('createComment');
  }
  if (currentOp === 'disable') {
    extra.newData = { active: document.getElementById('createActive')?.checked }; extra.comment = getVal('createComment');
  }

  const result = pushCommit(makeCommit(currentOp, word, numid, e_key, extra));
  if (!result.ok) { showToast('🔴 Hard limit — review Commits', 'error'); return; }
  updateBadge();
  showToast('↪ ' + capFirst(currentOp) + ' queued', 'success');
  if (result.reason === 'soft_limit') setTimeout(() => showToast('⚠️ ' + getPendingCount() + ' pending', 'warn'), 2400);
  cancelForm();
}

function queueCreate() {
  const word  = getVal('createWord').trim();
  const numid = parseFloat(getVal('createNumid'));
  if (!word)        { showToast('Word is required', 'error'); return; }
  if (isNaN(numid)) { showToast('NumId is required', 'error'); return; }

  const newEKey = generateEKey();
  const ex = [...document.querySelectorAll('#examplesList textarea')].map(t => t.value.trim());
  const bx = [...document.querySelectorAll('#bengaliExList textarea')].map(t => t.value.trim());

  const newEntry = {
    e_key: newEKey, uid: 0, numid, word,
    category: parseInt(getVal('createCategory')) || 1, usage: parseInt(getVal('createUsage')) || 0,
    role: getVal('createRole'), definition1: getVal('createDef1'), definition2: getVal('createDef2'),
    example1: ex[0]||'', example2: ex[1]||'', example3: ex[2]||'', example4: ex[3]||'', example5: ex[4]||'',
    bengali_def: getVal('createBengaliDef'),
    bengali_ex1: bx[0]||'', bengali_ex2: bx[1]||'', bengali_ex3: bx[2]||'',
    active: document.getElementById('createActive')?.checked ?? true,
    review_note: document.getElementById('createReview')?.checked ?? false,
    comment: getVal('createComment'),
  };
  dataList.push(newEntry);

  const result = pushCommit(makeCommit('create', word, numid, newEKey, { newData: newEntry }));
  if (!result.ok) { dataList.pop(); showToast('🔴 Hard limit — review Commits', 'error'); return; }
  updateBadge();
  showToast('↪ Create queued', 'success');
  if (result.reason === 'soft_limit') setTimeout(() => showToast('⚠️ ' + getPendingCount() + ' pending', 'warn'), 2400);
  cancelForm();
}

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════
function setVal(id, val)   { const el = document.getElementById(id); if (el) el.value   = val ?? ''; }
function setCheck(id, val) { const el = document.getElementById(id); if (el) el.checked = !!val; }
function getVal(id)        { return document.getElementById(id)?.value || ''; }
function setSelectByValue(id, val) {
  const el = document.getElementById(id); if (!el) return;
  [...el.options].forEach((o, i) => { if (o.value === val) el.selectedIndex = i; });
}

function addExample() {
  if (exCount >= 5) { showToast('Maximum 5 examples'); return; }
  exCount++;
  const row = document.createElement('div'); row.className = 'example-row';
  row.innerHTML = `<textarea class="form-input" placeholder="Example sentence ${exCount}…"></textarea><button class="example-remove" onclick="this.closest('.example-row').remove()">✕</button>`;
  document.getElementById('examplesList').appendChild(row);
}
function addBengaliExample() {
  if (bCount >= 3) { showToast('Maximum 3 Bengali examples'); return; }
  bCount++;
  const row = document.createElement('div'); row.className = 'example-row';
  row.innerHTML = `<textarea class="form-input" placeholder="Bengali example ${bCount}…"></textarea><button class="example-remove" onclick="this.closest('.example-row').remove()">✕</button>`;
  document.getElementById('bengaliExList').appendChild(row);
}

// ════════════════════════════════════════════
// TRANSPORT
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
  const tile = getFirstSelectedTile(); if (!tile) return;
  document.getElementById('mapBaseWord').textContent = tile.dataset.word;
  document.getElementById('mapBaseMeta').textContent = '[' + tile.dataset.numid + '] · ' + tile.dataset.cat + (tile.dataset.label ? ' · ' + tile.dataset.label : '');
  document.getElementById('mapBaseDef').textContent  = tile.dataset.def || 'No definition available.';
  mapSelectedRefs.clear(); mapOpenCardId = null;
  document.getElementById('mapRefSelectedLabel').classList.remove('show');
  const overlay = document.getElementById('mapOverlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('open'));
  const firstTab = document.querySelector('.map-tab');
  if (firstTab) switchMapTab('list', firstTab);
  closeAllSidebars();
}

function closeMapPanel() {
  const overlay = document.getElementById('mapOverlay');
  overlay.classList.remove('open');
  overlay.addEventListener('transitionend', () => { overlay.style.display = 'none'; }, { once: true });
  mapSelectedRefs.clear(); mapOpenCardId = null;
  closeMapMenu();
}

function switchMapTab(name, btn) {
  document.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.map-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mpanel-' + name)?.classList.add('active');
}

function toggleMapRefSelect(id) {
  const row = document.getElementById('mrow-' + id); if (!row) return;
  if (mapSelectedRefs.has(id)) { mapSelectedRefs.delete(id); row.classList.remove('selected'); }
  else { mapSelectedRefs.add(id); row.classList.add('selected'); }
  const lbl = document.getElementById('mapRefSelectedLabel');
  if (mapSelectedRefs.size > 0) { lbl.textContent = mapSelectedRefs.size + ' selected'; lbl.classList.add('show'); }
  else { lbl.classList.remove('show'); }
}

function deleteMapRef(id) {
  const wrap = document.getElementById('mwrap-' + id); if (!wrap) return;
  wrap.style.opacity = '0'; wrap.style.transform = 'translateX(20px)'; wrap.style.transition = 'all .2s ease';
  setTimeout(() => { wrap.remove(); showToast('↪ Ref queued for deletion', 'warn'); }, 200);
  mapSelectedRefs.delete(id);
  if (!mapSelectedRefs.size) document.getElementById('mapRefSelectedLabel').classList.remove('show');
}

function deleteMapSelected() {
  if (!mapSelectedRefs.size) { showToast('Select references first'); return; }
  [...mapSelectedRefs].forEach(id => deleteMapRef(id)); mapSelectedRefs.clear();
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
    const w = row?.querySelector('.ref-word')?.textContent || '';
    const n = row?.querySelector('.ref-numid')?.textContent.replace('·', '').trim() || '';
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
  const card = document.getElementById('mcard-' + id); if (!card) return;
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
    const results = searchEntries(val, 8); drop.innerHTML = '';
    results.forEach(entry => {
      const item = document.createElement('div'); item.className = 'ref-dropdown-item';
      item.dataset.word = entry.word; item.dataset.numid = entry.numid; item.dataset.uid = entry.uid;
      item.setAttribute('onclick', `selectMapFromDropdown(this,'${id}')`);
      item.innerHTML = `<div class="ref-dropdown-word">${escHtml(entry.word)}</div><div class="ref-dropdown-meta">NumId ${entry.numid} · ${entry.role || entry.categoryLabel}</div>`;
      drop.appendChild(item);
    });
    drop.classList.toggle('show', !!drop.children.length);
  }
  updateMapTier(id);
}

function selectMapFromDropdown(item, id) {
  const card = document.getElementById('mcard-' + id); if (!card) return;
  card.querySelector('.ref-word-input').value  = item.dataset.word  || '';
  card.querySelector('.ref-numid-input').value = item.dataset.numid || '';
  card.querySelector('.ref-uid-input').value   = item.dataset.uid   || '';
  card.querySelectorAll('.ref-dropdown').forEach(d => d.classList.remove('show'));
  updateMapTier(id);
}

function clearMapCard(id) {
  const card = document.getElementById('mcard-' + id); if (!card) return;
  card.querySelectorAll('input').forEach(el => el.value = '');
  card.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
  card.querySelectorAll('.ref-dropdown').forEach(d => d.classList.remove('show'));
  updateMapTier(id); showToast('Card reset');
}

function saveMapCard(id) {
  const card = document.getElementById('mcard-' + id); if (!card) return;
  if (!card.querySelector('.ref-word-input')?.value.trim()) { showToast('Word is required', 'error'); return; }
  showToast('↪ Reference saved locally', 'success');
  card.remove(); document.getElementById('mrow-' + id)?.classList.remove('has-card');
  mapOpenCardId = null;
}

function openMapMenu()  { document.getElementById('sidebarOverlay').classList.add('open');    document.getElementById('mapMenuSidebar').classList.add('open'); }
function closeMapMenu() { document.getElementById('sidebarOverlay').classList.remove('open'); document.getElementById('mapMenuSidebar').classList.remove('open'); }
function toggleMapLookup() { document.getElementById('mapLookupPanel').classList.toggle('show'); }

function mapSaveAll() {
  const entry  = getFirstSelectedEntry();
  const result = pushCommit(makeCommit('map', entry?.word || '—', entry?.numid ?? null, entry?.e_key ?? null));
  if (!result.ok) { showToast('🔴 Hard limit — review Commits', 'error'); return; }
  updateBadge(); showToast('↪ Map changes queued', 'success'); closeMapPanel();
}

document.addEventListener('click', e => {
  if (!e.target.closest('.ref-search-field'))
    document.querySelectorAll('.ref-dropdown').forEach(d => d.classList.remove('show'));
});
