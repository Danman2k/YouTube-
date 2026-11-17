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

  // While a video plays, also loop a silent sound. iOS may pause the video
  // when the screen locks, but keeps the sound going, so Safari stays awake
  // long enough to restart the video. Set to false to turn this off.
  const KEEP_ALIVE_WHILE_PLAYING = true;

  // Hide the Like / Dislike / Share / Save buttons and the "In this video"
  // chip that YouTube sometimes draws on top of the player's own controls.
  // The normal buttons under the video stay. Set to false to turn this off.
  const HIDE_PLAYER_OVERLAY_BUTTONS = true;

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
  // Only taps on the player (or a play/pause button) count, so a tap
  // elsewhere just before pressing the side button doesn't look like a pause.
  let lastIntentAt = 0;
  const markIntent = () => { lastIntentAt = Date.now(); };
  const cancelIntent = () => { lastIntentAt = 0; };
  const INTENT_TARGETS = '#player-container-id, .player-container, ytm-player, #movie_player, .html5-video-player, ' +
    'ytd-player, video, [class*="miniplayer"], ytmusic-player-bar, ytmusic-player';
  const markTapIntent = (e) => {
    try {
      const t = e.target && e.target.closest ? e.target : (e.target && e.target.parentElement);
      if (!t) return;
      if (t.closest(INTENT_TARGETS)) return markIntent();
      const b = t.closest('button, [role="button"]');
      const l = b ? (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '') : '';
      if (/\b(play|pause)\b/i.test(l)) markIntent();
    } catch (_) {}
  };
  for (const type of ['touchend', 'pointerup', 'mouseup', 'click']) {
    window.addEventListener(type, markTapIntent, true);
  }
  window.addEventListener('keydown', markIntent, true);
  for (const type of ['touchcancel', 'pointercancel']) {
    window.addEventListener(type, cancelIntent, true);
  }

  const ms = navigator.mediaSession;
  if (ms && typeof ms.setActionHandler === 'function') {
    const origSet = ms.setActionHandler.bind(ms);
    const pageHandlers = {};
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
      return origSet(action, handler);
    };
    for (const a of ['play', 'pause']) { try { origSet(a, wrap(a)); } catch (_) {} }
  }

  // KEEP THE PLAY BUTTON: once nothing is playing, iOS gives the
  // lock-screen / headphone play button back to Apple Music. While you're
  // paused we loop a silent sound so Safari stays the "Now Playing" app.
  let hold = null;
  let holdAudio = null;
  let stoppingAudio = false;
  let lastVideoActiveAt = 0;   // last time a video was playing or being resumed

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
      holdAudio.addEventListener('pause', () => { if (!stoppingAudio && hold) endHold(); });
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

  function stopSilentAudio() {
    if (!holdAudio || holdAudio.paused) return;
    stoppingAudio = true;
    try { holdAudio.pause(); } catch (_) {}
    stoppingAudio = false;
  }

  // keepAudio: the video is playing again, so keep the silent sound going
  // as the keep-alive instead of stopping it.
  function endHold(keepAudio) {
    if (hold) { clearTimeout(hold.timer); hold = null; }
    if (!keepAudio) stopSilentAudio();
  }

  function startKeepAlive() {
    if (!KEEP_ALIVE_WHILE_PLAYING) return;
    try {
      const a = getHoldAudio();
      if (a.paused) a.play().catch(() => {});
    } catch (_) {}
  }

  // Stop the keep-alive once nothing has played for a while (and we aren't
  // holding the play button), so it never loops forever.
  setInterval(() => {
    if (hold || !holdAudio || holdAudio.paused) return;
    const v = getVideo();
    if (v && !v.paused) { lastVideoActiveAt = Date.now(); return; }
    if (Date.now() - lastVideoActiveAt > 20000) stopSilentAudio();
  }, 2000);

  function resumeFromHold() {
    const v = (hold && hold.video && hold.video.isConnected) ? hold.video : getVideo();
    if (v) v.play().catch(() => {});
    endHold(true);
    try { if (ms) ms.playbackState = 'playing'; } catch (_) {}
  }

  // If the video gets paused while Safari is in the background (Home
  // Screen, another app, screen off) and nobody asked for it, start it again.
  const userPaused = () => Date.now() - lastIntentAt < 1000;
  const inBackground = () => realHidden() || Date.now() - lastBackgroundAt < 5000;

  let resuming = null;
  function resumeInBackground(v) {
    if (resuming === v) return;
    resuming = v;
    LOG('background pause detected, resuming');
    lastVideoActiveAt = Date.now();
    v.play().catch(() => {});                 // straight away, while iOS still lets us
    try { if (ms) ms.playbackState = 'playing'; } catch (_) {}
    // Keep trying for about 15 s, slowing down as we go.
    const delays = [150, 300, 500, 500, 750, 750, 1000, 1000, 1500, 1500, 2000, 2000, 3000];
    let i = 0;
    const retry = () => {
      if (!v.paused || v.ended || userPaused()) { resuming = null; return; }
      if (i >= delays.length) {
        // iOS won't let us restart it. Keep the play button for YouTube so
        // one press on the lock screen continues the video.
        resuming = null;
        LOG('could not resume, holding play button');
        try { if (ms) ms.playbackState = 'paused'; } catch (_) {}
        startHold(v);
        return;
      }
      lastVideoActiveAt = Date.now();
      v.play().catch(() => {});
      setTimeout(retry, delays[i++]);
    };
    setTimeout(retry, delays[i++]);
  }

  // iOS can pause the video a moment *before* the page reports that it
  // went to the background. Remember such a pause briefly and resume it
  // once the background event arrives.
  let pendingPause = null;
  let lastPlayingAt = 0;
  onBackground = () => {
    const p = pendingPause;
    pendingPause = null;
    if (userPaused()) return;
    if (p && Date.now() < p.until && p.video.paused && !p.video.ended) {
      resumeInBackground(p.video);
      return;
    }
    // Paused without a pause event we could judge, but it was playing a
    // moment ago: resume it too.
    const v = getVideo();
    if (v && v.paused && !v.ended && Date.now() - lastPlayingAt < 5000 && !isAdShowing()) resumeInBackground(v);
  };

  const hooked = new WeakSet();
  function hookVideo(v) {
    if (hooked.has(v)) return;
    hooked.add(v);
    v.removeAttribute('disablepictureinpicture');
    try { v.disablePictureInPicture = false; } catch (_) {}
    let wasPlayingAt = 0;
    const playingNow = () => { wasPlayingAt = lastPlayingAt = lastVideoActiveAt = Date.now(); };
    v.addEventListener('playing', () => { playingNow(); endHold(true); startKeepAlive(); });
    v.addEventListener('play', () => { endHold(true); startKeepAlive(); });
    v.addEventListener('timeupdate', () => { if (!v.paused) playingNow(); });
    v.addEventListener('ended', () => endHold());
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
      pendingPause = { video: v, until: now + 5000 }; // background event may follow
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
   * 3b. PLAYER OVERLAY CLEAN-UP: hide Like / Dislike / Share / Save and
   *     "In this video" when YouTube draws them over the player controls.
   *     Matched by label rather than class name, so it survives renames.
   * ------------------------------------------------------------------ */

  const PLAYER_ROOTS = '#player-container-id, .player-container, ytm-player, #movie_player, .html5-video-player, ytd-player';
  const OVERLAY_LABEL_RE = /^(like|dislike|i like this|i dislike this|share|save|save to playlist|in this video)\b/i;
  // Things that belong to the real player and must never be hidden.
  const PLAYER_CONTROL_SEL = [
    'video', '[role="slider"]', 'ytm-progress-bar', '.ytm-progress-bar', '.ytp-progress-bar',
    '.player-controls-middle', '.player-middle-controls', '.ytp-left-controls', '.ytp-chrome-controls',
    '.ytm-time-display', '.ytp-time-display', '.player-settings-icon', '.ytp-settings-button',
  ].join(',');
  const PLAYER_BUTTON_LABEL_RE = /^(play|pause|replay|next|previous|seek|settings|subtitles|captions|cc|full ?screen|exit full|mute|unmute|autoplay|more options|miniplayer|picture)/i;

  function labelOf(el) {
    return ((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '').trim();
  }

  function holdsPlayerControls(el) {
    try {
      if (el.matches(PLAYER_CONTROL_SEL) || el.querySelector(PLAYER_CONTROL_SEL)) return true;
      const btns = el.querySelectorAll('button, [role="button"]');
      for (const b of btns) if (PLAYER_BUTTON_LABEL_RE.test(labelOf(b))) return true;
      if (/\d+:\d\d\s*\/\s*\d+:\d\d/.test(el.textContent || '')) return true; // time readout
    } catch (_) {}
    return false;
  }

  // Walk up from a matched button to the largest wrapper that still holds no
  // real player controls, so the whole floating pill or chip goes at once.
  function overlayContainer(el, root) {
    let top = el;
    let cur = el.parentElement;
    while (cur && cur !== root && root.contains(cur)) {
      if (holdsPlayerControls(cur)) break;
      top = cur;
      cur = cur.parentElement;
    }
    return top;
  }

  function hideOverlayButtons() {
    if (!HIDE_PLAYER_OVERLAY_BUTTONS) return;
    try {
      const roots = document.querySelectorAll(PLAYER_ROOTS);
      roots.forEach((root) => {
        if (root.parentElement && root.parentElement.closest(PLAYER_ROOTS)) return; // handle outermost only
        const hits = [];
        root.querySelectorAll('button, [role="button"], a, yt-chip-cloud-chip-renderer, ytm-chip-cloud-chip-renderer')
          .forEach((b) => {
            if (b.closest('[data-ytbgab-hide]')) return;
            const label = labelOf(b) || (b.children.length <= 3 ? (b.textContent || '').trim() : '');
            if (label && label.length < 60 && OVERLAY_LABEL_RE.test(label)) hits.push(b);
          });
        // A plain text "In this video" chip that isn't a button.
        root.querySelectorAll('span, div, yt-formatted-string').forEach((e) => {
          if (e.children.length === 0 && /^in this video$/i.test((e.textContent || '').trim()) && !e.closest('[data-ytbgab-hide]')) hits.push(e);
        });
        hits.forEach((b) => {
          if (holdsPlayerControls(b)) return;
          const c = overlayContainer(b, root);
          if (c && c !== root && !c.hasAttribute('data-ytbgab-hide')) {
            c.setAttribute('data-ytbgab-hide', '');
            LOG('hid player overlay', label(c));
          }
        });
      });
    } catch (_) {}
  }
  function label(el) { try { return el.tagName.toLowerCase() + '.' + String(el.className || '').trim().replace(/\s+/g, '.'); } catch (_) { return ''; } }

  setInterval(hideOverlayButtons, 500);

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
    ytmusic-mealbar-promo-renderer, ytmusic-statement-banner-renderer, [data-ytbgab-hide]
    { display: none !important; }
  `;

  function injectCss() {
    if (document.getElementById('ytbgab-style')) return;
    const root = document.head || document.documentElement;
    if (!root) { setTimeout(injectCss, 50); return; }
    const s = document.createElement('style');
    s.id = 'ytbgab-style';
    s.textContent = CSS;
    root.appendChild(s);
  }
  injectCss();
  document.addEventListener('DOMContentLoaded', injectCss);

  LOG('loaded');
})();
