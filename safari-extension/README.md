# Hide YouTube Shorts (Safari)

Removes YouTube Shorts from Safari on Mac, iPhone and iPad:

- Shorts shelves on **Home**, **Subscriptions**, **Search** and the watch-page sidebar
- Individual Shorts mixed into any feed or list
- The **Shorts** button in the sidebar (desktop) and bottom bar (mobile), and the **Shorts** tab on channel pages
- Any Shorts link you open goes to the **normal video player**, not the swipe feed. To turn this off, set `REDIRECT_SHORTS_TO_WATCH = false` at the top of `hide-shorts.user.js`.

It works on `www.youtube.com` and `m.youtube.com` in Safari. It can't run in the YouTube app or in Home Screen web apps. To get a Home Screen icon that still hides Shorts, see [Opening YouTube from your Home Screen](../README.md#opening-youtube-from-your-home-screen).

There are two ways to install it. Both use the same file, `hide-shorts.user.js`.

## Option 1: Userscripts app (iPhone, iPad or Mac; no Xcode needed)

This is the quickest way, especially on iPhone.

1. Install **Userscripts** from the App Store (the developer is Justin Wasack). Open it once and set a scripts folder.
2. Turn the extension on: *Settings › Apps › Safari › Extensions › Userscripts*. Switch it **on** and allow **youtube.com**. On a Mac: *Safari › Settings › Extensions*.
3. In Safari, open
   `https://raw.githubusercontent.com/danman2k/youtube-/main/safari-extension/hide-shorts.user.js`,
   tap the **puzzle-piece / "aA"** icon, choose **Userscripts**, then tap **Install**.
   (Or copy the file into your Userscripts folder with the Files app.)

## Option 2: a real Safari extension (needs a Mac with Xcode)

This folder is a complete Manifest V3 web extension. Apple only runs Safari extensions that are wrapped in an app, so Xcode builds that wrapper for you:

```sh
xcrun safari-web-extension-converter safari-extension \
  --app-name "Hide YouTube Shorts" --bundle-identifier com.yourname.hideshorts --swift
```

1. Xcode opens the generated project. Choose the **macOS** (or **iOS**) scheme and press **Run** (⌘R).
2. **Mac:** in Safari, turn on *Settings › Advanced › Show features for web developers*, then *Develop › Allow Unsigned Extensions*. Enable **Hide YouTube Shorts** in *Settings › Extensions* and allow it on youtube.com.
3. **iPhone/iPad:** set your Apple ID as the signing **Team** under *Signing & Capabilities* and run it on your device. Then enable it in *Settings › Apps › Safari › Extensions*.

A free Apple ID works for running it on your own devices. With a free account, an iOS build stops working after 7 days and you need to run it from Xcode again. "Allow Unsigned Extensions" on the Mac also resets each time Safari restarts. A paid developer account avoids both.

## How it works

- **CSS** hides Shorts components such as `ytd-reel-shelf-renderer`, `ytm-shorts-lockup-view-model` and `ytd-rich-shelf-renderer[is-shorts]`, plus any feed item that links to `/shorts/` (using `:has()`, which needs Safari 15.4+).
- **A MutationObserver** catches Shorts that YouTube adds as you scroll, and shelves whose only clue is a "Shorts" heading. The heading check only works when YouTube is in English.
- **URL watching** sends `/shorts/<id>` to `/watch?v=<id>`, including taps on Shorts links.

YouTube renames its page elements from time to time. If Shorts start showing up again, the lists at the top of `hide-shorts.user.js` are the place to update.
