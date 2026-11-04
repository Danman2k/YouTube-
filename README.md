# YouTube Background Play + Ad Block (iPhone)

> **Also here:** [`safari-extension/`](safari-extension/) is a Safari extension (also usable as a userscript) that hides YouTube Shorts from your feed.

A Safari userscript that gives YouTube on iPhone two Premium-style features:

- **Background play**: audio keeps going when you lock the screen or switch apps.
- **Ad blocking**: removes video ads before they load. Any ad that still gets through is muted, fast-forwarded and skipped. Banner, feed and "sponsored" ads are hidden too.

It also dismisses "Video paused. Continue watching?" and re-enables Picture-in-Picture.

It runs in **Safari** through the free, open-source **Userscripts** app. You don't need a computer, sideloading or a jailbreak.

## Setup (about 2 minutes)

1. **Install "Userscripts"** from the App Store (the developer is Justin Wasack).
2. Open the **Userscripts** app once and tap **Set Userscripts Directory**. Choose or create a folder, for example *On My iPhone › Userscripts*.
3. **Turn on the extension:** go to *Settings › Apps › Safari › Extensions › Userscripts*. Switch it **on** and set **youtube.com** (or "All Websites") to **Allow**.
4. **Add the script.** Pick one:
   - **Option A (easiest, needs a public repo):** in Safari, open
     `https://raw.githubusercontent.com/danman2k/youtube-/main/youtube-background-adblock.user.js`,
     tap the **puzzle-piece / "aA"** icon in the address bar, choose **Userscripts**, then tap **Install**.
   - **Option B:** download `youtube-background-adblock.user.js` into the Userscripts folder from step 2 using the Files app.
5. Open **m.youtube.com** in Safari and play a video. Lock the phone and the audio keeps playing.

## Opening YouTube from your Home Screen

iOS doesn't run Safari extensions, including Userscripts, inside Home Screen **web apps**. A YouTube icon added the usual way opens without the ad blocker and without Shorts hidden. Make an icon that opens **in Safari** instead:

**iOS 26 and later**
1. If you already have a YouTube web app on your Home Screen, delete it.
2. Open **m.youtube.com** in Safari and tap **Share › Add to Home Screen**.
3. Turn **off** "Open as Web App", then tap **Add**.

The icon now opens YouTube in a Safari tab, and both scripts work there.

**Any iOS version (Shortcuts)**
1. Open the **Shortcuts** app and tap **+**. Add the **Open URLs** action with `https://m.youtube.com`.
2. Tap the shortcut's name, choose **Add to Home Screen**, and pick an icon if you like.

The only difference from a web app is that Safari's address bar stays visible.

## Tips

- **Use Safari itself.** The YouTube app and Home Screen *web apps* can't run extensions. See [Opening YouTube from your Home Screen](#opening-youtube-from-your-home-screen) for an icon that works.
- **If audio stops when you lock the phone,** press **Play** on the lock screen or in Control Center. It will keep going from then on. iOS sometimes pauses media at the moment the screen locks; the script tries to resume it automatically, but iOS doesn't always allow that.
- Lock-screen and Control Center play/pause buttons work as normal. The script only restarts pauses you didn't ask for.
- **The play button stays with YouTube after you pause.** For 30 minutes after a pause, the script loops a silent sound so iOS keeps Safari as the "Now Playing" app. Pressing play on the lock screen, in Control Center or on your headphones resumes YouTube instead of starting Apple Music. If you open another music app, the script lets go immediately. To change the time, edit `HOLD_PLAY_BUTTON_MINUTES` at the top of the script (`0` turns this off).
- **Picture-in-Picture:** start a video in fullscreen, then swipe home.

## Limitations

- YouTube keeps changing how ads are delivered. Sometimes it splices them directly into the video stream, and then they can't be removed in advance. When that happens the script falls back to muting and fast-forwarding the ad. If ads start getting through more often, the selectors in the script may need an update.
- Blocking ads goes against YouTube's Terms of Service. This is for personal use; YouTube Premium is the officially supported way to get these features.

## How it works

| Feature | Technique |
| --- | --- |
| Background play | Fakes `document.hidden` / `visibilityState` and blocks `visibilitychange`, so YouTube never sees that the page went to the background. Pauses you didn't ask for (no tap and no lock-screen button) are resumed. |
| Ad removal | Hooks `JSON.parse`, `Response.json` and `ytInitialPlayerResponse`, and deletes `adPlacements`, `adSlots` and `playerAds` from the player data. |
| Ad skipping | Every 300 ms: when the player shows `ad-showing`, the script mutes the ad, sets 16× speed, seeks to the end and clicks "Skip". |
| Page ads | CSS hides ad and promo elements on m.youtube.com, www.youtube.com and music.youtube.com. |
