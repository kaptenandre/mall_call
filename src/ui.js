/* ---------- interface pass ----------
   Less to read: an icon on every section name, the explaining text folded away behind an i, and sections that shut.
   Text that reports what just happened (saved, loaded, an error) always stays in view. */
Object.assign(ICONS, {
  image: ['M2 3h12v10H2zM2 11l3.5-3.5 2.5 2.5 2-2 4 4M10.5 6.2h.01'], dice: ['M3 3h10v10H3zM6 6h.01M10 6h.01M8 8h.01M6 10h.01M10 10h.01'],
  dots: ['M4 4h.01M8 4h.01M12 4h.01M4 8h.01M8 8h.01M12 8h.01M4 12h.01M8 12h.01M12 12h.01'], frame: ['M2 4h12v8H2zM5 4v8M11 4v8'],
  sun: ['M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1'],
  folder: ['M2 4.5h4l1.5 1.5H14v6.5H2z'], screen: ['M2 3h12v8H2zM6 13.5h4M8 11v2.5'], down: ['M8 2v8M5 7l3 3 3-3M3 13.5h10'],
  info: ['M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM8 7.2v4M8 4.8h.01'],
  open: ['M4 6l4 4 4-4'], shut: ['M6 4l4 4-4 4'], wide: ['M2 8h12M5 5L2 8l3 3M11 5l3 3-3 3'], narrow: ['M6 5l3 3-3 3M2 8h7M14 3v10'],
  cut: ['M8 2v12M4.5 5.5L2 8l2.5 2.5M11.5 5.5L14 8l-2.5 2.5'], cutSound: ['M2 8h1M4.5 6v4M7 2v12M9.5 5v6M12 7v2M14 8h.01'],
  join: ['M2 8h12M5.5 5.5L8 8l-2.5 2.5M10.5 5.5L8 8l2.5 2.5'], loop: ['M3 8a5 5 0 0 1 8.5-3.5L13 6M13 3v3h-3M13 8a5 5 0 0 1-8.5 3.5L3 10M3 13v-3h3'], copy: ['M5 5h8v8H5zM3 11V3h8']
});
{
  const NAMES = { 'Audio in and out': 'play', 'Palette': 'ev1', 'Ring': 'frame', 'Logo file': 'image', 'Sound': 'over', 'Symbols': 'ev5', 'Pillars': 'ev4', 'Base layer': 'ev0', 'Glitch layer': 'ev1', 'Logo layer': 'ev2', 'Type layer': 'ev3', 'Variation': 'dice', 'Pixels': 'dots',
    'Format': 'frame', 'Look': 'sun', 'Playback': 'play', 'Project library': 'folder', 'Timecode': 'ruler', 'Output': 'screen', 'Export': 'down' };
  let shut = {}, wide = {};
  const folds = [];
  try { shut = JSON.parse(localStorage.getItem('mallcall-shut') || '{}'); wide = JSON.parse(localStorage.getItem('mallcall-wide') || '{}'); } catch (e) {}
  for (const fs of document.querySelectorAll('.rail fieldset')) {
    const lg = fs.querySelector('legend');
    if (!lg) continue;
    const name = lg.textContent.trim(), key = name.replace(/^\d\s+/, '');
    const fold = document.createElement('button'); fold.type = 'button';
    const arrow = document.createElement('span'); arrow.className = 'arrow';
    fold.append(arrow, ic(NAMES[key] || 'dots'), name);
    lg.textContent = ''; lg.append(fold);
    const keep = () => { try { localStorage.setItem('mallcall-shut', JSON.stringify(shut)); localStorage.setItem('mallcall-wide', JSON.stringify(wide)); } catch (e) {} };
    const set = on => { fs.classList.toggle('shut', on); fold.setAttribute('aria-expanded', String(!on)); fold.title = on ? 'Open ' + key : 'Fold ' + key + ' away'; arrow.replaceChildren(ic(on ? 'shut' : 'open')); };
    set(!!shut[key]);
    folds.push({ key, set });
    fold.addEventListener('click', () => { const on = !fs.classList.contains('shut'); set(on); shut[key] = on; keep(); if (!on && !S.playing && !busy) paint(); });
    // a box can also be stretched across every column of the settings, for the ones that want room
    const span = document.createElement('button'); span.type = 'button'; span.className = 'spanb';
    const setWide = on => { fs.classList.toggle('span', on); span.setAttribute('aria-pressed', String(on)); span.title = on ? 'Back to one column' : 'Stretch ' + key + ' across the whole settings area'; span.replaceChildren(ic(on ? 'narrow' : 'wide')); };
    setWide(!!wide[key]);
    span.addEventListener('click', () => { const on = !fs.classList.contains('span'); setWide(on); wide[key] = on; keep(); });
    lg.append(span);
    // the notes that only explain go behind an i; the ones that report stay
    const help = [...fs.querySelectorAll('.note')].filter(n => !n.hasAttribute('aria-live') && n.id !== 'logoNote' && n.id !== 'outNote');
    if (!help.length) continue;
    for (const n of help) n.hidden = true;
    const i = document.createElement('button'); i.type = 'button'; i.title = 'What this section does'; i.setAttribute('aria-label', 'What ' + key + ' does'); i.setAttribute('aria-pressed', 'false'); i.append(ic('info'));
    i.addEventListener('click', () => { const on = i.getAttribute('aria-pressed') !== 'true'; i.setAttribute('aria-pressed', String(on)); for (const n of help) n.hidden = !on; if (on) set(false); });
    lg.append(i);
  }
  // fold everything away, or open everything, in one press
  {
    const bar = document.createElement('div'); bar.className = 'railbar';
    const all = on => { for (const f of folds) { f.set(on); shut[f.key] = on; } try { localStorage.setItem('mallcall-shut', JSON.stringify(shut)); } catch (e) {} if (!S.playing && !busy) paint(); };
    for (const [label, icon, on] of [['Fold all', 'shut', true], ['Open all', 'open', false]]) { const b = document.createElement('button'); b.type = 'button'; b.append(ic(icon), label); b.addEventListener('click', () => all(on)); bar.append(b); }
    $('rail').prepend(bar);
  }
  // the part buttons say what they do with a picture and a word
  for (const [id, icon] of [['split', 'cut'], ['splitSound', 'cutSound'], ['merge', 'join'], ['loopPart', 'loop'], ['copyAll', 'copy'], ['blank', 'frame']]) {
    const b = $(id), text = b.textContent.trim(), short = { split: 'Split', splitSound: 'By sound', merge: 'Merge', loopPart: 'Loop', copyAll: 'To all', blank: 'Blank' }[id];
    if (!b.title) b.title = text;
    b.setAttribute('aria-label', text); b.replaceChildren(ic(icon), short);
  }
}
// the settings column: as wide as the user drags it, in as many columns as fit, and remembered
{
  const app = document.querySelector('.app'), rail = $('rail'), sp = $('splitter');
  const inner = document.createElement('div'); inner.className = 'railin'; inner.append(...[...rail.children].filter(c => !c.classList.contains('railbar'))); rail.append(inner);
  const cols = () => { const w = rail.clientWidth; inner.classList.toggle('two', w >= 560); inner.classList.toggle('three', w >= 900); };
  try { const w = Number(localStorage.getItem('mallcall-railw')); if (w >= 240) app.style.setProperty('--railw', w + 'px'); } catch (e) {}
  let down = false;
  sp.addEventListener('pointerdown', e => { down = true; sp.setPointerCapture(e.pointerId); sp.classList.add('on'); });
  sp.addEventListener('pointermove', e => {
    if (!down) return;
    const w = Math.round(Math.min(innerWidth - 420, Math.max(240, innerWidth - e.clientX)));
    app.style.setProperty('--railw', w + 'px'); cols(); tlCache = null; if (!S.playing && !busy) paint();
  });
  const up = () => { if (!down) return; down = false; sp.classList.remove('on'); try { localStorage.setItem('mallcall-railw', String(rail.clientWidth)); } catch (e) {} };
  sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
  sp.addEventListener('dblclick', () => { app.style.removeProperty('--railw'); try { localStorage.removeItem('mallcall-railw'); } catch (e) {} cols(); tlCache = null; });
  if (typeof ResizeObserver === 'function') new ResizeObserver(cols).observe(rail); else addEventListener('resize', cols);
  cols();
}

/* ---------- pictures on the palette ----------
   Every clip button shows what it does as a small drawing; its name is in the tip and its key stays beside it.
   The user asked for pictures in place of text wherever a picture says it. */
{
  Object.assign(ICONS, {
    pSweep: ['M3 3v10M6 8h7M10.5 5.5L13 8l-2.5 2.5'], pStrobe: ['M9 2L4 9h4l-1 5 5-7H8z'], pFlood: ['M2.5 3.5h11v9h-11zM2.5 6.5h11M2.5 9.5h11'], pBlack: ['M2.5 3.5h11v9h-11zM2.5 12.5l11-9'],
    pSpokes: ['M8 2v12M2.8 5l10.4 6M2.8 11l10.4-6'], pMeet: ['M2 8h4.5M4.5 6l2 2-2 2M14 8H9.5M11.5 6l-2 2 2 2'],
    pGlitch: ['M2 4.5h7v3H5v3h9'], pChase: ['M2 8h1.5M5.5 8h1.5M9 8h1.5M12 6l2 2-2 2'], pLines: ['M2 4h12M2 8h12M2 12h12'], pSparks: ['M4 4h.01M11 3h.01M8 7h.01M13 9h.01M3 11h.01M9 12.5h.01M6 9h.01'],
    pBars: ['M2 4h9M5 8h9M2 12h6'], pBlocks: ['M2.5 2.5h4v4h-4zM9.5 5.5h4v4h-4zM4.5 9.5h4v4h-4z'],
    pLoader: ['M2.5 6h11v4h-11zM8.5 6v4M4.5 8h2'], pTicker: ['M2 5h12M2 11h12M5 8h6M9 6.5L11 8 9 9.5'], pStack: ['M3 3.5h10M3 6.5h10M3 9.5h10M3 12.5h10'], pStretch: ['M2 8h12M4.5 5.5L2 8l2.5 2.5M11.5 5.5L14 8l-2.5 2.5'],
    pFlip: ['M8 2v12M5.5 4.5L2.5 8l3 3.5zM10.5 4.5l3 3.5-3 3.5'],
    pPilChase: ['M3 4v8M6 4v8M9 4v8M11 6l2.5 2-2.5 2'], pPop: ['M3 9v4M6.5 3v10M10 9v4M13 5v8'], pBuild: ['M3 11v2M6.3 8.5v4.5M9.7 6v7M13 3v10'], pAlt: ['M3 3v10M6.3 7v2M9.7 3v10M13 7v2'],
    pWave: ['M2 8c2-5 4-5 6 0s4 5 6 0'], pFrames: ['M3 3h4v10H3zM9 3h4v10H9z'], pEcho: ['M3 3v10M6.3 4.5v7M9.7 6v4M13 7.2v1.6'], pSymPil: ['M3 3v10M13 3v10M6 6l4 4M10 6l-4 4']
  });
  const PICS = {
    'Base': { Sweep: 'pSweep', Strobe: 'pStrobe', Flood: 'pFlood', Blackout: 'pBlack', Orbit: 'turn', Spokes: 'pSpokes', Meet: 'pMeet' },
    'Glitch': { Glitch: 'pGlitch', Chase: 'pChase', Lines: 'pLines', Sparks: 'pSparks', Bars: 'pBars', Blocks: 'pBlocks' },
    'Logo': { Loader: 'pLoader', Show: 'eye', Hide: 'eyeOff', Clean: 'ev2' },
    'Type': { Words: 'ev3', Ticker: 'pTicker', Stack: 'pStack', Stretch: 'pStretch', Bump: 'vAbove', Spin: 'turn', Flip: 'pFlip', Drop: 'export' },
    'Pillars': { Chase: 'pPilChase', Spin: 'turn', Pop: 'pPop', Build: 'pBuild', VU: 'stats', Alt: 'pAlt', Wave: 'pWave', Frames: 'pFrames', Echo: 'pEcho' },
    'Symbols': { Symbols: 'ev5', 'In pillars': 'pSymPil' }
  };
  const SAYS = { Base: 'base', Glitch: 'glitch', Logo: 'logo', Type: 'type', Pillars: 'pillar', Symbols: 'symbol' };
  for (const row of document.querySelectorAll('#pad .padrow')) {
    const name = row.firstElementChild.textContent.trim(), map = PICS[name];
    if (!map) continue;
    for (const b of row.querySelectorAll('button')) {
      const label = b.firstChild && b.firstChild.nodeType === 3 ? b.firstChild.textContent.trim() : '', pic = map[label];
      if (!pic || !ICONS[pic]) continue;
      b.firstChild.remove(); b.prepend(ic(pic)); b.classList.add('pic');
      b.title = label + ': a ' + SAYS[name] + ' clip. Press to put it at the playhead, or drag it onto the timeline.'; b.setAttribute('aria-label', label);
    }
  }
}
