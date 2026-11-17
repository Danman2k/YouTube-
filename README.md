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
- **If audio stops when you lock the phone or go to the Home Screen,** press **Play** on the lock screen or in Control Center. It will keep going from then on. iOS sometimes pauses media at the moment Safari goes to the background. The script keeps retrying for about 15 seconds. If iOS still won't allow it, the script keeps the lock-screen Play button pointed at YouTube, so one press continues the video.
- **Silent keep-alive:** while a video plays, the script also loops a silent sound. iOS may pause the video when the screen locks but leaves the sound running, so Safari stays awake long enough to restart the video. It stops by itself about 20 seconds after nothing is playing. To turn it off, set `KEEP_ALIVE_WHILE_PLAYING` at the top of the script to `false`.
- Lock-screen and Control Center play/pause buttons work as normal. The script only restarts pauses you didn't ask for.
- **The play button stays with YouTube after you pause.** For 30 minutes after a pause, the script loops a silent sound so iOS keeps Safari as the "Now Playing" app. Pressing play on the lock screen, in Control Center or on your headphones resumes YouTube instead of starting Apple Music. While it holds, the script checks every 2 seconds and puts back the Now Playing info and its button handlers if YouTube or iOS cleared them. When you press play, it keeps trying for about 6 seconds, using YouTube's own player too. If the video still doesn't start, it keeps holding so the next press can try again. If you open another music app, the script lets go immediately. To change the time, edit `HOLD_PLAY_BUTTON_MINUTES` at the top of the script (`0` turns this off).
- **Picture-in-Picture:** start a video in fullscreen, then swipe home.
- **Buttons over the player:** YouTube sometimes draws Like / Dislike / Share / Save and an "In this video" chip on top of the player's own controls, covering the time and progress bar. The script hides that overlay. The normal buttons under the video still work. To turn this off, set `HIDE_PLAYER_OVERLAY_BUTTONS` at the top of the script to `false`.

## Limitations

- YouTube keeps changing how ads are delivered. Sometimes it splices them directly into the video stream, and then they can't be removed in advance. When that happens the script falls back to muting and fast-forwarding the ad. If ads start getting through more often, the selectors in the script may need an update.
- The player overlay is found by its button labels (Like, Share, Save, "In this video"), not by YouTube's internal names. If YouTube changes the labels or the language isn't English, the overlay may show again.
- Blocking ads goes against YouTube's Terms of Service. This is for personal use; YouTube Premium is the officially supported way to get these features.

## How it works

| Feature | Technique |
| --- | --- |
| Background play | Fakes `document.hidden` / `visibilityState` and blocks `visibilitychange`, so YouTube never sees that the page went to the background. Pauses you didn't ask for are resumed, with retries for about 15 seconds, including ones iOS makes up to 5 seconds before the page reports that it went to the background. Only a finished tap on the player or a play/pause button, a key press, or a lock-screen button counts as your pause, so a tap elsewhere just before locking doesn't. A looping silent sound runs alongside the video, so Safari isn't frozen while the script retries. |
| Ad removal | Hooks `JSON.parse`, `Response.json` and `ytInitialPlayerResponse`, and deletes `adPlacements`, `adSlots` and `playerAds` from the player data. |
| Ad skipping | Every 300 ms: when the player shows `ad-showing`, the script mutes the ad, sets 16× speed, seeks to the end and clicks "Skip". |
| Player overlay clean-up | Every 500 ms: inside the player, finds Like / Dislike / Share / Save buttons and the "In this video" chip, walks up to the largest wrapper that holds no real player controls (play, time, progress bar) and hides it. |
| Play-button hold | Loops a near-silent sound (about −90 dB, not pure digital silence) after you pause. Every 2 s it restores the Now Playing info, `playbackState` and the play/pause handlers. A press of Play retries `video.play()` and YouTube's `playVideo()` for about 6 s, and the hold stays until the video really plays. |
| Page ads | CSS hides ad and promo elements on m.youtube.com, www.youtube.com and music.youtube.com. |
