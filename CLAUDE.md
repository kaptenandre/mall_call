# Mall Call: notes for working on this project

Sound-driven logo animation for LED panels, made for an art installation. Electron app for macOS; the same source also builds a plain web page.

## Commands

```
npm install      # once
npm start        # build the page, open the app
npm run smoke    # start-up check. Prints one line starting with SMOKE and exits 0 when clean
npm test         # node checks for automation curves and timecode maths. Prints TEST ok
npm run dist     # package and ad-hoc sign dist/Mall Call-darwin-arm64/Mall Call.app
```

Run `npm run smoke` and `npm test` after every change. A clean smoke run has `"errors":[]`, `"roundTrip":true`, `"restored":true`, `"timeline":true`, `"h264":true`.

On Linux (cloud sessions) Electron needs a display and no sandbox: `node scripts/build.js && xvfb-run -a npx electron . --smoke --no-sandbox`. `"aac":false` is expected there.

## Layout

- `src/engine.js`: timing engine, no DOM. Sound analysis (`analyze`), hit picking, the score (`buildTrackScore`, `buildLoopScore`), scheduled events (`makeEvents`), and the per-frame state (`stateAt`).
- `src/timeline.js`: the timeline editor. Rows, clips, keys (`auto`, `PAt`, `setKey`), zoom, snapping, the inspector strip and undo. Inlined at `/*__TIMELINE__*/`.
- `src/timecode.js`: SMPTE maths, MIDI timecode and LTC encode and decode, no DOM. Inlined at `/*__TIMECODE__*/`. Only the maths is used by the interface so far.
- `src/output.js`: the clean output window and the timecode settings. Inlined at `/*__OUTPUT__*/`.
- `scripts/test.js`: node checks for the two files with no DOM.
- `src/page.html`: interface, the three layer fields (`baseField`, `fxField`, `logoField`), the five drawing styles (`DRAW.rods`, `streaks`, `ascii`, `ridge`, `dither`), `Renderer`, export, parts, trigger pad, project files. The engine is inlined at the `/*__SCORE__*/` marker.
- `assemble.js`: puts the page together from `src/build.json` (the page and the files that replace its markers). Shared by the build and the updater.
- `update.js`: the app updating its own page from GitHub. See Updates below.
- `main.js`, `preload.js`: the Mac app. The page sees the bridge as `window.nativeApp` and behaves as a normal web page without it.
- `scripts/build.js`: writes `app/index.html` (offline, bundled fonts and encoder) and `web/index.html` (CDN links).
- `scripts/dist.js`: packaging, icon, signing.

`src/page.html` is still large. New areas go in their own file under `src/`, added to `src/build.json`. All files share the page's one script scope, so order matters only for code that runs at load.

## How it works

- A **score** holds curves sampled every 10 ms (level, bass pulse, glitch amount, band levels, spectrum), the **moves** (one per detected hit), the glitch clock (**steps**, holds of one to five frames), and **phi**, the eased clock.
- With no sound loaded the score is a seamless loop on a half-second beat; everything in it must stay cyclic so exports loop.
- **Events** (`EV`) are things that happen at a time: base sweeps and strobes, glitch bursts, chases, logo load, show and hide. The engine schedules some (`makeEvents`); the trigger pad adds more, pinned to the timeline and included in export.
- **Parts** split the piece. Layer, look, pixel and colour settings are kept per part (`PART_KEYS`); `S` always holds the part under the playhead.
- Each layer returns how lit a point is, 0 to 1. A style draws that field. The renderer adds the layers, then gain, trails, flash and glow.
- **The timeline** is where the piece is programmed. Nothing is performed live: the show is pre-programmed and played back. Clips on the three layer lanes are events; the dim ones are the automatic cut (`autoEv`), the filled ones are the user's (`userEv`). `autoCut` (`base`, `fx`, `logo`) switches the automatic cut off per layer, and Bake turns it into user clips.
- **The automatic cut** (`makeEvents`) hangs its clips on the shape of the track (`makeStructure`: drops, builds, breaks, and the moments bass, mids and highs jump). Base goes to drops first, with a blackout in the breath before one. The glitch lane gets a chase through a build, line volleys that come faster into the drop, and blocks, bars and sparks on their own bands. Breaks are left alone. How many: `baseAmt` and `fxAmt` (Auto clips), per part.
- **Keys** animate a setting over time (`auto[key] = [{ t, v, c }]`). `PAt(t)` gives the settings in force at a time: the part's, with animated ones read off their keys. Use `PAt`, never `parts[...].P`, when drawing. Settings that change the schedule (How often, How much, Chaos, Easing) and Logo size are not animatable.
- Timecode: the piece has a rate and a start timecode (`S.tcRate`, `S.tcStart` in frames) so the ruler reads like the lighting desk.
- Export renders every frame offline with WebCodecs and muxes MP4 with `mp4-muxer`.

## Design rules. These came from the director and are not up for change without asking

1. Three layers. **Base**: rare and big (sweeps, strobe), only on the strongest hits. **Glitch**: lines, chases, debris, mostly fairly high-res. **Logo** on top: a loader that builds it, or it cutting in sometimes.
2. The logo never glides or zooms softly. It cuts between poses through a few wrong frames. Movement on the logo is glitch.
3. Fast ease in and out belongs to the lines in the glitch layer.
4. Nothing moves at constant speed. Everything surges and settles (the eased clock `phi`, per-element `swing`, eased chases and loader). If something looks linear, it is a bug.
5. Glitch is organic: irregular holds, noise-driven tear and slip, never a fixed clock. Avoid visible repetition; variety comes from the seed.
6. Debris in the glitch layer is driven by its own part of the spectrum: bass, mids, highs.
7. Pixels are controllable: dither type, shape, fill, size per layer.
8. Panels are 1 x 3. The ring of 30 panels is a guess from renders; confirm the real count and pixel size before locking formats.
9. Interface text is English, short, and never uses em dashes.
10. The app ships with a placeholder ring. The real logo is dropped in by the user as a file. Do not draw brand logos in code.

## How it is meant to run at the show

Decided by the user, 2026-11: everything is pre-programmed, nothing is performed live, and the show has to follow SMPTE from the lighting desk. Playback runs in another program (Resolume or TouchDesigner): export a file and let that program chase the desk and handle mapping, Syphon and the screen outputs. So the timeline and the export matter most. Playing straight out of this app (timecode chase, Syphon) would be a welcome extra, after the export is solid.

## Updates

The packaged app keeps its page up to date by itself. At launch `update.js` asks GitHub for the newest commit on the branch chosen in the Updates menu (`main` by default; off when run from source), fetches `src/build.json` and the files it names, assembles them with `assemble.js` and loads that copy from the app's data folder. Offline it uses the last copy it has, or the built-in page.

Only the page updates this way. A change to `main.js`, `preload.js`, `update.js` or `assemble.js` needs `git pull` and `npm run dist` on the Mac; the Updates menu says so when it sees one. So keep new work in `src/` where possible, and when a page change needs a new bridge function, make the page work without it too.

## Not verified yet

- The timeline editor has been driven with a mouse in Chromium on Linux only. Trackpad pinch and scroll, and Cmd+Z through the Edit menu, are untried on the Mac.
- The output window works in Chromium. Full screen on a chosen screen (`output-place` in `main.js`) is untried on any machine.
- The updater is tested against a local stand-in for GitHub on Linux (first fetch, already current, missing branch, offline) and the two real GitHub addresses answer. It has not run in the packaged Mac app.
- The automatic cut's structure reading is tested on one synthetic track. It has not been judged by eye or ear on real music.
- LTC and MTC are tested as maths only (encode, decode, round trip). No audio or MIDI device is wired up.

- On macOS (Apple silicon) the smoke check passes with H.264 and AAC, and the packaged app builds and launches. Nobody has looked closely at the window yet, so the interface itself is unchecked on the Mac.
- Save and open dialogs and a real export have not been exercised by hand.
- Preview performance with three layers at 1920 x 1080 on real hardware.

## Next, roughly in order

1. Use it on the Mac for a real session and fix whatever that shows.
2. ProRes or HAP export through ffmpeg (Homebrew ffmpeg is installed on the main machine), with the start timecode written into the file.
3. More in the timeline: select and move several clips, copy and paste, loop a range, markers with names.
4. If wanted: chase LTC or MTC for previewing against the desk (the maths is in `src/timecode.js`; needs Web MIDI and microphone permission handlers in `main.js`).
5. If wanted: Syphon output. `node-syphon` 1.5.x ships a prebuilt binary and `SyphonMetalServer.publishImageData(data, region, size, flipped)`. Test against Resolume Arena.
