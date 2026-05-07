// ════════════════════════════════════════════
// script.js — Commits Panel
// Depends on: state.js (load first)
// ════════════════════════════════════════════

'use strict';

let selectedKeys       = new Set();   // stores e_key values — stable across re-renders
let currentStateFilter = 'all';
let currentOpFilter    = 'all';
let currentSort        = 'newest';
let currentSearch      = '';
let _toastTimer;

const OP_ICON = {
  create:  { icon: '＋', bg: 'rgba(212,151,59,.15)'  },
  edit:    { icon: '✏',  bg: 'rgba(91,155,213,.2)'   },
  update:  { icon: '📝', bg: 'rgba(91,155,213,.15)'  },
  rename:  { icon: 'Aa', bg: 'rgba(90,97,117,.1)'    },
  regroup: { icon: '⬡',  bg: 'rgba(42,140,126,.2)'   },
  map:     { icon: '🗺', bg: 'rgba(212,151,59,.15)'   },
  trash:   { icon: '🗑', bg: 'rgba(198,40,40,.2)'     },
  disable: { icon: '⊘',  bg: 'rgba(255,255,255,.08)' },
  import:  { icon: '📂', bg: 'rgba(212,151,59,.15)'  },
};

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
  if (!isLoggedIn()) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('noSessionScreen').classList.add('active');
    return;
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('commitsScreen').classList.add('active');
  renderLogs();
  renderRemoved();
  updateMenuState();
});

// ════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════
function switchTab(name, btn) {
  document.querySelectorAll('.crud-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.crud-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  clearSelectionAndUpdate();
  if (name === 'logs')    renderLogs();
  if (name === 'removed') renderRemoved();
}

// ════════════════════════════════════════════
// RENDER LOGS
// ════════════════════════════════════════════
function renderLogs() {
  let q = getQueue();

  // Apply filters
  if (currentStateFilter !== 'all') q = q.filter(a => a.state === currentStateFilter);
  if (currentOpFilter    !== 'all') q = q.filter(a => a.op    === currentOpFilter);

  // Apply search
  if (currentSearch) {
    const lower = currentSearch.toLowerCase();
    q = q.filter(a =>
      (a.word || '').toLowerCase().includes(lower) ||
      (a.op   || '').toLowerCase().includes(lower)
    );
  }

  // Apply sort
  if (currentSort === 'newest')    q = [...q].reverse();
  if (currentSort === 'oldest')    { /* already chronological */ }
  if (currentSort === 'word_asc')  q = [...q].sort((a, b) => (a.word || '').localeCompare(b.word));
  if (currentSort === 'word_desc') q = [...q].sort((a, b) => (b.word || '').localeCompare(a.word));

  const list  = document.getElementById('commitLogList');
  const empty = document.getElementById('logsEmpty');
  const count = document.getElementById('logsCount');
  list.innerHTML = '';

  const total = getQueue().length;
  count.textContent = total + ' action' + (total !== 1 ? 's' : '');

  if (q.length === 0) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  q.forEach(action => list.appendChild(buildLogItem(action)));
}

function buildLogItem(action) {
  const info       = OP_ICON[action.op] || OP_ICON.edit;
  const stateClass = 'state-' + action.state;
  const dimClass   = action.state === 'dropped'   ? 'state-dropped-item'
                   : action.state === 'published' ? 'state-published-item' : '';
  const time       = new Date(action.timestamp)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const isSelected = action.e_key != null && selectedKeys.has(action.e_key);
  const el         = document.createElement('div');
  el.className     = 'commit-log-item ' + dimClass + (isSelected ? ' selected' : '');
  el.dataset.eKey  = action.e_key != null ? action.e_key : '';
  el.innerHTML     = `
    <div class="commit-item-header">
      <div class="commit-op-icon" style="background:${info.bg}">${info.icon}</div>
      <div class="commit-item-body">
        <div class="commit-item-word">${escHtml(action.word)}</div>
        <div class="commit-item-meta">${capFirst(action.op)} · ${time}</div>
      </div>
      <div class="commit-item-right">
        <span class="commit-state ${stateClass}">${capFirst(action.state)}</span>
        <div class="commit-check">✓</div>
      </div>
    </div>`;
  el.addEventListener('click', () => toggleSelect(el, action.e_key));
  return el;
}

// ════════════════════════════════════════════
// RENDER REMOVED
// ════════════════════════════════════════════
function renderRemoved() {
  const removed = getRemoved();
  const list    = document.getElementById('removedList');
  const empty   = document.getElementById('removedEmpty');
  list.innerHTML = '';

  if (removed.length === 0) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  removed.forEach(action => {
    const info = OP_ICON[action.op] || OP_ICON.edit;
    const time = new Date(action.timestamp)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const el   = document.createElement('div');
    el.className = 'commit-log-item state-dropped-item';
    el.innerHTML = `
      <div class="commit-item-header">
        <div class="commit-op-icon" style="background:${info.bg}">${info.icon}</div>
        <div class="commit-item-body">
          <div class="commit-item-word">${escHtml(action.word)}</div>
          <div class="commit-item-meta">${action.op} · Removed · ${time}</div>
        </div>
        <div class="commit-item-right">
          <span class="commit-state state-dropped">Removed</span>
        </div>
      </div>`;
    list.appendChild(el);
  });
}

// ════════════════════════════════════════════
// SELECTION — keyed by e_key
// ════════════════════════════════════════════
function toggleSelect(el, e_key) {
  if (e_key == null) return;
  if (selectedKeys.has(e_key)) {
    selectedKeys.delete(e_key);
    el.classList.remove('selected');
  } else {
    selectedKeys.add(e_key);
    el.classList.add('selected');
  }
  updateSelectionLabel();
  updateMenuState();
}

function clearSelectionAndUpdate() {
  selectedKeys.clear();
  document.querySelectorAll('.commit-log-item.selected')
    .forEach(el => el.classList.remove('selected'));
  updateSelectionLabel();
  updateMenuState();
}

function updateSelectionLabel() {
  const lbl = document.getElementById('commitsSelectedLabel');
  if (!lbl) return;
  if (selectedKeys.size > 0) {
    lbl.textContent = selectedKeys.size + ' selected';
    lbl.classList.add('show');
  } else {
    lbl.classList.remove('show');
  }
}

function getSelectionMode() {
  return selectedKeys.size === 0 ? 'none'
       : selectedKeys.size === 1 ? 'single'
       : 'multi';
}

// ════════════════════════════════════════════
// MENU — context-sensitive
// ════════════════════════════════════════════
const MENU_VISIBILITY = {
  menuEdit:       ['single'],
  menuSchedule:   ['single'],
  menuRename:     ['single'],
  menuPublish:    ['single', 'multi'],
  menuDraft:      ['single', 'multi'],
  menuDrop:       ['single', 'multi'],
  menuDelete:     ['single', 'multi'],
  menuPublishAll: ['none', 'single', 'multi'],
  menuDiscardAll: ['none', 'single', 'multi'],
};

function updateMenuState() {
  const mode = getSelectionMode();
  Object.entries(MENU_VISIBILITY).forEach(([id, allowed]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = allowed.includes(mode) ? '' : 'none';
  });
}

function openMenu() {
  updateMenuState();
  document.getElementById('sidebarOverlay').classList.add('open');
  document.getElementById('commitsMenuSidebar').classList.add('open');
}
function closeMenu() {
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.getElementById('commitsMenuSidebar').classList.remove('open');
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

// Single-select within each chip group
function toggleChip(c) {
  const group = c.closest('.opt-chips');
  if (!group) { c.classList.toggle('active'); return; }
  group.querySelectorAll('.opt-chip').forEach(chip => chip.classList.remove('active'));
  c.classList.add('active');
}

function selectSort(opt) {
  document.querySelectorAll('.sort-option').forEach(s => s.classList.remove('active'));
  opt.classList.add('active');
}

function applyOptions() {
  const stateChip = document.querySelector('#filterState .opt-chip.active');
  currentStateFilter = stateChip?.dataset.value || 'all';

  const opChip = document.querySelector('#filterOp .opt-chip.active');
  currentOpFilter = opChip?.dataset.value || 'all';

  const sortOpt = document.querySelector('.sort-option.active');
  currentSort = sortOpt?.dataset.sort || 'newest';

  closeOptions();
  clearSelectionAndUpdate();
  renderLogs();
}

function resetOptions() {
  currentStateFilter = 'all';
  currentOpFilter    = 'all';
  currentSort        = 'newest';
  document.querySelectorAll('#filterState .opt-chip, #filterOp .opt-chip')
    .forEach(c => c.classList.remove('active'));
  document.querySelectorAll('#filterState .opt-chip[data-value="all"], #filterOp .opt-chip[data-value="all"]')
    .forEach(c => c.classList.add('active'));
  document.querySelectorAll('.sort-option').forEach((s, i) => s.classList.toggle('active', i === 0));
  clearSelectionAndUpdate();
  renderLogs();
  showToast('Options reset');
}

// ════════════════════════════════════════════
// QUEUE OPERATIONS
// ════════════════════════════════════════════
function applyToSelected(newState) {
  if (!selectedKeys.size) { showToast('Select actions first'); return; }
  const q = getQueue();
  q.forEach(action => {
    if (action.e_key != null && selectedKeys.has(action.e_key)) {
      action.state = newState;
    }
  });
  saveQueue(q);
  clearSelectionAndUpdate();
  renderLogs();
  showToast('State → ' + newState, newState === 'published' ? 'success' : '');
}

function deleteSelected() {
  if (!selectedKeys.size) { showToast('Select actions first'); return; }
  const q = getQueue(), removed = getRemoved();
  const toRemove = [], toKeep = [];
  q.forEach(action => {
    if (action.e_key != null && selectedKeys.has(action.e_key)) toRemove.push(action);
    else toKeep.push(action);
  });
  removed.push(...toRemove);
  saveQueue(toKeep);
  saveRemoved(removed);
  clearSelectionAndUpdate();
  renderLogs();
  renderRemoved();
  showToast('🗑 Moved to Removed', 'error');
}

function publishAll() {
  const q = getQueue();
  q.forEach(a => { if (a.state !== 'dropped') a.state = 'published'; });
  saveQueue(q);
  clearSelectionAndUpdate();
  renderLogs();
  showToast('✅ All non-dropped actions published', 'success');
  // TODO: wire to actual DB write (triangle.js Side 3)
}

function discardAll() {
  const q = getQueue(), removed = getRemoved();
  const toDiscard = [], skipped = [];
  q.forEach(a => {
    if (a.state === 'published') skipped.push(a);
    else toDiscard.push(a);
  });
  removed.push(...toDiscard);
  saveRemoved(removed);
  saveQueue(skipped);
  clearSelectionAndUpdate();
  renderLogs();
  renderRemoved();
  if (skipped.length > 0) {
    showToast('⚠️ ' + skipped.length + ' published action' + (skipped.length !== 1 ? 's' : '') + ' kept', 'warn');
  } else {
    showToast('🗑 Queue discarded', 'error');
  }
}

// ════════════════════════════════════════════
// SEARCH — stored in currentSearch, applied in renderLogs()
// ════════════════════════════════════════════
function filterCommits(q) {
  currentSearch = q.trim();
  renderLogs();
}
