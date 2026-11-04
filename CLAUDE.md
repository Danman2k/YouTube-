# Project notes for Claude

This repo holds Safari userscripts that add YouTube features on the owner's **iPhone** (iOS 27+).

## Target platform
- The owner uses an **iPhone**. Don't build native or Android apps: App Store rules block this kind of app, and sideloading needs a Mac and expires every 7 days.
- Deliver features as **userscripts** run by the free **Userscripts** app (Justin Wasack) in Safari.
- Scripts must run in **Safari itself**. The YouTube app and Home Screen web apps can't run extensions.

## Workflow for a new YouTube Safari feature
1. Prefer adding to `youtube-background-adblock.user.js`. Make a new `*.user.js` only for an unrelated feature.
   - `safari-extension/hide-shorts.user.js` (hides Shorts) is the exception to step 2. The same file is both a userscript and the content script of a Safari Web Extension (`safari-extension/manifest.json`), so it runs in the content-script world: no `@inject-into page`, and it matches only www/m.youtube.com. Bump `version` in `manifest.json` together with `@version`.
2. Header: `@match` www/m/music.youtube.com, `@run-at document-start`, `@inject-into page`, `@grant none`, `@noframes`. Bump `@version` on every change.
3. Write robust code: wrap DOM and media calls in try/catch, and don't use `innerHTML` (YouTube enforces Trusted Types). Use `textContent` for styles.
4. **Test before pushing.** Use the pre-installed Playwright/Chromium with `addInitScript(script)` and `page.route('https://www.youtube.com/**')` serving a mock page. Check for no `pageerror` and that the feature behaves. Put test files in the scratchpad, not the repo.
5. Update `README.md`: the Tips section for features, Limitations, and the "How it works" table.
6. Commit to the session's designated branch, push, and open a PR into `main` when the owner asks. In the PR, say what was tested on a mock page and what is untested on a real iPhone.
7. Give the owner short phone-friendly steps: how to update (re-install from the raw link below, or replace the file in the Userscripts folder), then how to test the feature on the phone.

## Install / update links (work once the repo is public and merged to `main`)
- Background play + ad block: `https://raw.githubusercontent.com/Danman2k/YouTube-/main/youtube-background-adblock.user.js`
- Hide Shorts: `https://raw.githubusercontent.com/Danman2k/YouTube-/main/safari-extension/hide-shorts.user.js`
Open it in Safari, then tap **aA › Userscripts › Install**.

## Known troubleshooting
- **Extension toggle greyed out:** Screen Time › Content & Privacy Restrictions › Web Content must be **Unrestricted**, or the restrictions turned off, before enabling. This fixed it for the owner.
- **Audio stops on lock:** press Play once on the lock screen.
- **Play button goes to Apple Music:** handled by the silent-audio hold (`HOLD_PLAY_BUTTON_MINUTES`).
