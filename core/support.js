// ════════════════════════════════════════════
// support.js — Single tab enforcement
// Load FIRST before any other script
// ════════════════════════════════════════════

'use strict';

const TAB_KEY    = 'dictAdminTabId';
const TAB_PING   = 'dictAdminTabPing';
const TAB_CLOSE  = 'dictAdminTabClose';

// Generate a unique ID for this tab
const MY_TAB_ID  = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

let _pingInterval = null;

// ── On load ──────────────────────────────
window.addEventListener('load', () => {
  const existing = localStorage.getItem(TAB_KEY);

  if (existing && existing !== MY_TAB_ID) {
    // Another tab is already active — show blocked screen
    showBlockedScreen();
    return;
  }

  // Claim the tab
  claimTab();
  startPing();
});

// ── On unload — release the tab ──────────
window.addEventListener('beforeunload', () => {
  if (localStorage.getItem(TAB_KEY) === MY_TAB_ID) {
    localStorage.removeItem(TAB_KEY);
    // Signal other tabs they can now claim
    localStorage.setItem(TAB_CLOSE, MY_TAB_ID);
    localStorage.removeItem(TAB_CLOSE);
  }
  clearInterval(_pingInterval);
});

// ── Listen for storage events from other tabs ──
window.addEventListener('storage', e => {
  // Another tab claimed the slot
  if (e.key === TAB_KEY && e.newValue && e.newValue !== MY_TAB_ID) {
    showBlockedScreen();
    return;
  }

  // Active tab closed — try to claim
  if (e.key === TAB_CLOSE) {
    tryClaimAfterClose();
    return;
  }

  // Active tab ping — if we're blocked, update the UI
  if (e.key === TAB_PING && document.getElementById('blockedScreen')?.classList.contains('active')) {
    // Still another active tab, stay blocked
  }
});

// ── Claim ────────────────────────────────
function claimTab() {
  localStorage.setItem(TAB_KEY, MY_TAB_ID);
}

function tryClaimAfterClose() {
  // Small delay to avoid race between multiple waiting tabs
  setTimeout(() => {
    const current = localStorage.getItem(TAB_KEY);
    // Slot is free — claim it and reload to resume normal flow
    if (!current) {
      claimTab();
      // Remove blocked screen if showing
      const blocked = document.getElementById('blockedScreen');
      if (blocked?.classList.contains('active')) {
        location.reload();
      }
    }
  }, 100 + Math.random() * 200);
}

// ── Ping — prove this tab is alive ───────
function startPing() {
  _pingInterval = setInterval(() => {
    if (localStorage.getItem(TAB_KEY) === MY_TAB_ID) {
      localStorage.setItem(TAB_PING, MY_TAB_ID + '_' + Date.now());
    }
  }, 3000);
}

// ── Blocked screen ───────────────────────
function showBlockedScreen() {
  clearInterval(_pingInterval);

  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  // Show blocked screen if it exists, otherwise create it
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
