// ════════════════════════════════════════════
// support.js — Single tab enforcement
// Uses BroadcastChannel — no localStorage
// Load FIRST before any other script
// ════════════════════════════════════════════

'use strict';

const CHANNEL_NAME = 'dict_admin_tab';
const MY_TAB_ID    = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

let _channel      = null;
let _pingInterval = null;
let _isActive     = false;
let _checkTimer   = null;  // used during tryUnblock

// ── Init ─────────────────────────────────
window.addEventListener('load', () => {
  if (!('BroadcastChannel' in window)) {
    console.warn('BroadcastChannel not supported — tab enforcement disabled');
    return;
  }

  _channel = new BroadcastChannel(CHANNEL_NAME);
  _channel.onmessage = onMessage;

  // Ask if any other tab is already active
  _channel.postMessage({ type: 'TAB_QUERY', from: MY_TAB_ID });

  // Give existing tabs 200ms to respond
  setTimeout(() => {
    if (!_isActive) claimTab();
  }, 200);
});

// ── Message handler ───────────────────────
function onMessage(e) {
  const msg = e.data;
  if (!msg || msg.from === MY_TAB_ID) return;

  switch (msg.type) {

    case 'TAB_QUERY':
      // Another tab asking — if we're active, tell them
      if (_isActive) {
        _channel.postMessage({ type: 'TAB_ACTIVE', from: MY_TAB_ID });
      }
      break;

    case 'TAB_ACTIVE':
      if (!_isActive) {
        if (_checkTimer !== null) {
          // We're in a tryUnblock check — another tab responded, still blocked
          clearTimeout(_checkTimer);
          _checkTimer = null;
          showBlockedToast('Another tab is still active');
        } else {
          // Normal flow — block this tab
          showBlockedScreen();
        }
      }
      break;

    case 'TAB_CLOSED':
      // Active tab closed — if we're blocked, offer unblock without reload
      if (!_isActive) {
        setBlockedMessage('The other tab closed. Press "Check Again" to resume here.');
      }
      break;
  }
}

// ── Claim ────────────────────────────────
function claimTab() {
  _isActive = true;
  startPing();
}

// ── Ping ─────────────────────────────────
function startPing() {
  _pingInterval = setInterval(() => {
    if (_isActive) {
      _channel.postMessage({ type: 'TAB_ACTIVE', from: MY_TAB_ID });
    }
  }, 4000);
}

// ── On close ─────────────────────────────
window.addEventListener('beforeunload', () => {
  if (_isActive) {
    _channel.postMessage({ type: 'TAB_CLOSED', from: MY_TAB_ID });
  }
  clearInterval(_pingInterval);
  _channel?.close();
});

// ── Try unblock — NO reload ───────────────
// Called by the "Check Again" button on the blocked screen
function tryUnblock() {
  if (_isActive) return;

  // Ask again if any active tab exists
  _channel.postMessage({ type: 'TAB_QUERY', from: MY_TAB_ID });

  // Wait 250ms for a response
  // If TAB_ACTIVE arrives → onMessage handles it (showBlockedToast)
  // If nothing arrives → we're clear to claim
  _checkTimer = setTimeout(() => {
    _checkTimer = null;
    if (!_isActive) {
      // No response — we can claim
      claimTab();
      hideBlockedScreen();
    }
  }, 250);
}

// ── Blocked screen ───────────────────────
function showBlockedScreen() {
  clearInterval(_pingInterval);
  _isActive = false;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  let blocked = document.getElementById('blockedScreen');
  if (!blocked) {
    blocked = document.createElement('div');
    blocked.id        = 'blockedScreen';
    blocked.className = 'screen active';
    blocked.innerHTML = `
      <div class="gate-wrap">
        <div class="gate-title" style="color:var(--danger)">Tab Blocked</div>
        <div class="gate-subtitle" id="blockedMsg" style="margin-bottom:32px;text-align:center;max-width:300px;color:rgba(255,255,255,.5)">
          The admin panel is already open in another tab.<br>
          Close that tab, then press Check Again.
        </div>
        <button class="gate-btn" style="max-width:280px" onclick="tryUnblock()">
          Check Again
        </button>
        <div id="blockedToast" style="margin-top:14px;font-size:12px;color:var(--danger);opacity:0;transition:opacity .3s;min-height:18px;text-align:center;"></div>
      </div>`;
    document.body.appendChild(blocked);
  } else {
    blocked.classList.add('active');
  }
}

function hideBlockedScreen() {
  const blocked = document.getElementById('blockedScreen');
  if (!blocked) return;
  blocked.classList.remove('active');

  // Restore whichever screen should be active
  // Gate screen is the default if not logged in, crud/commits otherwise
  const cruds    = document.getElementById('crudScreen');
  const commits  = document.getElementById('commitsScreen');
  const gate     = document.getElementById('gateScreen');
  const noSess   = document.getElementById('noSessionScreen');

  if      (cruds)   cruds.classList.add('active');
  else if (commits) commits.classList.add('active');
  else if (noSess)  noSess.classList.add('active');
  else if (gate)    gate.classList.add('active');
}

function setBlockedMessage(msg) {
  const el = document.getElementById('blockedMsg');
  if (el) el.innerHTML = msg;
}

function showBlockedToast(msg) {
  const el = document.getElementById('blockedToast');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
