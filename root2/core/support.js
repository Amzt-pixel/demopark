// ════════════════════════════════════════════
// support.js — Duplicate tab enforcement
// Depends on: state.js (load first)
// ════════════════════════════════════════════

'use strict';

// ── Message types ─────────────────────────
const MSG = {
  CRUD_QUERY    : 'CRUD_QUERY',
  CRUD_ALIVE    : 'CRUD_ALIVE',
  CRUD_OPEN     : 'CRUD_OPEN',
  CRUD_CLOSED   : 'CRUD_CLOSED',
  COMMITS_QUERY : 'COMMITS_QUERY',
  COMMITS_ALIVE : 'COMMITS_ALIVE',
  COMMITS_OPEN  : 'COMMITS_OPEN',
  COMMITS_CLOSED: 'COMMITS_CLOSED',
};

// ── Determine panel ───────────────────────
const IS_CRUD    = !!document.getElementById('crudScreen');
const IS_COMMITS = !!document.getElementById('commitsScreen');

// ── Screen control ────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

// ── Blocked screen ────────────────────────
function showBlockedScreen(title, message, btn1Text, btn1Action, btn2Text, btn2Action) {
  document.getElementById('blockedTitle').textContent   = title;
  document.getElementById('blockedMessage').textContent = message;

  const btn1 = document.getElementById('blockedBtn1');
  const btn2 = document.getElementById('blockedBtn2');

  btn1.textContent = btn1Text;
  btn1.onclick     = btn1Action;

  btn2.textContent = btn2Text;
  btn2.onclick     = btn2Action;

  showScreen('blockedScreen');
}

// ── Broadcast helper ──────────────────────
function broadcast(type) {
  _channel.postMessage({ type, from: MY_TAB_ID });
}

// ── Query helper ──────────────────────────
// Sends a query, waits ms for expected response
// Resolves true if response received, false if timeout
function query(sendType, expectType, ms = 200) {
  return new Promise(resolve => {
    let resolved = false;

    const handler = e => {
      if (e.data?.from === MY_TAB_ID) return;
      if (e.data?.type === expectType) {
        resolved = true;
        _channel.removeEventListener('message', handler);
        resolve(true);
      }
    };

    _channel.addEventListener('message', handler);
    broadcast(sendType);

    setTimeout(() => {
      if (!resolved) {
        _channel.removeEventListener('message', handler);
        resolve(false);
      }
    }, ms);
  });
}

// ── Message listener ──────────────────────
function onMessage(e) {
  const msg = e.data;
  if (!msg || msg.from === MY_TAB_ID) return;

  switch (msg.type) {

    case MSG.CRUD_QUERY:
      if (_isActiveCrud)    broadcast(MSG.CRUD_ALIVE);
      break;

    case MSG.COMMITS_QUERY:
      if (_isActiveCommits) broadcast(MSG.COMMITS_ALIVE);
      break;

    case MSG.CRUD_CLOSED:
      // Commits loses its session if CRUD closes
      if (_isActiveCommits) {
        _isActiveCommits = false;
        showBlockedScreen(
          'Session Ended',
          'The CRUD panel was closed. Commits requires an active CRUD session.',
          'Visit CRUD', () => window.open('../crud/', '_blank'),
          'Close Tab',  () => window.close()
        );
      }
      break;
  }
}

// ── CRUD init ─────────────────────────────
async function initCrud() {
  _channel = new BroadcastChannel('dict_admin_channel');
  _channel.onmessage = onMessage;

  const anotherCrudExists = await query(MSG.CRUD_QUERY, MSG.CRUD_ALIVE);

  if (anotherCrudExists) {
    showBlockedScreen(
      'Already Open',
      'The CRUD panel is already active in another tab.',
      'Refresh',   () => location.reload(),
      'Close Tab', () => window.close()
    );
    _channel.close();
    return;
  }

  // Claim CRUD
  _isActiveCrud = true;
  broadcast(MSG.CRUD_OPEN);

  window.addEventListener('beforeunload', () => {
    broadcast(MSG.CRUD_CLOSED);
    _channel.close();
  });

  // Auth check via crudgate
  if (!checkAuth()) return;
}

// ── Commits init ──────────────────────────
async function initCommits() {
  _channel = new BroadcastChannel('dict_admin_channel');
  _channel.onmessage = onMessage;

  // Check for duplicate Commits tab
  const anotherCommitsExists = await query(MSG.COMMITS_QUERY, MSG.COMMITS_ALIVE);

  if (anotherCommitsExists) {
    showBlockedScreen(
      'Already Open',
      'The Commits panel is already active in another tab.',
      'Close Tab', () => window.close(),
      'Refresh',   () => location.reload()
    );
    _channel.close();
    return;
  }

  // Check for active CRUD session
  const crudExists = await query(MSG.CRUD_QUERY, MSG.CRUD_ALIVE);

  if (!crudExists) {
    showBlockedScreen(
      'No Active Session',
      'Commits requires an active CRUD session. Open the CRUD panel first.',
      'Visit CRUD', () => window.open('../crud/', '_blank'),
      'Close Tab',  () => window.close()
    );
    _channel.close();
    return;
  }

  // Claim Commits
  _isActiveCommits = true;
  broadcast(MSG.COMMITS_OPEN);

  window.addEventListener('beforeunload', () => {
    broadcast(MSG.COMMITS_CLOSED);
    _channel.close();
  });

  // Auth check via crudgate
  if (!checkAuth()) return;
}

// ── Entry point ───────────────────────────
window.addEventListener('load', () => {
  if (!('BroadcastChannel' in window)) {
    console.warn('BroadcastChannel not supported');
    return;
  }
  if (IS_CRUD)    initCrud();
  if (IS_COMMITS) initCommits();
});
