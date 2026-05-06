// ════════════════════════════════════════════
// app.js — CRUD Panel logic
// Depends on: ../core/state.js, ../core/data.js
// ════════════════════════════════════════════

// ── Constants ──────────────────────────────
const SOFT_LIMIT = 12;
const HARD_LIMIT = 16;
const LS_SESSION = 'dictAdminSession';
const LS_QUEUE   = 'dictCommitsQueue';

// ── Selection state ─────────────────────────
let selectedUids = new Set();   // UIDs of selected tiles

// ── Map state ───────────────────────────────
let mapSelectedRefs = new Set();
let mapOpenCardId   = null;

// ── Misc ────────────────────────────────────
let _toastTimer = null;
let exCount     = 1;
let bCount      = 1;


// ════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════

window.addEventListener('load', () => {
  // Map panel: hidden until explicitly opened
  document.getElementById('mapOverlay').style.display = 'none';

  if (localStorage.getItem(LS_SESSION)) {
    showScreen('crudScreen');
    updateBadge();
    updateMenuState();
  }

  bindTiles();
  bindModals();
});


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
  localStorage.setItem(LS_SESSION, '1');
  showScreen('crudScreen');
  updateBadge();
  updateMenuState();
}

function toggleEye() {
  const input = document.getElementById('gateInput');
  input.type = input.type === 'password' ? 'text' : 'password';
}

document.getElementById('gateInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') unlockAdmin();
});


// ════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════

function goToCommits() {
  window.location.href = '../commits/';
}


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
// QUEUE / BADGE
// ════════════════════════════════════════════

function getQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'); } catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem(LS_QUEUE, JSON.stringify(q));
}

function queueAction(op, word, numid) {
  const q       = getQueue();
  const pending = q.filter(a => a.state === 'draft').length;

  if (pending >= HARD_LIMIT) {
    showToast('🔴 ' + HARD_LIMIT + ' actions pending — review Commits first', 'error');
    return false;
  }

  q.push({
    id:        'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    op,
    word:      word  || getSelectedWord()  || '—',
    numid:     numid || getSelectedNumid() || '',
    timestamp: new Date().toISOString(),
    state:     'draft',
  });

  saveQueue(q);
  updateBadge();
  showToast('↪ ' + op + ' queued', 'success');

  const newPending = q.filter(a => a.state === 'draft').length;
  if (newPending >= SOFT_LIMIT) {
    setTimeout(() =>
      showToast('⚠️ ' + newPending + ' actions pending — review Commits', 'warn'), 2400);
  }
  return true;
}

function updateBadge() {
  const pending = getQueue().filter(a => a.state === 'draft').length;
  const badge   = document.getElementById('commitBadge');
  badge.textContent   = pending;
  badge.style.display = pending > 0 ? 'flex' : 'none';
}


// ════════════════════════════════════════════
// TILE SELECTION
// ════════════════════════════════════════════

function bindTiles() {
  let holdTimer = null;

  document.querySelectorAll('.word-tile').forEach(tile => {
    const startHold = () => {
      holdTimer = setTimeout(() => { holdTimer = null; showHoldPopup(tile); }, 500);
    };
    const cancelHold = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    };

    tile.addEventListener('mousedown',  startHold);
    tile.addEventListener('touchstart', startHold, { passive: true });
    tile.addEventListener('mouseup',    cancelHold);
    tile.addEventListener('mouseleave', cancelHold);
    tile.addEventListener('touchend',   cancelHold);

    tile.addEventListener('click', () => {
      if (document.getElementById('holdOverlay').classList.contains('open')) return;
      toggleTileSelect(tile);
    });
  });
}

function toggleTileSelect(tile) {
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

function clearSelection() {
  selectedUids.clear();
  document.querySelectorAll('.word-tile.selected').forEach(t => t.classList.remove('selected'));
  updateSelectionLabel();
  updateMenuState();
}

function updateSelectionLabel() {
  const lbl = document.getElementById('selectedLabel');
  if (selectedUids.size > 0) {
    lbl.textContent = selectedUids.size + ' selected';
    lbl.classList.add('show');
  } else {
    lbl.classList.remove('show');
  }
}

function getSelectedTile() {
  if (selectedUids.size === 0) return null;
  return document.querySelector(`.word-tile[data-uid="${[...selectedUids][0]}"]`);
}
function getSelectedWord()  { return getSelectedTile()?.dataset.word  || ''; }
function getSelectedNumid() { return getSelectedTile()?.dataset.numid || ''; }


// ════════════════════════════════════════════
// MENU STATE — context-sensitive
// 0 selected : Add only
// 1 selected : All operations
// 2+ selected: Add, Regroup, Map, Disable, Trash
// ════════════════════════════════════════════

function updateMenuState() {
  const n = selectedUids.size;

  setMenuItem('menuAdd',    true);
  setMenuItem('menuEdit',   n === 1);
  setMenuItem('menuUpdate', n === 1);
  setMenuItem('menuRename', n === 1);
  setMenuItem('menuRegroup',n >= 1);
  setMenuItem('menuMapBtn', n >= 1);
  setMenuItem('menuDisable',n >= 1);
  setMenuItem('menuTrash',  n >= 1);

  const desc = document.getElementById('mapMenuDesc');
  if (desc) {
    if (n === 0)      desc.textContent = 'Select a word first';
    else if (n === 1) desc.textContent = 'Managing: ' + getSelectedWord();
    else              desc.textContent = 'Map to — ' + n + ' words';
  }
}

function setMenuItem(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  if (visible) { el.classList.remove('hidden', 'disabled'); }
  else         { el.classList.add('hidden'); }
}


// ════════════════════════════════════════════
// HOLD POPUP
// ════════════════════════════════════════════

function showHoldPopup(tile) {
  document.getElementById('popupWord').textContent = tile.dataset.word;
  document.getElementById('popupMeta').textContent =
    tile.dataset.cat + ' · NumId ' + tile.dataset.numid;
  document.getElementById('popupDef').textContent  =
    tile.dataset.def || 'No definition available.';
  document.getElementById('holdOverlay').classList.add('open');
}

function closeHoldPopup() {
  document.getElementById('holdOverlay').classList.remove('open');
}


// ════════════════════════════════════════════
// SEARCH / FILTER VIEW
// ════════════════════════════════════════════

function filterView(q) {
  const lower = q.toLowerCase();
  document.querySelectorAll('.word-tile').forEach(tile => {
    tile.style.display = tile.dataset.word.toLowerCase().includes(lower) ? '' : 'none';
  });
}


// ════════════════════════════════════════════
// CRUD MENU SIDEBAR
// ════════════════════════════════════════════

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

function openOptions() {
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


// ════════════════════════════════════════════
// OPERATION MODALS
// ════════════════════════════════════════════

const OP_MODAL_MAP = {
  add:'addModal', edit:'editModal', update:'updateModal',
  rename:'renameModal', regroup:'regroupModal',
  trash:'trashModal', disable:'disableModal',
};

function openOpModal(type) {
  const id = OP_MODAL_MAP[type];
  if (id) openModal(id);
}
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function bindModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
}


// ════════════════════════════════════════════
// CREATE FORM
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
      if (el.type === 'checkbox') el.checked = false;
      else if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
  document.getElementById('examplesList').innerHTML =
    '<div class="example-row"><textarea class="form-input" placeholder="Example sentence 1…"></textarea></div>';
  document.getElementById('bengaliExList').innerHTML =
    '<div class="example-row"><textarea class="form-input" placeholder="Bengali example 1…"></textarea></div>';
  exCount = 1; bCount = 1;
  showToast('Form cleared');
}


// ════════════════════════════════════════════
// TRANSPORT
// ════════════════════════════════════════════

function simulateUpload() {
  document.getElementById('importPreviewWrap').style.display = 'block';
  document.getElementById('dropZone').style.display = 'none';
}

function resetImport() {
  document.getElementById('importPreviewWrap').style.display = 'none';
  document.getElementById('dropZone').style.display = 'block';
}

function selectFormat(chip) {
  document.querySelectorAll('.format-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
}


// ════════════════════════════════════════════
// MAP PANEL
// ════════════════════════════════════════════

function openMapPanel() {
  if (selectedUids.size === 0) { showToast('Select a word first', 'error'); return; }
  const tile = getSelectedTile();
  if (!tile) return;

  document.getElementById('mapBaseWord').textContent = tile.dataset.word;
  document.getElementById('mapBaseMeta').textContent =
    '[' + tile.dataset.numid + '] · ' + tile.dataset.cat +
    (tile.dataset.label ? ' · ' + tile.dataset.label : '');
  document.getElementById('mapBaseDef').textContent =
    tile.dataset.def || 'No definition available.';

  mapSelectedRefs.clear();
  mapOpenCardId = null;
  document.getElementById('mapRefSelectedLabel').classList.remove('show');

  const overlay = document.getElementById('mapOverlay');
  overlay.style.display = 'flex';
  overlay.offsetHeight; // force reflow for CSS transition
  overlay.classList.add('open');

  switchMapTab('list', document.querySelector('.map-tab'));
  closeMenu();
}

function closeMapPanel() {
  const overlay = document.getElementById('mapOverlay');
  overlay.classList.remove('open');
  overlay.addEventListener('transitionend', () => {
    if (!overlay.classList.contains('open')) overlay.style.display = 'none';
  }, { once: true });
  mapSelectedRefs.clear();
  mapOpenCardId = null;
  closeMapMenu();
}

function switchMapTab(name, btn) {
  document.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.map-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mpanel-' + name).classList.add('active');
}

function openMapMenu() {
  document.getElementById('sidebarOverlay').classList.add('open');
  document.getElementById('mapMenuSidebar').classList.add('open');
}
function closeMapMenu() {
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.getElementById('mapMenuSidebar').classList.remove('open');
}

function toggleMapLookup() {
  document.getElementById('mapLookupPanel').classList.toggle('show');
}
function mapSaveAll() { queueAction('map'); closeMapPanel(); }


// ── Ref row selection ──

function toggleMapRefSelect(id) {
  const row = document.getElementById('mrow-' + id);
  if (!row) return;
  if (mapSelectedRefs.has(id)) { mapSelectedRefs.delete(id); row.classList.remove('selected'); }
  else                          { mapSelectedRefs.add(id);    row.classList.add('selected'); }
  const lbl = document.getElementById('mapRefSelectedLabel');
  if (mapSelectedRefs.size > 0) { lbl.textContent = mapSelectedRefs.size + ' selected'; lbl.classList.add('show'); }
  else                           { lbl.classList.remove('show'); }
}

function deleteMapRef(id) {
  const wrap = document.getElementById('mwrap-' + id);
  if (!wrap) return;
  wrap.style.cssText = 'opacity:0;transform:translateX(20px);transition:all .2s ease';
  setTimeout(() => { wrap.remove(); showToast('↪ Ref queued for deletion', 'warn'); }, 200);
  mapSelectedRefs.delete(id);
}

function deleteMapSelected() {
  if (mapSelectedRefs.size === 0) { showToast('Select references first'); return; }
  [...mapSelectedRefs].forEach(id => deleteMapRef(id));
  mapSelectedRefs.clear();
  document.getElementById('mapRefSelectedLabel').classList.remove('show');
}


// ── Ref card ──

function toggleMapCard(id) {
  const wrapId = 'mwrap-' + id, rowId = 'mrow-' + id, cardId = 'mcard-' + id;

  // Close any other open card
  if (mapOpenCardId !== null && mapOpenCardId !== id) {
    document.getElementById('mcard-' + mapOpenCardId)?.remove();
    document.getElementById('mrow-'  + mapOpenCardId)?.classList.remove('has-card');
    mapOpenCardId = null;
  }

  // Toggle off if same card clicked again
  const existing = document.getElementById(cardId);
  if (existing) {
    existing.remove();
    document.getElementById(rowId)?.classList.remove('has-card');
    mapOpenCardId = null;
    return;
  }

  // Clone template, stamp real ID into all dynamic references
  const tpl   = document.getElementById('mapCardTemplate');
  const clone = tpl.content.cloneNode(true);
  const card  = clone.querySelector('.ref-card');
  card.id = cardId;
  card.querySelectorAll('[id]').forEach(el => { el.id = el.id.replace(/ID/g, String(id)); });
  card.querySelectorAll('[onclick]').forEach(el => { el.setAttribute('onclick', el.getAttribute('onclick').replace(/ID/g, String(id))); });
  card.querySelectorAll('[oninput]').forEach(el => { el.setAttribute('oninput', el.getAttribute('oninput').replace(/ID/g, String(id))); });

  // Pre-fill for existing refs (prototype data; real data comes from dataList)
  const refData = {
    0: { word:'Tendency',    numid:'1.0', uid:'142', type:'coin', conf:'1'    },
    1: { word:'Disposition', numid:'2.0', uid:'88',  type:'infr', conf:'null' },
  };
  if (id !== 'new' && refData[id] !== undefined) {
    const d = refData[id];
    card.querySelector('.ref-word-input').value   = d.word;
    card.querySelector('.ref-numid-input').value  = d.numid;
    card.querySelector('.ref-uid-input').value    = d.uid;
    card.querySelectorAll('.ref-select')[0].value = d.type;
    card.querySelectorAll('.ref-select')[1].value = d.conf;
  }

  document.getElementById(rowId)?.classList.add('has-card');
  document.getElementById(wrapId)?.appendChild(card);
  mapOpenCardId = id;
  updateMapTier(id);
  setTimeout(() => card.scrollIntoView({ behavior:'smooth', block:'nearest' }), 100);
}

function onMapFieldInput(input, id) {
  const field = input.dataset.field, val = input.value.trim();
  const drop  = document.getElementById('mdrop-' + field + '-' + id);
  if (drop) {
    if (!val) { drop.classList.remove('show'); }
    else {
      drop.classList.add('show');
      drop.querySelectorAll('.ref-dropdown-item').forEach(item => {
        const w = (item.dataset.word||'').toLowerCase(), n = item.dataset.numid||'', u = item.dataset.uid||'';
        const m = field==='word' ? w.includes(val.toLowerCase()) : field==='numid' ? n.startsWith(val) : u.startsWith(val);
        item.style.display = m ? '' : 'none';
      });
    }
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

function updateMapTier(id) {
  const card = document.getElementById('mcard-' + id);
  if (!card) return;
  const w = card.querySelector('.ref-word-input').value.trim();
  const n = card.querySelector('.ref-numid-input').value.trim();
  const u = card.querySelector('.ref-uid-input').value.trim();
  const dot   = document.getElementById('mtier-' + id)?.querySelector('.tier-dot');
  const label = document.getElementById('mtier-label-' + id);
  if (!dot || !label) return;
  dot.className = 'tier-dot';
  if (w && n && u)  { dot.classList.add('frozen');     label.textContent = 'Frozen — word + NumId + UID'; }
  else if (w && u)  { dot.classList.add('dynamic');    label.textContent = 'Dynamic — word + UID'; }
  else if (w && n)  { dot.classList.add('persistent'); label.textContent = 'Persistent — word + NumId'; }
  else              { dot.classList.add('isolated');   label.textContent = 'Isolated — word string only'; }
}

function clearMapCard(id) {
  const card = document.getElementById('mcard-' + id);
  if (!card) return;
  card.querySelectorAll('input').forEach(el => el.value = '');
  card.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
  card.querySelectorAll('.ref-dropdown').forEach(d => d.classList.remove('show'));
  updateMapTier(id);
  showToast('Card reset');
}

function saveMapCard(id) {
  const card = document.getElementById('mcard-' + id);
  if (!card) return;
  if (!card.querySelector('.ref-word-input').value.trim()) { showToast('Word is required', 'error'); return; }
  showToast('↪ Reference saved locally', 'success');
  card.remove();
  document.getElementById('mrow-' + id)?.classList.remove('has-card');
  mapOpenCardId = null;
}

// Close ref dropdowns on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.ref-search-field'))
    document.querySelectorAll('.ref-dropdown').forEach(d => d.classList.remove('show'));
});


// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════

function showToast(msg, type) {
  const el = document.getElementById('toastEl');
  el.textContent = msg;
  el.className   = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
