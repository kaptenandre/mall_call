# Mall Call

Sound-driven logo animation for LED panels, built in three layers:

1. **Base**: rare and big. Sweeps, strobes, floods, blackouts on the strongest hits.
2. **Glitch**: eased lines, chases, and debris driven by bass, mids and highs.
3. **Logo**: a loader that builds the logo, or the logo cutting in on hits.

Drop in a logo (SVG or PNG) and a sound file. The cut follows the sound; a trigger pad adds moments by hand; the piece can be split into parts with their own look. Exports MP4 with the audio.

## Install

No Terminal needed.

1. Go to [the latest release](https://github.com/kaptenandre/mall_call/releases/latest) and download the file for your Mac: **Apple silicon** for any Mac from late 2020 on (M1, M2, M3, M4), **Intel** for older ones. Not sure? Apple menu, About This Mac: "Chip: Apple" means Apple silicon.
2. Double-click the zip, then drag **Mall Call** to your Applications folder.
3. Open it. The first time, macOS stops it because it does not come from the App Store:
   - Press **Done** on the warning.
   - Open **System Settings**, **Privacy & Security**, scroll down to "Mall Call was blocked", and press **Open Anyway**.
   - Open Mall Call again and press **Open**. This is only asked once.

After that the app keeps itself up to date. New work arrives by itself a few minutes after it is made. Now and then the app itself changes; it then says "A newer Mall Call app is ready" with a Download button, and you repeat the three steps.

Exports to ProRes and HAP work out of the box: the downloaded app carries its own ffmpeg.

To share projects, everyone points the library at the same shared Dropbox folder: Versions, Change folder. Then choose your name on that page.

## For developers

Needs Node 20 or newer.

```
npm install      # once
npm start        # build the page and open the app
npm run smoke    # start-up check: loads hidden, tests encoders and project files, prints one SMOKE line
npm run dist     # package dist/Mall Call-darwin-arm64/Mall Call.app
```

The download is built by `.github/workflows/app.yml` whenever the app itself changes on `main` (`main.js`, `preload.js`, `update.js`, `assemble.js`, the scripts), for both kinds of Mac, and published as a release. Page-only work under `src/` needs no new download: the app fetches it.

The app is signed ad hoc, not with an Apple Developer ID, and is not notarised. That is why macOS asks the first time. A Developer ID (Apple's paid developer programme) would take that step away.

## Where things live

| Path | What |
| --- | --- |
| `src/engine.js` | Timing engine: sound analysis, hits, the eased clock, events, per-frame state. No DOM. |
| `src/page.html` | Interface, the three layer fields, the five drawing styles, renderer, export. |
| `main.js` | Mac app: window, menus, project files, autosave, save dialogs. |
| `preload.js` | The small bridge the page sees as `window.nativeApp`. |
| `scripts/build.js` | Builds `app/index.html` (offline, for the app) and `web/index.html` (for a browser). |
| `scripts/dist.js` | Packages and signs the app. |
| `CLAUDE.md` | Context and design rules for working on this with Claude Code. |

The page is one source for both targets. Without `window.nativeApp` it behaves as a normal web page.

## Files the app writes

- Projects: `.mallcall` (JSON) wherever you save them. Older `.cllproj` files still open. A project holds all settings, parts and triggers, the logo itself, and the path to the sound file.
- Session: the current state is kept in `~/Library/Application Support/Mall Call/autosave.json` and restored on launch.
- Exports: wherever the save dialog points, `Movies` by default.

## Next

- Syphon output to Resolume (planned with the `node-syphon` package, which needs building against Electron on the Mac).
- MIDI on the trigger pad.
- A clean output window for a second display.
- ProRes or HAP export through ffmpeg.
