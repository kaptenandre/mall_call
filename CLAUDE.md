# Mall Call: notes for working on this project

Sound-driven logo animation for LED panels, made for an art installation. Electron app for macOS; the same source also builds a plain web page.

## Commands

```
npm install      # once
npm start        # build the page, open the app
npm run smoke    # start-up check. Prints one line starting with SMOKE and exits 0 when clean
npm run dist     # package and ad-hoc sign dist/Mall Call-darwin-arm64/Mall Call.app
```

Run `npm run smoke` after every change. A clean run has `"errors":[]`, `"roundTrip":true`, `"restored":true`, `"h264":true`.

## Layout

- `src/engine.js`: timing engine, no DOM. Sound analysis (`analyze`), hit picking, the score (`buildTrackScore`, `buildLoopScore`), scheduled events (`makeEvents`), and the per-frame state (`stateAt`).
- `src/page.html`: interface, the three layer fields (`baseField`, `fxField`, `logoField`), the five drawing styles (`DRAW.rods`, `streaks`, `ascii`, `ridge`, `dither`), `Renderer`, export, parts, trigger pad, project files. The engine is inlined at the `/*__SCORE__*/` marker.
- `main.js`, `preload.js`: the Mac app. The page sees the bridge as `window.nativeApp` and behaves as a normal web page without it.
- `scripts/build.js`: writes `app/index.html` (offline, bundled fonts and encoder) and `web/index.html` (CDN links).
- `scripts/dist.js`: packaging, icon, signing.

`src/page.html` is one large file. Splitting it into modules is a sensible early step, but keep both build targets working.

## How it works

- A **score** holds curves sampled every 10 ms (level, bass pulse, glitch amount, band levels, spectrum), the **moves** (one per detected hit), the glitch clock (**steps**, holds of one to five frames), and **phi**, the eased clock.
- With no sound loaded the score is a seamless loop on a half-second beat; everything in it must stay cyclic so exports loop.
- **Events** (`EV`) are things that happen at a time: base sweeps and strobes, glitch bursts, chases, logo load, show and hide. The engine schedules some (`makeEvents`); the trigger pad adds more, pinned to the timeline and included in export.
- **Parts** split the piece. Layer, look, pixel and colour settings are kept per part (`PART_KEYS`); `S` always holds the part under the playhead.
- Each layer returns how lit a point is, 0 to 1. A style draws that field. The renderer adds the layers, then gain, trails, flash and glow.
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

## Not verified yet

- On macOS (Apple silicon) the smoke check passes with H.264 and AAC, and the packaged app builds and launches. Nobody has looked closely at the window yet, so the interface itself is unchecked on the Mac.
- Save and open dialogs and a real export have not been exercised by hand.
- Preview performance with three layers at 1920 x 1080 on real hardware.

## Next, roughly in order

1. Use it on the Mac for a real session and fix whatever that shows.
2. Syphon output to Resolume. Candidate: the `node-syphon` package, built against this Electron version. Either read frames back from the canvas and publish them from the main process, or use Electron offscreen rendering with a shared texture. Test against Resolume Arena.
3. MIDI on the trigger pad (Web MIDI works in Electron; needs a permission handler in `main.js`).
4. A clean output window for a second display.
5. ProRes or HAP export through ffmpeg (Homebrew ffmpeg is installed on the main machine).
