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

Raise `BUILD` in `src/page.html` by one with every push. It shows in the page header ("build 12") and is how the user tells whether the app has updated.

Run `npm run smoke` and `npm test` after every change. A clean smoke run has `"errors":[]`, `"roundTrip":true`, `"restored":true`, `"timeline":true`, `"type":true`, `"ltcLoop":true`, `"grade":true`, `"library":true`, `"h264":true`.

On Linux (cloud sessions) Electron needs a display and no sandbox: `node scripts/build.js && xvfb-run -a npx electron . --smoke --no-sandbox`. `"aac":false` is expected there.

## Layout

- `src/engine.js`: timing engine, no DOM. Sound analysis (`analyze`), hit picking, the score (`buildTrackScore`, `buildLoopScore`), scheduled events (`makeEvents`), and the per-frame state (`stateAt`).
- `src/timeline.js`: the timeline editor. Rows, clips, keys (`auto`, `PAt`, `setKey`), zoom, snapping, the inspector strip and undo. Inlined at `/*__TIMELINE__*/`.
- `src/timecode.js`: SMPTE maths, MIDI timecode and LTC encode and decode, no DOM. Inlined at `/*__TIMECODE__*/`. Only the maths is used by the interface so far.
- `src/ring.js`: the ring in 3D, plain WebGL with no library so it updates with the page. Inlined at `/*__RING__*/`.
- `src/ui.js`: the interface pass over the rail: an icon on every section name, explaining notes folded behind an i, sections that shut (remembered), each with an arrow to fold it and a button to stretch it across every column, and Fold all / Open all at the top. Notes with `aria-live` report things and stay in view. Inlined at `/*__UI__*/`. The user wants icons in place of text wherever a picture says it.
- `src/work.js`: the workspaces (Edit, Media, Versions), the media pool and the version history page. Inlined at `/*__WORK__*/`.
- `src/library.js`: the project library in the rail. Inlined at `/*__LIBRARY__*/`.
- `src/player.js`: the Stats box, and the player's sound plumbing: music out to a chosen device, LTC timecode out as sound, LTC timecode in from an input. Inlined at `/*__PLAYER__*/`.
- `src/diag.js`: the app reporting on itself. Inlined at `/*__DIAG__*/`, last, because it uses icons that `ui.js` adds.
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
- **Lines** in the glitch layer move one of two ways (`lineMode`, per part). **Pulse**, the default, follows a reference film the user likes: a rack of twelve parallel bars, each a short lit stretch with a hot middle and tapering tips, that strikes out in length and light within a frame of a hit and sinks back over about half a second, each bar slightly its own. Nothing glides; the stretches stand somewhere else after the next hit. **Slide** is the older full-frame hairlines easing from place to place. The user finds Slide too digital.
- **Type** clips (`EV.type`, the fourth lane) put words on screen: `txt`, `mode` (slam, typeon, roll, ticker), `size`, `y`, `font`. `typeField` draws them in the logo layer with its style and its glitch. They only come from the user, never from the automatic cut.
- Glow follows the bass (`st.pulse`) so it reads as light thrown by a hit. Trails are off by default. The user called constant glow and trails the softest part of the look.
- **The piece is always the double ring** (user, 2026-11: "everything will be this double circle"). The Wide and Panel formats are gone from the interface; `S.format` is always `ring` and `S.faces` starts at 2. Do not add flat or square formats back. The 3D view is the main monitor, with set views (`RING_VIEWS`: outside, eye level, close, inside, centre, above) and Turn, which walks round the ring and also turns a 3D film.
- **One pillar on its own** is always shown beside the 3D view (`pillarFrame`): the chosen pillar's outside and the inside pillar at the same place on the ring, pixel for pixel. `S.pil` is which; the arrows or a press on the strips choose it, and the strips mark it.
- **Workspaces**: Edit is the piece. Media is the pool of what the project holds: every logo it has been given (`logoPool`, press one to use it), the sound, the user's own symbols and font. Versions is the project library as a page with a history table.
- **The window is a shell that does not scroll** (above 880 px wide): the monitor, the timeline and the part controls keep their place on the left, and only the rail of settings scrolls. The rail's width is dragged with the splitter and remembered; it lays itself out in one, two or three columns as it fits. The trigger pad lives at the top of the rail. Short windows squeeze the timeline and the strips so the 3D view keeps some room.
- **The preview only paints when it must**: at the piece's frame rate while playing, and when something changes while paused (plus a slow safety repaint). It used to repaint 60 times a second even standing still, which made scrolling lag. `S.pq` is the preview size: auto, full, half or quarter. Anything that changes the picture while paused must call `paint()` itself.
- **Parts have names** (`parts[i].name`, typed in the part bar; `partName(i)` falls back to the number). Split by sound names them Intro, Build, Drop, Quiet, Back in.
- **The app reports on itself** so nobody has to screenshot. `diagNow()` gathers the build, the machine, timings per layer, the settings that cost time, clip counts, a line of history every five seconds of playing, and any errors caught. The Report button in the header copies it as text for the user to paste into the chat; ask for that instead of a screenshot. In the Mac app the same record is written every 15 s to `_diagnostics/latest.json` (and a line to `history.log`) in the project library folder. If the user keeps that folder in Dropbox or Google Drive and the session has that connector, read the file directly. Nothing is sent anywhere by the app.
- **Measured on the user's Mac, 2026-11-10, build 29** (their screenshot): 41.6 ms a frame, all of it in the layers (glitch 13.8, logo 8.4, drawn twice because the inside had its own look), with grade, monitors and timeline at zero; the piece was set to 60 fps and the preview ran at 28 fps at half size. So the script is the limit on the real machine too, and the GPU port is the right fix. Two stopgaps followed: the preview paints at most 30 times a second whatever the piece's rate (`PREVIEW_FPS`), and when two different faces do not fit in a frame they take turns in the preview (`drawFaces`).
- **Performance, as measured** (2026-11, headless Linux with software graphics, so only the proportions mean anything): of about 24 ms a frame at 3840 x 768, about 23 ms is drawing the layers. The 3D view, the pillar monitor, the grade and the timeline together are under 1 ms. Inside the layers the cost is working out each cell's value in JavaScript (`logoField`, `fxField`), not the canvas calls: gathering the cells by brightness and filling each step once (`litBegin`, `litEnd`) only took the logo layer from 19 to 14 ms. A smaller preview does not help, because the number of cells stays the same. So the real gain is moving the fields and styles to the GPU as shaders: that is the next big job, and it should start from numbers taken on the user's Mac with the Stats box. Stats (a button on the view bar) shows time per frame and where it goes, the preview rate, and in the Mac app processor use and memory (`metrics` in `main.js`).
- **Player mode** (playing straight out of the app, the "welcome extra"): the Player section sends the music to a chosen output, sends timecode as LTC sound to another (`plOutStart`: blocks of five frames queued a little ahead, realigned on seek or drift, silent when paused), and can follow LTC from an input (`plInStart`, `plChase`: the desk leads, the piece and music follow, and stop when the timecode stops). Smoke loops LTC out into LTC in through the real audio graph (`ltcLoop`). A level meter sits by the timecode readout (`vuFrame`), read off the sound file at the playhead.
- **The palette is dragged, not played.** The user does not want to trigger things with buttons; everything is programmed. The clip buttons, the symbols in the bank and the looks can all be dragged onto the timeline (`dragOut`, and the `drop` handler in `timeline.js`): a clip lands at the time under the pointer, snapped to the nearest hit, and a look lands on the part it is dropped on. A press still drops at the playhead.
- The few numbers that matter sit small by the level meter at the top right (`#mini`): preview rate, milliseconds a frame, and in the Mac app processor and memory. They turn amber when a frame takes longer than its share. The Stats button gives the full breakdown.
- **The output grade** (`gGain`, `gCon`, `gGam`, `gBlack`) is the last thing done to the frame, in the preview, the output window and every export (`gradeFrame`, an SVG filter). It exists because the screens are see-through LED mesh, where dim grey pixels read as haze: contrast and the black floor push them to black.
- The looks on the trigger pad show which one is in force, on the button and in the line under the monitor.
- **The ring has two faces.** `S.faces` 1 or 2, `S.panels` outside and `S.panelsIn` inside, `S.panelPx` for a panel's pixel width (0 picks one). With two faces the frame holds two strips: outside on top, inside under it, both from the left (`dims`, `drawFaces`). Each part says what the inside shows, `P.inner`: `same`, `mirror`, `off`, or `own`, which keeps a second set of settings `Q` beside `P`. `face` is which one the controls edit; `PAt(t, face)` reads it. A clip can play on both faces, the outside or the inside (`e.face` 0, 1, 2). The inside is only rendered separately when it really differs. The ring is pillars with air between them: `S.gap` is that air in pillar widths. With it set, each layer's field is as wide as the whole ring, air included, and every pillar is a window onto its own stretch (`Renderer.draw`), so a sweep travels at the right speed and the logo keeps its shape across pillars. The frame that goes out still holds only the pillars, packed side by side. All of these numbers are guesses until the real ring is known, which is why they are settings.
- **Base looks for a ring**: `orbit` (a wall of light runs a lap), `spokes` (a few bars turning together), `meet` (two fronts leave one point and close on the far side). They treat the frame's left and right edges as the same place. On a ring the automatic cut uses them where it would sweep. `isBase(k)` says which clips are base.
- The Sound row of the timeline is a waveform in three colours like a DJ player: bass blue, mids amber, highs white. The user asked for this instead of a spectrogram.
- **Pillar patterns** stop every pillar doing the same thing. A Pillar clip (`EV.pillar`, the fifth lane) plays a pattern across the pillars, one value per pillar (`pillarGains`): chase, spin, ping, wave, random, alt (every other, swapping on the hit), pop (a few flash on each hit), vu (each pillar follows its own band of the sound), build, drain, split. `pm` says what the value does: `light` lights whole pillars through the base layer, `mask` shows the picture only where the pattern is on. Patterns are stepped to whole pillars and timed off hits and the eased clock. The automatic cut picks a different one every few seconds (`pilAmt`, Auto patterns), builds the picture up through a build and spins on a drop. Outside the ring format a wide frame counts as 16 columns.
- **Per-pillar and outline looks**, all per part or per clip: `logoEach` puts one logo in every pillar instead of across the ring; `outline` draws only the edge of the logo, and a Type clip's `ol` does the same for words (both read the blurred mask and keep a band of it); a Pillar clip with `pm: 'frame'` lights only the outline of each pillar; and a masking Pillar clip can hide just the logo and words or just the glitch layer (`on`).
- **Symbols.** A bank of plain line shapes drawn in code (`SYM_DRAW`: cross, plus, squares, circles, rings, corners, arrow and so on) plus any the user adds as SVG or PNG (`userSyms`, kept in the project). A Symbol clip (`EV.sym`, the sixth lane) shows one, or with `step` a different one on every hit. `echo` trails delayed copies behind it, each offset and dimmer and each showing the shape from one hit earlier, after a reference film the user sent. With `each` there is one in every pillar, and `dl` runs each pillar some hits behind the one before, so shapes chase round the ring. The automatic cut places them with `symAmt`. The shapes are generic on purpose: do not copy another show's marks, and do not draw brand logos (rule 10).
- The pillar pattern `echo` is a delay: the bass hit repeats pillar by pillar away from a starting pillar, later and weaker each step.
- **At once** (`busy`, per part) thins debris, chases and automatic clips together (`busyK`). The user found the picture did too much at the same time. Words and big base moments also duck the glitch layer (`st.fxGain`).
- **Parts follow the sound**: Split by sound cuts the piece where the sound changes (`soundCuts`: drops, the start of a build, both ends of a quiet stretch). Split at playhead and a dragged part edge snap to hits and to those points (`nearHit`, `tlSnapT`). The Sound row marks builds and quiet stretches.
- **Part transitions**: each part says how it comes in (`trans`: cut, dip, wipe, split, pop, spin, glitch, strobe) and over how long (`transLen`). `rebuildScore` turns that into clips across the part's edge.
- **Type** has nine ways to arrive: slam, typeon, letters, roll, ticker, band (a small repeating ticker), stack, stretch, wave. A `|` in the words starts a new line. Clips also carry `x`, `caps`, `trk` (letter spacing) and `out` (`same` leaves the way it came).
- **Keys** animate a setting over time (`auto[key] = [{ t, v, c }]`). `PAt(t)` gives the settings in force at a time: the part's, with animated ones read off their keys. Use `PAt`, never `parts[...].P`, when drawing. Settings that change the schedule (How often, How much, Chaos, Easing) and Logo size are not animatable.
- Timecode: the piece has a rate and a start timecode (`S.tcRate`, `S.tcStart` in frames) so the ruler reads like the lighting desk.
- Export renders every frame offline. MP4 goes through WebCodecs and `mp4-muxer` in the page. ProRes 422 HQ, ProRes 4444 and HAP go through ffmpeg in the Mac app (`ff-start`, `ff-frame`, `ff-end` in `main.js`): the page sends raw frames, ffmpeg adds the sound from the sound file's path and writes the start timecode into the .mov. On a ring, an export can film the flat frame (for mapping) or the 3D view as it stands (`S.exView`, `exSource`).
- **Saving**: the Save button in the header, and Cmd+S, save a new version of the project into the library (the first time it sends the user to Versions to name it). The session is also kept by itself between launches (`autosave`). File > Save as a File writes a single `.mallcall` file anywhere.
- **The project library** is how projects get into the cloud with their assets and history. The app keeps a library folder (iCloud Drive's `Mall Call` folder when iCloud Drive exists, else Documents; the user can point it anywhere, such as Dropbox). Each project is a folder: `versions/0001.json`, `0002.json` and so on are whole projects with the logo and font inside, and `assets/` holds the sound, copied in once. Every save writes a new version and never overwrites one (`lib-save`, `lib-open`, `lib-versions` in `main.js`). There is no server and no account: syncing is left to the folder.
- A font of the user's own for Type clips is dropped in as a file and kept in the project (`loadFont`, `fontFile`).

## Design rules. These came from the director and are not up for change without asking

1. Three layers. **Base**: rare and big (sweeps, strobe), only on the strongest hits. **Glitch**: lines, chases, debris, mostly fairly high-res. **Logo** on top: a loader that builds it, or it cutting in sometimes.
2. The logo never glides or zooms softly. It cuts between poses through a few wrong frames. Movement on the logo is glitch.
3. Fast ease in and out belongs to the lines in the glitch layer. (2026-11: the user asked for lines that feel analog instead, see Lines under How it works. The eased lines remain as Slide.)
4. Nothing moves at constant speed. Everything surges and settles (the eased clock `phi`, per-element `swing`, eased chases and loader). If something looks linear, it is a bug.
5. Glitch is organic: irregular holds, noise-driven tear and slip, never a fixed clock. Avoid visible repetition; variety comes from the seed.
6. Debris in the glitch layer is driven by its own part of the spectrum: bass, mids, highs.
7. Pixels are controllable: dither type, shape, fill, size per layer.
8. Panels are 1 x 3. The ring of 30 panels is a guess from renders; confirm the real count and pixel size before locking formats. (Counts for both faces and the panel pixel size are settings in the app now.)
9. Interface text is English, short, and never uses em dashes.
10. The app ships with a placeholder ring. The real logo is dropped in by the user as a file. Do not draw brand logos in code.

## How it is meant to run at the show

Decided by the user, 2026-11: everything is pre-programmed, nothing is performed live, and the show has to follow SMPTE from the lighting desk. Playback runs in another program (Resolume or TouchDesigner): export a file and let that program chase the desk and handle mapping, Syphon and the screen outputs. So the timeline and the export matter most. Playing straight out of this app (timecode chase, Syphon) would be a welcome extra, after the export is solid.

## Updates

The packaged app keeps its page up to date by itself. At launch `update.js` asks GitHub for the newest commit on the branch chosen in the Updates menu. The default is `latest`: whichever branch was committed to most recently, so new work arrives without choosing anything (off when run from source). It fetches `src/build.json` and the files it names, assembles them with `assemble.js` and loads that copy from the app's data folder. Offline it uses the last copy it has, or the built-in page. While running it looks again every three minutes; when it finds something it tells the page (`update-ready`), which saves the session and reloads unless a render is going. The user wants the app to always be on the newest work without doing anything.

Only the page updates this way. A change to `main.js`, `preload.js`, `update.js` or `assemble.js` needs `git pull` and `npm run dist` on the Mac; the Updates menu says so when it sees one. So keep new work in `src/` where possible, and when a page change needs a new bridge function, make the page work without it too.

## Not verified yet

- The timeline editor has been driven with a mouse in Chromium on Linux only. Trackpad pinch and scroll, and Cmd+Z through the Edit menu, are untried on the Mac.
- The output window works in Chromium. Full screen on a chosen screen (`output-place` in `main.js`) is untried on any machine.
- The updater is tested against a local stand-in for GitHub on Linux (first fetch, already current, missing branch, offline) and the two real GitHub addresses answer. It has not run in the packaged Mac app.
- The automatic cut's structure reading is tested on one synthetic track. It has not been judged by eye or ear on real music.
- The two-face ring, the ring base looks and the 3D view have been seen as still frames in Chromium with software WebGL. Not tried on the Mac, and an export of a two-face ring has not been run.
- Pulse lines and Type clips have been looked at as still frames in Chromium, not judged in motion or on the Mac.
- ProRes, HAP and the 3D film have been exported for real on Linux through ffmpeg and probed (codec, frame count, timecode track). Not run on the Mac, not opened in Resolume, and not with a sound file.
- `npm run` checks for export: `MALLCALL_EXPORT_TEST=prores MALLCALL_FF_OUT=/tmp/x.mov` (or `hap`, `prores:3d`) before `electron .` runs a short real export and prints a line starting with EXPORT.
- Following `latest` and the three-minute check are untested against GitHub.
- Pillar patterns, part transitions, the At once control and the new Type modes have been seen as still frames in Chromium. None of them has been judged in motion.
- The library is checked in smoke without a sound (two versions saved, the first reopened). Copying a sound file into a project, and the folder living in iCloud Drive or Dropbox, are untried.
- The shell layout has been looked at in Chromium at 1280 x 720, 1512 x 945 and 2560 x 1300. Whether scrolling is smooth again on the Mac is unknown.
- LTC out and in are tested looped back inside the app, with no sound device. Real outputs and inputs, the macOS microphone prompt, choosing devices, and a real lighting desk are all untried. MTC is maths only.
- Performance on the Mac has not been measured. The numbers under How it works are from software graphics.

- On macOS (Apple silicon) the smoke check passes with H.264 and AAC, and the packaged app builds and launches. Nobody has looked closely at the window yet, so the interface itself is unchecked on the Mac.
- Save and open dialogs and a real export have not been exercised by hand.
- Preview performance with three layers at 1920 x 1080 on real hardware.

## Where the work stands (handover)

Kept current so a new session can pick up without the old conversation. Update it with every merge.

- Everything is on `main`. The user asked in the session of 2026-11-10 for each finished piece to be merged to `main` as it is done; ask again in a new session before merging.
- The user runs the packaged app on a MacBook from `~/mall_call` (cloned 2026-11-10). They are not a developer: give exact Terminal commands, one per block. A change to `main.js`, `preload.js`, `update.js` or `assemble.js` means they must run `git checkout main`, `git pull`, `npm run dist` and open the app in `dist/`. They have had trouble telling whether the app updated: the build number in the header is how.
- Nothing built since the first commit has been seen running on their Mac by us. They report back in screenshots and short Swedish messages. Reply in Swedish, never with em dashes.
- The look they are after: analog, hard, lamp-like. Not soft, not "digital". Two reference films shaped the pulse lines and the symbols with echoes.

Asked for and not done yet, newest first:

1. GPU rendering. Confirmed as the right fix by numbers from the user's Mac (see above). Plan: keep `stateAt` on the CPU, pass its state to shaders as uniforms, and move `baseField`, `fxField`, `logoField`, `typeField`, `symField` and the five styles to WebGL fragment shaders, one layer at a time, comparing each against the canvas version (export must look the same). Not started.
2. The user wrote "få med poser.global också" while asking for the layout work. It is not clear what that means; ask.
3. Icons on the trigger pad, if they want them.
4. The real room from Vectorworks in the 3D view: waiting for an OBJ export from their collaborator.

## Next, roughly in order

1. The real room in the 3D view. The user's collaborator draws in Vectorworks. Load a model exported from there (OBJ first, it is easy to read; glTF after) and put the frame on its LED faces, so the piece is seen in the space as drawn. Also save the 3D view as a film.
2. More that tells the two faces apart and shows the circle: content that passes from outside to inside, opposite directions of travel, a look per face on the trigger pad.
4. Use it on the Mac for a real session and fix whatever that shows. Tune the automatic cut and the pulse lines on real music.
5. More in the timeline: select and move several clips, copy and paste, loop a range, markers with names. Own fonts for Type clips.
6. If wanted: chase LTC or MTC for previewing against the desk (the maths is in `src/timecode.js`; needs Web MIDI and microphone permission handlers in `main.js`).
7. If wanted: Syphon output. `node-syphon` 1.5.x ships a prebuilt binary and `SyphonMetalServer.publishImageData(data, region, size, flipped)`. Test against Resolume Arena.
