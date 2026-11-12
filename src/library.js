/* ---------- project library (Mac app) ----------
   Projects kept as folders in one place, each with its sound and every version ever saved. The folder is meant to sit in
   iCloud Drive, Dropbox or anything else that syncs, which is what puts the projects in the cloud. See main.js. */
const libSay = s => { $('libNoteP').textContent = s; };
// Who is at this computer: typed once, kept on this computer, and written into every version saved from it, so a project
// handed from one person to another shows who saved what.
// The people who work on this piece. The name is picked from this list, not typed, so it is always spelt the same way.
const LIB_NAMES = ['Anders', 'André', 'Anton', 'Martin', 'Victor'];
const libWho = () => { try { const n = (localStorage.getItem('mallcall-who') || '').trim(); return LIB_NAMES.includes(n) ? n : ''; } catch (e) { return ''; } };
// is the library folder one that syncs? Only the path can say.
const libCloud = p => /Mobile Documents|iCloud/i.test(p) ? 'iCloud Drive' : /Dropbox/i.test(p) ? 'Dropbox' : /Google ?Drive|GoogleDrive/i.test(p) ? 'Google Drive' : /OneDrive/i.test(p) ? 'OneDrive' : '';
const libWhere = p => { const c = libCloud(p); return 'Projects are kept in ' + p + '. ' + (c ? 'That is in ' + c + ', so every version is in the cloud, and anyone sharing that folder sees the same projects.' : 'That folder is only on this computer. To share projects, press Change folder and pick one inside Dropbox or iCloud Drive that the others share.'); };
async function libRefresh(keep) {
  const list = await window.nativeApp.libList(), pick = $('libPick'), was = keep || pick.value;
  pick.textContent = '';
  for (const p of list) { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name + ' (' + p.versions + (p.versions === 1 ? ' version)' : ' versions)'); pick.append(o); }
  if (!list.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Nothing saved yet'; pick.append(o); }
  if ([...pick.options].some(o => o.value === was)) pick.value = was;
  await libVersionsFill();
}
async function libVersionsFill() {
  const ver = $('libVer'), name = $('libPick').value;
  ver.textContent = '';
  if (!name) { versTable('', []); return; }
  const vs = (await window.nativeApp.libVersions(name)).reverse();
  versTable(name, vs);
  for (const v of vs) { const o = document.createElement('option'); o.value = v.n; const d = v.at ? new Date(v.at) : null; o.textContent = 'v' + v.n + (v.by ? ', ' + v.by : '') + (d && !isNaN(d) ? ', ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + (v.note ? ': ' + v.note : ''); ver.append(o); }
}
// every save is a new version; nothing already saved is ever written over
async function libSave(note) {
  const name = $('libName').value.trim();
  if (!name) { libSay('Give the project a name first.'); $('libName').focus(); return null; }
  const r = await window.nativeApp.libSave({ name, json: JSON.stringify(Object.assign(getProject(), { by: libWho() })), note: note === undefined ? $('libNote').value : note });
  if (!r || !r.ok) { libSay(r && r.error === 'sound' ? 'The sound file could not be copied into the project. Drop it in again and save once more.' : 'That could not be saved. Check the name and the folder.'); return null; }
  $('libNote').value = '';
  libSay('Saved ' + r.name + ' as version ' + r.n + (libWho() ? ', by ' + libWho() : '') + ', with its logo, font and sound, in ' + r.dir + '.' + (libWho() ? '' : ' Choose your name above so the others see who saved it.'));
  await libRefresh(r.name);
  return r;
}
if (window.nativeApp && window.nativeApp.libSave) {
  $('libBox').hidden = false;
  $('libSave').addEventListener('click', () => libSave());
  $('libPick').addEventListener('change', libVersionsFill);
  $('libOpen').addEventListener('click', async () => {
    const name = $('libPick').value, n = Number($('libVer').value);
    if (!name) return;
    const r = await window.nativeApp.libOpen({ name, n });
    const pj = r ? JSON.parse(r.json) : null, when = pj && pj.savedAt ? new Date(pj.savedAt) : null;
    if (r && (await applyProject(pj))) { $('libName').value = r.name; libSay('Opened ' + r.name + ', version ' + r.n + (pj.by ? ', saved by ' + pj.by : '') + (when && !isNaN(when) ? ' on ' + when.toLocaleDateString() + ' at ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + '. Saving makes a new version; this one stays as it is.'); }
    else libSay('That version could not be opened.');
  });
  $('libFolder').addEventListener('click', async () => { const p = await window.nativeApp.libPickRoot(); if (p) { libSay(libWhere(p)); libRefresh(); } });
  window.nativeApp.libRoot().then(p => { libSay(libWhere(p)); libRefresh(); }, () => {});
  { const sel = $('libWho'); for (const n of ['', ...LIB_NAMES]) { const o = document.createElement('option'); o.value = n; o.textContent = n || 'Choose who you are'; sel.append(o); } sel.value = libWho(); }
  $('libWho').addEventListener('change', e => { try { localStorage.setItem('mallcall-who', e.target.value); } catch (x) {} });
}
