// ════════════════════════════════════════════
// state.js — Shared state, queue mechanics
// Load before data.js and any screen script
// ════════════════════════════════════════════

'use strict';

// ── Constants ──────────────────────────────
const SOFT_LIMIT  = 12;
const HARD_LIMIT  = 16;

const LS_SESSION  = 'dictAdminSession';
const LS_QUEUE    = 'dictCommitsQueue';
const LS_REMOVED  = 'dictCommitsRemoved';

// ── Session ────────────────────────────────
function isLoggedIn()  { return !!localStorage.getItem(LS_SESSION); }
function setSession()  { localStorage.setItem(LS_SESSION, '1'); }
function clearSession(){ localStorage.removeItem(LS_SESSION); }

// ── Queue ──────────────────────────────────
function getQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE) || '[]'); } catch { return []; }
}
function saveQueue(q) {
  localStorage.setItem(LS_QUEUE, JSON.stringify(q));
}

function getPendingCount() {
  return getQueue().filter(a => a.state === 'draft').length;
}

// Returns { ok, reason }
// reason: 'hard_limit' | 'soft_limit' | undefined
function pushCommit(commit) {
  const q       = getQueue();
  const pending = q.filter(a => a.state === 'draft').length;
  if (pending >= HARD_LIMIT) return { ok: false, reason: 'hard_limit' };
  q.push(commit);
  saveQueue(q);
  if (pending + 1 >= SOFT_LIMIT) return { ok: true, reason: 'soft_limit' };
  return { ok: true };
}

function makeCommit(op, word, numid, extraData = {}) {
  return {
    id:        'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    op,
    word:      word  || '—',
    numid:     numid != null ? numid : '',
    timestamp: new Date().toISOString(),
    state:     'draft',
    ...extraData,
  };
}

// ── Removed ────────────────────────────────
function getRemoved() {
  try { return JSON.parse(localStorage.getItem(LS_REMOVED) || '[]'); } catch { return []; }
}
function saveRemoved(r) {
  localStorage.setItem(LS_REMOVED, JSON.stringify(r));
}

// ── Helpers ────────────────────────────────
function capFirst(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
