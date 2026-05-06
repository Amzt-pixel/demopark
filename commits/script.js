// ════════════════════════════════════════════
// script.js — Commits Panel logic
// ════════════════════════════════════════════

'use strict';

const LS_SESSION  = 'dictAdminSession';
const LS_QUEUE    = 'dictCommitsQueue';
const LS_REMOVED  = 'dictCommitsRemoved';

let selectedIndices = new Set();

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

let _toastTimer;
function showToast(msg, type = '') {
  const el = document.getElementById('toastEl');
  el.textContent = msg;
  el.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

window.addEventListener('load', () => {
  if (!localStorage.getItem(LS_SESSION)) {
    showScreen('noSessionScreen');
    return;
  }
  showScreen('commitsScreen');
  renderLogs();
  renderRemoved();
  updateMenuState();
});

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function switchTab(name, btn) {
  document.querySelectorAll('.crud-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.crud-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  clearSelection();
}

function getQueue()     { try { return JSON.parse(localStorage.getItem(LS_QUEUE)   || '[]'); } catch { return []; } }
function saveQueue(q)   { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); }
function getRemoved()   { try { return JSON.parse(localStorage.getItem(LS_REMOVED) || '[]'); } catch { return []; } }
function saveRemoved(r) { localStorage.setItem(LS_REMOVED, JSON.stringify(r)); }

function renderLogs() {
  const q     = getQueue();
  const list  = document.getElementById('commitLogList');
  const empty = document.getElementById('logsEmpty');
  const count = document.getElementById('logsCount');
  list.innerHTML = '';
  count.textContent = q.length + ' action' + (q.length !== 1 ? 's' : '');
  if (q.length === 0) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  q.forEach((action, idx) => list.appendChild(buildLogItem(action, idx)));
}

function buildLogItem(action, idx) {
  const info       = OP_ICON[action.op] || OP_ICON.edit;
  const stateClass = 'state-' + action.state;
  const dimClass   = action.state === 'dropped'   ? 'state-dropped-item'
                   : action.state === 'published' ? 'state-published-item' : '';
  const time       = new Date(action.timestamp)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const el = document.createElement('div');
  el.className   = 'commit-log-item ' + dimClass;
  el.dataset.idx = idx;
  el.innerHTML   = `
    <div class="commit-item-header">
      <div class="commit-op-icon" style="background:${info.bg}">${info.icon}</div>
      <div class="commit-item-body">
        <div class="commit-item-word">${escHtml(action.word)}</div>
        <div class="commit-item-meta">${cap(action.op)} · ${time}</div>
      </div>
      <div class="commit-item-right">
        <span class="commit-state ${stateClass}">${cap(action.state)}</span>
        <div class="commit-check">✓</div>
      </div>
    </div>`;
  el.addEventListener('click', () => toggleSelect(el, idx));
  return el;
}

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
    const el = document.createElement('div');
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

function toggleSelect(el, idx) {
  if (selectedIndices.has(idx)) { selectedIndices.delete(idx); el.classList.remove('selected'); }
  else { selectedIndices.add(idx); el.classList.add('selected'); }
  updateSelectionLabel();
  updateMenuState();
}

function clearSelection() {
  selectedIndices.clear();
  document.querySelectorAll('.commit-log-item.selected').forEach(el => el.classList.remove('selected'));
  updateSelectionLabel();
  updateMenuState();
}

function updateSelectionLabel() {
  const lbl = document.getElementById('commitsSelectedLabel');
  if (selectedIndices.size > 0) { lbl.textContent = selectedIndices.size + ' selected'; lbl.classList.add('show'); }
  else { lbl.classList.remove('show'); }
}

function getSelectionMode() {
  if (selectedIndices.size === 0) return 'none';
  if (selectedIndices.size === 1) return 'single';
  return 'multi';
}

const MENU_ITEMS = {
  menuPublish:    ['single', 'multi'],
  menuDraft:      ['single', 'multi'],
  menuDrop:       ['single', 'multi'],
  menuDelete:     ['single', 'multi'],
  menuEdit:       ['single'],
  menuSchedule:   ['single'],
  menuRename:     ['single'],
  menuPublishAll: ['none', 'single', 'multi'],
  menuDiscardAll: ['none', 'single', 'multi'],
};

function updateMenuState() {
  const mode = getSelectionMode();
  Object.entries(MENU_ITEMS).forEach(([id, allowed]) => {
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

function openOptions()  { document.getElementById('optionsOverlay').classList.add('open');    document.getElementById('optionsSheet').classList.add('open'); }
function closeOptions() { document.getElementById('optionsOverlay').classList.remove('open'); document.getElementById('optionsSheet').classList.remove('open'); }
function toggleChip(c)  { c.classList.toggle('active'); }
function selectSort(opt) { document.querySelectorAll('.sort-option').forEach(s => s.classList.remove('active')); opt.classList.add('active'); }

function applyToSelected(newState) {
  if (selectedIndices.size === 0) { showToast('Select actions first'); return; }
  const q = getQueue();
  selectedIndices.forEach(idx => { if (q[idx]) q[idx].state = newState; });
  saveQueue(q); clearSelection(); renderLogs();
  showToast('State → ' + newState, newState === 'published' ? 'success' : '');
}

function deleteSelected() {
  if (selectedIndices.size === 0) { showToast('Select actions first'); return; }
  const q = getQueue(), removed = getRemoved();
  [...selectedIndices].sort((a, b) => b - a).forEach(idx => removed.push(...q.splice(idx, 1)));
  saveQueue(q); saveRemoved(removed); clearSelection(); renderLogs(); renderRemoved();
  showToast('🗑 Moved to Removed', 'error');
}

function publishAll() {
  const q = getQueue();
  q.forEach(a => { if (a.state !== 'dropped') a.state = 'published'; });
  saveQueue(q); renderLogs();
  showToast('✅ All non-dropped actions published', 'success');
}

function discardAll() {
  const q = getQueue(), removed = getRemoved();
  removed.push(...q); saveRemoved(removed); saveQueue([]);
  clearSelection(); renderLogs(); renderRemoved();
  showToast('🗑 Queue discarded', 'error');
}

function filterCommits(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('.commit-log-item').forEach(item => {
    const w = item.querySelector('.commit-item-word')?.textContent.toLowerCase() || '';
    const m = item.querySelector('.commit-item-meta')?.textContent.toLowerCase() || '';
    item.style.display = (w.includes(lower) || m.includes(lower)) ? '' : 'none';
  });
}

function cap(str)     { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
function escHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
