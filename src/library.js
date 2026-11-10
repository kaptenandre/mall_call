/* ---------- project library (Mac app) ----------
   Projects kept as folders in one place, each with its sound and every version ever saved. The folder is meant to sit in
   iCloud Drive, Dropbox or anything else that syncs, which is what puts the projects in the cloud. See main.js. */
const libSay = s => { $('libNoteP').textContent = s; };
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
  for (const v of vs) { const o = document.createElement('option'); o.value = v.n; const d = v.at ? new Date(v.at) : null; o.textContent = 'v' + v.n + (d && !isNaN(d) ? ', ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '') + (v.note ? ': ' + v.note : ''); ver.append(o); }
}
// every save is a new version; nothing already saved is ever written over
async function libSave(note) {
  const name = $('libName').value.trim();
  if (!name) { libSay('Give the project a name first.'); $('libName').focus(); return null; }
  const r = await window.nativeApp.libSave({ name, json: JSON.stringify(getProject()), note: note === undefined ? $('libNote').value : note });
  if (!r || !r.ok) { libSay(r && r.error === 'sound' ? 'The sound file could not be copied into the project. Drop it in again and save once more.' : 'That could not be saved. Check the name and the folder.'); return null; }
  $('libNote').value = '';
  libSay('Saved ' + r.name + ' as version ' + r.n + ', with its logo, font and sound, in ' + r.dir + '.');
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
    if (r && (await applyProject(JSON.parse(r.json)))) { $('libName').value = r.name; libSay('Opened ' + r.name + ', version ' + r.n + '. Saving makes a new version; this one stays as it is.'); }
    else libSay('That version could not be opened.');
  });
  $('libFolder').addEventListener('click', async () => { const p = await window.nativeApp.libPickRoot(); if (p) { libSay('Projects are now kept in ' + p + '.'); libRefresh(); } });
  window.nativeApp.libRoot().then(p => { libSay('Projects are kept in ' + p + '. Put that folder in iCloud Drive or Dropbox and they are in the cloud, every version of them. Each save adds a version.'); libRefresh(); }, () => {});
}
