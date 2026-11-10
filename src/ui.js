/* ---------- interface pass ----------
   Less to read: an icon on every section name, the explaining text folded away behind an i, and sections that shut.
   Text that reports what just happened (saved, loaded, an error) always stays in view. */
Object.assign(ICONS, {
  image: ['M2 3h12v10H2zM2 11l3.5-3.5 2.5 2.5 2-2 4 4M10.5 6.2h.01'], dice: ['M3 3h10v10H3zM6 6h.01M10 6h.01M8 8h.01M6 10h.01M10 10h.01'],
  dots: ['M4 4h.01M8 4h.01M12 4h.01M4 8h.01M8 8h.01M12 8h.01M4 12h.01M8 12h.01M12 12h.01'], frame: ['M2 4h12v8H2zM5 4v8M11 4v8'],
  sun: ['M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M12.2 3.8l-1 1M4.8 11.2l-1 1'],
  folder: ['M2 4.5h4l1.5 1.5H14v6.5H2z'], screen: ['M2 3h12v8H2zM6 13.5h4M8 11v2.5'], down: ['M8 2v8M5 7l3 3 3-3M3 13.5h10'],
  info: ['M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0zM8 7.2v4M8 4.8h.01'],
  cut: ['M8 2v12M4.5 5.5L2 8l2.5 2.5M11.5 5.5L14 8l-2.5 2.5'], cutSound: ['M2 8h1M4.5 6v4M7 2v12M9.5 5v6M12 7v2M14 8h.01'],
  join: ['M2 8h12M5.5 5.5L8 8l-2.5 2.5M10.5 5.5L8 8l2.5 2.5'], loop: ['M3 8a5 5 0 0 1 8.5-3.5L13 6M13 3v3h-3M13 8a5 5 0 0 1-8.5 3.5L3 10M3 13v-3h3'], copy: ['M5 5h8v8H5zM3 11V3h8']
});
{
  const NAMES = { 'Player': 'play', 'Palette': 'ev1', 'Ring': 'frame', 'Logo file': 'image', 'Sound': 'over', 'Symbols': 'ev5', 'Pillars': 'ev4', 'Base layer': 'ev0', 'Glitch layer': 'ev1', 'Logo layer': 'ev2', 'Variation': 'dice', 'Pixels': 'dots',
    'Format': 'frame', 'Look': 'sun', 'Playback': 'play', 'Project library': 'folder', 'Timecode': 'ruler', 'Output': 'screen', 'Export': 'down' };
  let shut = {};
  try { shut = JSON.parse(localStorage.getItem('mallcall-shut') || '{}'); } catch (e) {}
  for (const fs of document.querySelectorAll('.rail fieldset')) {
    const lg = fs.querySelector('legend');
    if (!lg) continue;
    const name = lg.textContent.trim(), key = name.replace(/^\d\s+/, '');
    const fold = document.createElement('button'); fold.type = 'button'; fold.title = 'Show or hide this section';
    fold.append(ic(NAMES[key] || 'dots'), name);
    lg.textContent = ''; lg.append(fold);
    const set = on => { fs.classList.toggle('shut', on); fold.setAttribute('aria-expanded', String(!on)); };
    set(!!shut[key]);
    fold.addEventListener('click', () => { const on = !fs.classList.contains('shut'); set(on); shut[key] = on; try { localStorage.setItem('mallcall-shut', JSON.stringify(shut)); } catch (e) {} if (!on && !S.playing && !busy) paint(); });
    // the notes that only explain go behind an i; the ones that report stay
    const help = [...fs.querySelectorAll('.note')].filter(n => !n.hasAttribute('aria-live') && n.id !== 'logoNote' && n.id !== 'outNote');
    if (!help.length) continue;
    for (const n of help) n.hidden = true;
    const i = document.createElement('button'); i.type = 'button'; i.title = 'What this section does'; i.setAttribute('aria-label', 'What ' + key + ' does'); i.setAttribute('aria-pressed', 'false'); i.append(ic('info'));
    i.addEventListener('click', () => { const on = i.getAttribute('aria-pressed') !== 'true'; i.setAttribute('aria-pressed', String(on)); for (const n of help) n.hidden = !on; if (on) set(false); });
    lg.append(i);
  }
  // the part buttons say what they do with a picture and a word
  for (const [id, icon] of [['split', 'cut'], ['splitSound', 'cutSound'], ['merge', 'join'], ['loopPart', 'loop'], ['copyAll', 'copy']]) {
    const b = $(id), text = b.textContent.trim(), short = { split: 'Split', splitSound: 'By sound', merge: 'Merge', loopPart: 'Loop', copyAll: 'To all' }[id];
    if (!b.title) b.title = text;
    b.setAttribute('aria-label', text); b.replaceChildren(ic(icon), short);
  }
}
// the settings column: as wide as the user drags it, in as many columns as fit, and remembered
{
  const app = document.querySelector('.app'), rail = $('rail'), sp = $('splitter');
  const inner = document.createElement('div'); inner.className = 'railin'; inner.append(...rail.children); rail.append(inner);
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
