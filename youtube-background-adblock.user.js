// ==UserScript==
// @name         YouTube Background Play + Ad Block
// @namespace    https://github.com/danman2k/youtube-
// @version      1.4.0
// @description  Keeps YouTube playing with the screen off / Safari in the background, and blocks or skips ads. Built for Safari on iPhone via the "Userscripts" app.
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  if (window.__ytbgab) return;
  window.__ytbgab = true;

  // How long (minutes) Safari keeps hold of the lock-screen / headphone play
  // button after you pause, so pressing play resumes YouTube instead of
  // Apple Music. Set to 0 to turn this off.
  const HOLD_PLAY_BUTTON_MINUTES = 30;

  // Headphone double-click ("next track") skips ahead this many seconds
  // instead of jumping to the next video; triple-click goes back. The
  // lock-screen next/previous buttons do the same. Set to 0 to keep
  // YouTube's normal next/previous video behaviour.
  const HEADPHONE_SKIP_SECONDS = 15;

  // Turn the phone sideways on a video page and the video fills the whole
  // screen; turn it back upright to return to the normal page. Set to false
  // to turn this off.
  const LANDSCAPE_FILL_SCREEN = true;

  const LOG = (...a) => { try { console.debug('[yt-bg-ab]', ...a); } catch (_) {} };

  /* ------------------------------------------------------------------ *
   * 1. BACKGROUND PLAY
   *    YouTube pauses the video when the page reports itself hidden.
   *    We tell it the page is always visible and swallow the events.
   * ------------------------------------------------------------------ */

  const protoHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const realHidden = () => {
    try { return protoHidden ? protoHidden.get.call(document) : false; } catch (_) { return false; }
  };

  const spoof = (prop, value) => {
    try { Object.defineProperty(document, prop, { configurable: true, get: () => value }); } catch (_) {}
  };
  spoof('hidden', false);
  spoof('webkitHidden', false);
  spoof('visibilityState', 'visible');
  spoof('webkitVisibilityState', 'visible');
  try { document.hasFocus = () => true; } catch (_) {}

  // When the page really goes to the background (Home Screen, app
  // switcher, lock). We still see these events even though YouTube doesn't.
  let lastBackgroundAt = 0;
  let onBackground = () => {};
  const blockEvent = (e) => {
    if (e.target !== window && e.target !== document) return;
    e.stopImmediatePropagation();
    if (e.type === 'pagehide' || e.type === 'freeze' || e.type === 'blur' || realHidden()) {
      lastBackgroundAt = Date.now();
      onBackground();
    }
  };
  for (const type of ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'blur', 'freeze']) {
    window.addEventListener(type, blockEvent, true);
    document.addEventListener(type, blockEvent, true);
  }

  // Track whether a pause was something *you* asked for (tap in the page,
  // or the play/pause button on the lock screen / Control Center).
  // Only finished taps count. The swipe up to the Home Screen starts as a
  // touch on the page, but iOS cancels it, so it never reaches touchend.
  let lastIntentAt = 0;
  const markIntent = () => { lastIntentAt = Date.now(); };
  const cancelIntent = () => { lastIntentAt = 0; };
  for (const type of ['touchend', 'pointerup', 'mouseup', 'keydown', 'click']) {
    window.addEventListener(type, markIntent, true);
  }
  for (const type of ['touchcancel', 'pointercancel']) {
    window.addEventListener(type, cancelIntent, true);
  }

  const ms = navigator.mediaSession;
  if (ms && typeof ms.setActionHandler === 'function') {
    const origSet = ms.setActionHandler.bind(ms);
    const pageHandlers = {};
    const SKIP_ACTIONS = { nexttrack: 1, seekforward: 1, previoustrack: -1, seekbackward: -1 };
    const skipHandler = (action) => (details) => {
      const secs = (details && details.seekOffset) || HEADPHONE_SKIP_SECONDS;
      skipBy(SKIP_ACTIONS[action] * secs);
    };
    const wrap = (action) => (details) => {
      markIntent();
      if (hold && (action === 'play' || action === 'pause')) return resumeFromHold();
      if (pageHandlers[action]) return pageHandlers[action](details);
      const v = getVideo();
      if (!v) return;
      if (action === 'play') v.play().catch(() => {});
      if (action === 'pause') v.pause();
    };
    ms.setActionHandler = function (action, handler) {
      if (action === 'play' || action === 'pause' || action === 'stop') {
        pageHandlers[action] = handler || null;
        return origSet(action, wrap(action));
      }
      if (HEADPHONE_SKIP_SECONDS > 0 && action in SKIP_ACTIONS) {
        pageHandlers[action] = handler || null;
        return origSet(action, skipHandler(action));
      }
      return origSet(action, handler);
    };
    for (const a of ['play', 'pause']) { try { origSet(a, wrap(a)); } catch (_) {} }
    if (HEADPHONE_SKIP_SECONDS > 0) {
      for (const a of Object.keys(SKIP_ACTIONS)) { try { origSet(a, skipHandler(a)); } catch (_) {} }
    }
  }

  // Jump forward (positive) or back (negative) in the current video.
  // Ignored while an ad is playing, so the ad skipper stays in charge.
  function skipBy(seconds) {
    try {
      const v = getVideo();
      if (!v || isAdShowing()) return;
      const end = isFinite(v.duration) ? Math.max(0, v.duration - 0.5) : Infinity;
      v.currentTime = Math.min(end, Math.max(0, v.currentTime + seconds));
      LOG('skipped', seconds, 's');
    } catch (_) {}
  }

  // KEEP THE PLAY BUTTON: once nothing is playing, iOS gives the
  // lock-screen / headphone play button back to Apple Music. While you're
  // paused we loop a silent sound so Safari stays the "Now Playing" app.
  let hold = null;
  let holdAudio = null;

  function silentWavUrl() {
    const rate = 8000, n = rate; // 1 second, 8-bit mono, silent
    const buf = new Uint8Array(44 + n);
    const dv = new DataView(buf.buffer);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    str(36, 'data'); dv.setUint32(40, n, true);
    buf.fill(128, 44);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function getHoldAudio() {
    if (!holdAudio) {
      holdAudio = new Audio(silentWavUrl());
      holdAudio.loop = true;
      holdAudio.setAttribute('playsinline', '');
      // Paused by someone else (e.g. you started Apple Music): let go.
      holdAudio.addEventListener('pause', () => { if (hold) endHold(); });
    }
    return holdAudio;
  }

  function startHold(video) {
    if (HOLD_PLAY_BUTTON_MINUTES <= 0 || hold) return;
    const meta = ms ? ms.metadata : null;
    hold = { video, meta, timer: setTimeout(endHold, HOLD_PLAY_BUTTON_MINUTES * 60000) };
    const a = getHoldAudio();
    try { a.currentTime = 0; } catch (_) {}
    a.play().then(() => {
      if (!hold || !ms) return;
      try { if (hold.meta) ms.metadata = hold.meta; } catch (_) {}
      try { ms.playbackState = 'paused'; } catch (_) {}
      LOG('holding play button');
    }).catch(() => { hold = null; });
  }

  function endHold() {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold = null;
    if (holdAudio && !holdAudio.paused) holdAudio.pause();
  }

  function resumeFromHold() {
    const v = (hold && hold.video && hold.video.isConnected) ? hold.video : getVideo();
    if (v) v.play().catch(() => {});
    endHold();
    try { if (ms) ms.playbackState = 'playing'; } catch (_) {}
  }

  // If the video gets paused while Safari is in the background (Home
  // Screen, another app, screen off) and nobody asked for it, start it again.
  const userPaused = () => Date.now() - lastIntentAt < 1500;
  const inBackground = () => realHidden() || Date.now() - lastBackgroundAt < 3000;

  function resumeInBackground(v) {
    LOG('background pause detected, resuming');
    v.play().catch(() => {});                 // straight away, while iOS still lets us
    try { if (ms) ms.playbackState = 'playing'; } catch (_) {}
    let tries = 0;
    const retry = () => {
      if (!v.paused || v.ended || userPaused() || tries++ > 8) return;
      v.play().catch(() => {});
      setTimeout(retry, 500);
    };
    setTimeout(retry, 150);
  }

  // iOS can pause the video a moment *before* the page reports that it
  // went to the background. Remember such a pause briefly and resume it
  // once the background event arrives.
  let pendingPause = null;
  onBackground = () => {
    const p = pendingPause;
    pendingPause = null;
    if (p && Date.now() < p.until && p.video.paused && !p.video.ended && !userPaused()) {
      resumeInBackground(p.video);
    }
  };

  const hooked = new WeakSet();
  function hookVideo(v) {
    if (hooked.has(v)) return;
    hooked.add(v);
    v.removeAttribute('disablepictureinpicture');
    try { v.disablePictureInPicture = false; } catch (_) {}
    let wasPlayingAt = 0;
    v.addEventListener('playing', () => { wasPlayingAt = Date.now(); endHold(); });
    v.addEventListener('play', endHold);
    v.addEventListener('timeupdate', () => { if (!v.paused) wasPlayingAt = Date.now(); });
    v.addEventListener('pause', () => {
      const now = Date.now();
      if (v.ended) return;
      if (now - wasPlayingAt > 4000) return;          // wasn't really playing
      if (userPaused()) {                             // you paused it
        pendingPause = null;
        if (!isAdShowing()) startHold(v);
        return;
      }
      if (inBackground()) { resumeInBackground(v); return; }
      pendingPause = { video: v, until: now + 2000 }; // background event may follow
    });
  }

  function getVideo() {
    return document.querySelector('#movie_player video, .html5-video-player video, video.html5-main-video, video');
  }

  /* ------------------------------------------------------------------ *
   * 2. AD BLOCKING (layer 1): strip ad data before the player sees it
   * ------------------------------------------------------------------ */

  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];

  function prune(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      let hit = false;
      for (const k of AD_KEYS) {
        if (k in obj) { delete obj[k]; hit = true; }
      }
      if (obj.playerResponse) prune(obj.playerResponse);
      if (Array.isArray(obj)) for (const item of obj) if (item && item.playerResponse) prune(item.playerResponse);
      if (hit) LOG('removed ad data');
    } catch (_) {}
    return obj;
  }

  const origParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    return prune(origParse.call(this, text, reviver));
  };
  JSON.parse.toString = () => origParse.toString();

  if (window.Response && Response.prototype.json) {
    const origJson = Response.prototype.json;
    Response.prototype.json = function () {
      return origJson.call(this).then(prune);
    };
  }

  // Inline page data: `var ytInitialPlayerResponse = {...}`
  for (const name of ['ytInitialPlayerResponse', 'playerResponse']) {
    let store;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => store,
        set: (v) => { store = prune(v); },
      });
    } catch (_) {}
  }

  /* ------------------------------------------------------------------ *
   * 3. AD BLOCKING (layer 2): if an ad still plays, mute it, fast
   *    forward it, and press "Skip".
   * ------------------------------------------------------------------ */

  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-container button',
    'button.ytp-ad-skip-button-slot',
    '.ytm-ad-skip-button',
    '[id^="skip-button"] button',
  ].join(',');

  let adActive = false;
  let savedMuted = false;
  let savedRate = 1;

  function isAdShowing() {
    return !!document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting, #movie_player.ad-showing');
  }

  function adTick() {
    const v = getVideo();
    if (v) hookVideo(v);

    document.querySelectorAll(SKIP_SELECTORS).forEach((b) => { try { b.click(); } catch (_) {} });

    if (!v) return;
    if (isAdShowing()) {
      if (!adActive) {
        adActive = true;
        savedMuted = v.muted;
        savedRate = v.playbackRate || 1;
        LOG('ad detected, skipping');
      }
      v.muted = true;
      try { v.playbackRate = 16; } catch (_) { try { v.playbackRate = 4; } catch (__) {} }
      if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.25) {
        try { v.currentTime = v.duration - 0.1; } catch (_) {}
      }
      if (v.paused) v.play().catch(() => {});
    } else if (adActive) {
      adActive = false;
      v.muted = savedMuted;
      try { v.playbackRate = savedRate; } catch (_) {}
    }

    // Dismiss "Video paused. Continue watching?" prompts.
    document.querySelectorAll('yt-confirm-dialog-renderer #confirm-button, ytm-dialog .yt-spec-button-shape-next--call-to-action, .ytmusic-you-there-renderer button')
      .forEach((b) => {
        const t = (b.closest('[role="dialog"], ytm-dialog, tp-yt-paper-dialog, ytmusic-you-there-renderer') || b).textContent || '';
        if (/continue watching|still watching|paused/i.test(t)) { try { b.click(); } catch (_) {} }
      });
  }

  setInterval(adTick, 300);

  /* ------------------------------------------------------------------ *
   * LANDSCAPE = FULL SCREEN
   *    iOS only allows real fullscreen after a tap, so on rotation we make
   *    the player cover the whole screen with CSS instead.
   * ------------------------------------------------------------------ */

  const FILL_ATTR = 'data-ytbgab-fill';
  const FILL_ANCESTOR_ATTR = 'data-ytbgab-fill-ancestor';
  const landscapeQuery = window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;

  function clearFill() {
    try {
      document.documentElement.classList.remove('ytbgab-fill');
      document.querySelectorAll('[' + FILL_ATTR + '], [' + FILL_ANCESTOR_ATTR + ']').forEach((el) => {
        el.removeAttribute(FILL_ATTR);
        el.removeAttribute(FILL_ANCESTOR_ATTR);
      });
    } catch (_) {}
  }

  function updateLandscapeFill() {
    try {
      if (!LANDSCAPE_FILL_SCREEN || !document.documentElement) return;
      const landscape = landscapeQuery ? landscapeQuery.matches : window.innerWidth > window.innerHeight;
      const onWatchPage = location.pathname === '/watch' || location.pathname.startsWith('/live/');
      // Only phones/tablets: a desktop browser window is usually "landscape".
      const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const v = getVideo();
      const player = v && (v.closest('.html5-video-player') || v.parentElement);
      if (!(landscape && onWatchPage && touch && player && !document.webkitFullscreenElement && !document.fullscreenElement)) {
        if (document.documentElement.classList.contains('ytbgab-fill')) clearFill();
        return;
      }
      if (player.hasAttribute(FILL_ATTR) && document.documentElement.classList.contains('ytbgab-fill')) return;
      clearFill();
      player.setAttribute(FILL_ATTR, '');
      // A transformed ancestor would trap position:fixed inside it.
      for (let el = player.parentElement; el && el !== document.body; el = el.parentElement) {
        el.setAttribute(FILL_ANCESTOR_ATTR, '');
      }
      document.documentElement.classList.add('ytbgab-fill');
      window.scrollTo(0, 0);
      // Let YouTube re-lay out its controls for the new size.
      setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (_) {} }, 50);
      LOG('landscape fill on');
    } catch (_) {}
  }

  if (LANDSCAPE_FILL_SCREEN) {
    if (landscapeQuery) {
      try { landscapeQuery.addEventListener('change', updateLandscapeFill); }
      catch (_) { try { landscapeQuery.addListener(updateLandscapeFill); } catch (__) {} }
    }
    window.addEventListener('orientationchange', () => setTimeout(updateLandscapeFill, 100));
    setInterval(updateLandscapeFill, 500);
  }

  const FILL_CSS = `
    html.ytbgab-fill, html.ytbgab-fill body { overflow: hidden !important; }
    html.ytbgab-fill [${FILL_ANCESTOR_ATTR}] {
      transform: none !important; filter: none !important; contain: none !important;
      will-change: auto !important; z-index: 2147483646 !important;
    }
    html.ytbgab-fill [${FILL_ATTR}] {
      position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
      width: 100vw !important; height: 100vh !important; height: 100dvh !important;
      max-width: none !important; max-height: none !important; margin: 0 !important;
      transform: none !important; z-index: 2147483647 !important; background: #000 !important;
    }
    html.ytbgab-fill [${FILL_ATTR}] video {
      position: absolute !important; top: 0 !important; left: 0 !important;
      width: 100% !important; height: 100% !important; object-fit: contain !important;
    }
  `;

  /* ------------------------------------------------------------------ *
   * 4. AD BLOCKING (layer 3): hide banner, feed and sponsored ads
   * ------------------------------------------------------------------ */

  const CSS = `
    #masthead-ad, #player-ads, #panels > ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
    ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer, ytd-statement-banner-renderer,
    ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer, ytd-display-ad-renderer, ytd-compact-promoted-video-renderer,
    ytd-action-companion-ad-renderer, ytd-player-legacy-desktop-watch-ads-renderer, ytd-search-pyv-renderer,
    ytd-rich-item-renderer:has(ytd-ad-slot-renderer), ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
    ytd-merch-shelf-renderer, ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model),
    ad-slot-renderer, ytm-promoted-sparkles-web-renderer, ytm-promoted-video-renderer, ytm-companion-ad-renderer,
    ytm-companion-slot, ytm-rich-item-renderer:has(ad-slot-renderer), ytm-item-section-renderer:has(ad-slot-renderer),
    ytm-item-section-renderer:has(ytm-promoted-sparkles-web-renderer), ytm-statement-banner-renderer, ytm-mealbar-promo-renderer,
    .ytp-ad-overlay-container, .ytp-ad-overlay-slot, .ytp-ad-image-overlay, .ytp-suggested-action-badge,
    ytmusic-mealbar-promo-renderer, ytmusic-statement-banner-renderer
    { display: none !important; }
  `;

  function injectCss() {
    if (document.getElementById('ytbgab-style')) return;
    const root = document.head || document.documentElement;
    if (!root) { setTimeout(injectCss, 50); return; }
    const s = document.createElement('style');
    s.id = 'ytbgab-style';
    s.textContent = CSS + (LANDSCAPE_FILL_SCREEN ? FILL_CSS : '');
    root.appendChild(s);
  }
  injectCss();
  document.addEventListener('DOMContentLoaded', injectCss);

  LOG('loaded');
})();
