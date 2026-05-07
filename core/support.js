// ════════════════════════════════════════════
// support.js — Duplicate tab prevention
// Uses localStorage flags only.
// Load FIRST before any other script.
// ════════════════════════════════════════════

'use strict';

const LS_CRUD_ACTIVE    = 'dictCrudActive';
const LS_COMMITS_ACTIVE = 'dictCommitsActive';

// ── Determine which panel this is ────────
const IS_CRUD    = !!document.getElementById('crudScreen');
const IS_COMMITS = !!document.getElementById('commitsScreen');

// ── Show a screen by ID ───────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

// ── Populate and show the blocked screen ──
function showBlockedScreen(title, message, btn1Text, btn1Action, btn2Text, btn2Action) {
  document.getElementById('blockedTitle').textContent   = title;
  document.getElementById('blockedMessage').textContent = message;

  const btn1 = document.getElementById('blockedBtn1');
  const btn2 = document.getElementById('blockedBtn2');

  btn1.textContent = btn1Text;
  btn1.onclick     = btn1Action;
  btn1.classList.remove('hidden');

  if (btn2Text) {
    btn2.textContent = btn2Text;
    btn2.onclick     = btn2Action;
    btn2.classList.remove('hidden');
  } else {
    btn2.classList.add('hidden');
  }

  showScreen('blockedScreen');
}

// ── CRUD panel init ───────────────────────
function initCrud() {
  if (localStorage.getItem(LS_CRUD_ACTIVE)) {
    showBlockedScreen(
      'Already Open',
      'The CRUD panel is already active in another tab.',
      'Refresh',   () => location.reload(),
      'Close Tab', () => window.close()
    );
    return;
  }

  localStorage.setItem(LS_CRUD_ACTIVE, '1');

  window.addEventListener('beforeunload', () => {
    localStorage.removeItem(LS_CRUD_ACTIVE);
  });
}

// ── Commits panel init ────────────────────
function initCommits() {
  if (localStorage.getItem(LS_COMMITS_ACTIVE)) {
    showBlockedScreen(
      'Already Open',
      'The Commits panel is already active in another tab.',
      'Close Tab', () => window.close(),
      'Refresh',   () => location.reload()
    );
    return;
  }

  if (!localStorage.getItem(LS_CRUD_ACTIVE)) {
    showBlockedScreen(
      'No Active Session',
      'Commits requires an active CRUD session. Open the CRUD panel first.',
      'Visit CRUD', () => { window.location.href = '../crud/'; },
      'Close Tab',  () => window.close()
    );
    return;
  }

  localStorage.setItem(LS_COMMITS_ACTIVE, '1');

  window.addEventListener('beforeunload', () => {
    localStorage.removeItem(LS_COMMITS_ACTIVE);
  });
}

// ── Entry point ───────────────────────────
window.addEventListener('load', () => {
  if (IS_CRUD)    initCrud();
  if (IS_COMMITS) initCommits();
});
