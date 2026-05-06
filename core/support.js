// ════════════════════════════════════════════
// support.js — Single tab enforcement
// Uses BroadcastChannel (no localStorage race)
// Load FIRST before any other script
// ════════════════════════════════════════════

'use strict';

const CHANNEL_NAME = 'dict_admin_tab';
const MY_TAB_ID    = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

let _channel      = null;
let _pingInterval = null;
let _isActive     = false;

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
    if (!_isActive) {
      claimTab();
    }
  }, 200);
});

// ── Message handler ───────────────────────
function onMessage(e) {
  const msg = e.data;
  if (!msg || msg.from === MY_TAB_ID) return;

  switch (msg.type) {

    case 'TAB_QUERY':
      if (_isActive) {
        _channel.postMessage({ type: 'TAB_ACTIVE', from: MY_TAB_ID });
      }
      break;

    case 'TAB_ACTIVE':
      if (!_isActive) {
        showBlockedScreen();
      }
      break;

    case 'TAB_CLOSED':
      if (!_isActive) {
        setTimeout(() => {
          claimTab();
          const blocked = document.getElementById('blockedScreen');
          if (blocked?.classList.contains('active')) {
            location.reload();
          }
        }, 100 + Math.random() * 200);
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
        <div class="gate-subtitle" style="margin-bottom:32px;text-align:center;max-width:280px">
          The admin panel is already open in another tab.<br>
          Close that tab first, then reload this one.
        </div>
        <button class="gate-btn" style="max-width:280px;background:var(--surface2);color:var(--navy)" onclick="location.reload()">
          Try Again
        </button>
      </div>`;
    document.body.appendChild(blocked);
  } else {
    blocked.classList.add('active');
  }
}
