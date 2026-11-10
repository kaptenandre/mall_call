/* ---------- workspaces ----------
   Edit is the piece itself. Media is the pool of what the project holds: its logos, sound, own symbols and font.
   Versions is the project library as a page: every saved version of a project, to open again. */
const WORK = [['edit', 'Edit', 'frame'], ['media', 'Media', 'image'], ['versions', 'Versions', 'folder']];
let workNow = 'edit';
function workShow(id) {
  workNow = id;
  document.querySelector('.app').hidden = id !== 'edit';
  $('viewMedia').hidden = id !== 'media'; $('viewVersions').hidden = id !== 'versions';
  for (const b of $('tabs').children) b.setAttribute('aria-selected', String(b.dataset.id === id));
  if (id === 'versions' && window.nativeApp && window.nativeApp.libList) libRefresh();
  workRefresh();
  if (id === 'edit') { tlCache = null; if (!S.playing && !busy) paint(); }
}
const asFile = async q => { const blob = await (await fetch(q.dataUrl)).blob(); return new File([blob], q.name, { type: blob.type }); };
// redraw the Media page from what the project holds; cheap enough to do whenever anything changes
function workRefresh() {
  if (workNow !== 'media') return;
  const card = (box, pic, name, current, use, drop) => {
    const c = document.createElement('div'); c.className = 'card'; c.title = name; if (current) c.setAttribute('aria-current', 'true');
    const b = document.createElement('b'); b.textContent = name; c.append(pic, b);
    if (use) c.addEventListener('click', use);
    if (drop) { const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.title = 'Take it out of the project'; x.addEventListener('click', e => { e.stopPropagation(); drop(); }); c.append(x); }
    box.append(c);
  };
  const adder = (box, title, fn) => { const a = document.createElement('button'); a.type = 'button'; a.className = 'add'; a.textContent = '+'; a.title = title; a.setAttribute('aria-label', title); a.addEventListener('click', fn); box.append(a); };
  const logos = $('poolLogos'); logos.textContent = '';
  for (const q of logoPool) {
    const im = new Image(); im.src = q.dataUrl; im.alt = '';
    card(logos, im, q.name, !!logoFile && logoFile.name === q.name && logoFile.dataUrl.length === q.dataUrl.length, async () => loadLogo(await asFile(q)), () => { logoPool = logoPool.filter(z => z !== q); touch(); workRefresh(); });
  }
  adder(logos, 'Add a logo, SVG or PNG', () => $('file').click());
  const kv = (box, rows) => { box.textContent = ''; for (const [k, v] of rows) { const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.style.fontWeight = '400'; b.textContent = v; box.append(a, b); } };
  kv($('poolSound'), track ? [['File', track.name], ['Length', track.ab.duration.toFixed(1) + ' s'], ['Hits found', String(score.hits)], ['Drops', String((score.struct || (score.struct = makeStructure(score))).drops.length)], ['Kept at', soundPath || 'this session only']] : [['File', 'None. The piece runs as a loop on a built-in beat.']]);
  $('poolSoundOff').disabled = !track;
  const syms = $('poolSyms'); syms.textContent = '';
  for (const u of userSyms) card(syms, symCanvas(u.id, 96), u.name, false, null, () => { userSyms = userSyms.filter(z => z !== u); symMasks.delete(u.id); symBank(); touch(); workRefresh(); });
  adder(syms, 'Add a symbol of your own, SVG or PNG', () => $('symFile').click());
  kv($('poolFont'), [['Font', fontFile ? fontFile.name : 'None of your own. Words use the two built-in fonts.']]);
  const fc = $('poolFontCv'), g = fc.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, fc.width, fc.height); g.fillStyle = '#eceaf4'; g.textBaseline = 'middle';
  g.font = (fontFile ? '64px "MallCallOwn", ' : '600 64px ') + '"Instrument Sans", sans-serif'; g.fillText('MALL CALL 0123', 18, fc.height / 2 + 4);
  $('poolFontOff').disabled = !fontFile;
}
// the history of the project picked in the library, newest first
function versTable(name, list) {
  const rows = $('versRows'); rows.textContent = '';
  $('versHead').textContent = !name ? 'Save a version and it shows here.' : name + ': ' + list.length + (list.length === 1 ? ' version.' : ' versions.') + ' Opening one never changes it; saving always adds a new one.';
  for (const v of list) {
    const tr = document.createElement('tr'), d = v.at ? new Date(v.at) : null, cell = t => { const td = document.createElement('td'); td.textContent = t; tr.append(td); return td; };
    cell('v' + v.n); cell(d && !isNaN(d) ? d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''); cell(v.note || '');
    const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Open'; b.addEventListener('click', async () => { $('libVer').value = String(v.n); $('libOpen').click(); workShow('edit'); });
    cell('').append(b); rows.append(tr);
  }
}
{
  for (const [id, name, icon] of WORK) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = id; b.setAttribute('role', 'tab'); b.append(ic(icon), name);
    b.addEventListener('click', () => workShow(id)); $('tabs').append(b);
  }
  $('poolSoundPick').addEventListener('click', () => $('sfile').click());
  $('poolSoundOff').addEventListener('click', () => $('soundOff').click());
  $('poolFontPick').addEventListener('click', () => $('ffile').click());
  $('poolFontOff').addEventListener('click', () => { if (fontFace) document.fonts.delete(fontFace); fontFace = null; fontFile = null; delete TYPE_FONTS.own; typeMasks.clear(); for (const e of userEv) if (e.font === 'own') e.font = 'sans'; tlInspSig = ''; tlInsp(); syncUI(); });
  // the library box lives on the Versions page
  const lib = $('libBox');
  if (window.nativeApp && window.nativeApp.libSave) {
    $('versLeft').append(lib);
    if (window.nativeApp.libReveal) { const r = document.createElement('button'); r.type = 'button'; r.className = 'plain'; r.textContent = 'Show the folder'; r.addEventListener('click', () => window.nativeApp.libReveal($('libPick').value || '')); lib.insertBefore(r, $('libNoteP')); }
  } else { const p = document.createElement('p'); p.className = 'note'; p.textContent = 'Versions are kept by the Mac app. In a browser, nothing is saved between visits.'; $('versLeft').append(p); }
  // Save, always in view: a new version in the library. The first time it asks for a name on the Versions page.
  const say = t => { $('saveMsg').textContent = t; clearTimeout(say.t); say.t = setTimeout(() => { $('saveMsg').textContent = ''; }, 6000); };
  $('saveNow').replaceChildren(ic('down'), 'Save');
  $('saveNow').addEventListener('click', async () => {
    if (!(window.nativeApp && window.nativeApp.libSave)) { say('Saving versions needs the Mac app'); return; }
    if (!$('libName').value.trim()) { workShow('versions'); $('libName').focus(); say('Name the project, then save'); return; }
    const r = await libSave();
    say(r ? 'Saved ' + r.name + ' v' + r.n : 'Not saved, see Versions');
  });
  workShow('edit');
}
