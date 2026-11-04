// ==UserScript==
// @name         YouTube: Hide Shorts
// @namespace    https://github.com/danman2k/youtube-
// @version      1.0.0
// @description  Removes YouTube Shorts from the home feed, subscriptions, search, recommendations and navigation, and opens any Shorts link in the normal player. Works as a Safari Web Extension content script and as a userscript.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

// This one file is used two ways:
//   1. As the content script of the Safari Web Extension (see manifest.json).
//   2. As a userscript for the "Userscripts" Safari app on iPhone/iPad/Mac.

(function () {
  'use strict';

  if (window.__ytHideShorts) return;
  window.__ytHideShorts = true;

  // Open /shorts/<id> links in the regular video player instead of the
  // Shorts swipe feed. Set to false to leave Shorts URLs alone.
  const REDIRECT_SHORTS_TO_WATCH = true;

  const SHORTS_LINK = 'a[href^="/shorts/"], a[href^="https://www.youtube.com/shorts/"], a[href^="https://m.youtube.com/shorts/"]';

  /* ------------------------------------------------------------------ *
   * 1. CSS: hide Shorts shelves, Shorts videos and Shorts nav entries.
   *    Safari 15.4+ supports :has(), which does most of the work.
   * ------------------------------------------------------------------ */
  const HIDE = [
    // ---- Desktop (www.youtube.com) ----
    // Shorts shelves on Home, Subscriptions, Search and the watch page
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
    'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model)',
    'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model-v2)',
    'ytd-item-section-renderer:has(> #contents > ytd-reel-shelf-renderer:only-child)',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2)',
    // Individual Shorts mixed into a feed or list
    `ytd-rich-item-renderer:has(${SHORTS_LINK})`,
    `ytd-video-renderer:has(${SHORTS_LINK})`,
    `ytd-grid-video-renderer:has(${SHORTS_LINK})`,
    `ytd-compact-video-renderer:has(${SHORTS_LINK})`,
    `ytd-playlist-video-renderer:has(${SHORTS_LINK})`,
    `yt-lockup-view-model:has(${SHORTS_LINK})`,
    'ytd-rich-item-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
    'ytd-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
    'ytd-grid-video-renderer:has(ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"])',
    // "Shorts" in the left sidebar and the collapsed mini sidebar
    'ytd-guide-entry-renderer:has(a[title="Shorts"])',
    'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
    'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
    'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
    // "Shorts" tab on channel pages
    'yt-tab-shape[tab-title="Shorts"]',
    'tp-yt-paper-tab:has(> .tab-content[tab-title="Shorts"])',

    // ---- Mobile (m.youtube.com) ----
    'ytm-reel-shelf-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer)',
    'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model)',
    'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model-v2)',
    'ytm-item-section-renderer:has(ytm-reel-shelf-renderer)',
    `ytm-rich-item-renderer:has(${SHORTS_LINK})`,
    `ytm-video-with-context-renderer:has(${SHORTS_LINK})`,
    `ytm-compact-video-renderer:has(${SHORTS_LINK})`,
    // "Shorts" button in the bottom navigation bar
    'ytm-pivot-bar-item-renderer:has(.pivot-shorts)',
    'ytm-pivot-bar-item-renderer:has(a[href^="/shorts"])',
  ];

  const CSS = HIDE.join(',\n') + ' { display: none !important; }\n' +
    '[data-yt-hide-shorts] { display: none !important; }\n';

  function injectCss() {
    if (document.getElementById('yt-hide-shorts-css')) return;
    const root = document.head || document.documentElement;
    if (!root) { setTimeout(injectCss, 20); return; }
    const style = document.createElement('style');
    style.id = 'yt-hide-shorts-css';
    style.textContent = CSS;
    root.appendChild(style);
  }
  injectCss();
  document.addEventListener('DOMContentLoaded', injectCss);

  /* ------------------------------------------------------------------ *
   * 2. JS fallback for anything the CSS misses (new layouts, shelves
   *    whose only clue is the "Shorts" heading).
   * ------------------------------------------------------------------ */
  const ITEM_CONTAINERS = [
    'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-grid-video-renderer',
    'ytd-compact-video-renderer', 'ytd-playlist-video-renderer', 'yt-lockup-view-model',
    'ytm-rich-item-renderer', 'ytm-video-with-context-renderer', 'ytm-compact-video-renderer',
    'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2',
  ].join(',');

  const SHELF_CONTAINERS = [
    'ytd-rich-section-renderer', 'ytd-shelf-renderer', 'ytd-item-section-renderer',
    'ytm-rich-section-renderer', 'ytm-item-section-renderer', 'grid-shelf-view-model',
  ].join(',');

  const SHELF_TITLES = 'h2, #title, .shelf-title, [class*="shelf-header"] span, yt-shelf-header-layout span';

  const hide = (el) => { if (el && !el.hasAttribute('data-yt-hide-shorts')) el.setAttribute('data-yt-hide-shorts', ''); };

  function sweep() {
    // Don't hide anything on the Shorts page itself or on a channel's
    // Shorts tab if you went there on purpose with redirect turned off.
    if (/^\/shorts(\/|$)/.test(location.pathname)) return;

    document.querySelectorAll(SHORTS_LINK).forEach((a) => {
      if (a.closest('[data-yt-hide-shorts]')) return;
      hide(a.closest(ITEM_CONTAINERS));
    });

    document.querySelectorAll(SHELF_CONTAINERS).forEach((shelf) => {
      if (shelf.hasAttribute('data-yt-hide-shorts')) return;
      const title = shelf.querySelector(SHELF_TITLES);
      if (title && title.textContent.trim() === 'Shorts') hide(shelf);
    });
  }

  let queued = false;
  function scheduleSweep() {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; sweep(); }, 150);
  }

  function startObserver() {
    if (!document.documentElement) { setTimeout(startObserver, 20); return; }
    new MutationObserver(scheduleSweep).observe(document.documentElement, { childList: true, subtree: true });
    scheduleSweep();
  }
  startObserver();

  /* ------------------------------------------------------------------ *
   * 3. Open Shorts in the normal player.
   *    YouTube is a single-page app, so we watch the URL rather than
   *    relying on page loads.
   * ------------------------------------------------------------------ */
  function redirectShorts() {
    if (!REDIRECT_SHORTS_TO_WATCH) return;
    const m = location.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
    if (m) location.replace(`${location.origin}/watch?v=${m[1]}`);
  }
  redirectShorts();

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    redirectShorts();
    scheduleSweep();
  }, 300);
  window.addEventListener('popstate', redirectShorts);

  // Catch taps on Shorts links before YouTube opens the Shorts player.
  window.addEventListener('click', (e) => {
    if (!REDIRECT_SHORTS_TO_WATCH || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest && e.target.closest('a[href*="/shorts/"]');
    if (!a) return;
    const m = new URL(a.href, location.href).pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
    if (!m) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    location.assign(`${location.origin}/watch?v=${m[1]}`);
  }, true);
  document.addEventListener('yt-navigate-finish', () => { redirectShorts(); scheduleSweep(); });
})();
