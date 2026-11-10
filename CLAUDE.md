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
- `main.js`, `preload.js`: the Mac app. The page sees the bridge as `window.nativeApp` and behaves as a normal web page without it.
- `scripts/build.js`: writes `app/index.html` (offline, bundled fonts and encoder) and `web/index.html` (CDN links).
- `scripts/dist.js`: packaging, icon, signing.

`src/page.html` is still large. New areas go in their own file under `src/`, added to the marker list in `scripts/build.js`. All files share the page's one script scope, so order matters only for code that runs at load.

## How it works

- A **score** holds curves sampled every 10 ms (level, bass pulse, glitch amount, band levels, spectrum), the **moves** (one per detected hit), the glitch clock (**steps**, holds of one to five frames), and **phi**, the eased clock.
- With no sound loaded the score is a seamless loop on a half-second beat; everything in it must stay cyclic so exports loop.
- **Events** (`EV`) are things that happen at a time: base sweeps and strobes, glitch bursts, chases, logo load, show and hide. The engine schedules some (`makeEvents`); the trigger pad adds more, pinned to the timeline and included in export.
- **Parts** split the piece. Layer, look, pixel and colour settings are kept per part (`PART_KEYS`); `S` always holds the part under the playhead.
- Each layer returns how lit a point is, 0 to 1. A style draws that field. The renderer adds the layers, then gain, trails, flash and glow.
- **The timeline** is where the piece is programmed. Nothing is performed live: the show is pre-programmed and played back. Clips on the three layer lanes are events; the dim ones are the automatic cut (`autoEv`), the filled ones are the user's (`userEv`). `autoCut` switches the automatic cut off per layer, and Bake turns it into user clips.
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

Known, 2026-11: everything is pre-programmed, nothing is performed live, and the show has to follow SMPTE from the lighting desk. Proposed and not yet confirmed: Mall Call is the tool that makes and programs the content, and the plan is to export a file and let a playback tool (Resolume or TouchDesigner) chase SMPTE from the lighting desk and handle mapping, Syphon and the screen outputs. So the timeline and the export matter most. Timecode chase and Syphon inside this app are optional extras, not the main path. Confirm before building them.

## Not verified yet

- The timeline editor has been driven with a mouse in Chromium on Linux only. Trackpad pinch and scroll, and Cmd+Z through the Edit menu, are untried on the Mac.
- The output window works in Chromium. Full screen on a chosen screen (`output-place` in `main.js`) is untried on any machine.
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
