// Keeps the page up to date from GitHub. The app checks a branch at launch, fetches the page's source files,
// puts them together the same way scripts/build.js does, and loads that copy from its own data folder.
// Only the page updates this way. Changes to main.js, preload.js and the files beside them need a new npm run dist.
const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const A = require('./assemble.js');

const REPO = 'kaptenandre/mall_call';
const API = process.env.MALLCALL_UPDATE_API || 'https://api.github.com/repos/' + REPO;
const RAW = process.env.MALLCALL_UPDATE_RAW || 'https://raw.githubusercontent.com/' + REPO;
const SHELL = ['main.js', 'preload.js', 'update.js', 'assemble.js'];
const bundled = path.join(__dirname, 'app');
const liveDir = () => path.join(app.getPath('userData'), 'live');
const stateFile = () => path.join(app.getPath('userData'), 'update.json');

let state = { channel: null, sha: '', built: '', branches: ['main'], shell: false, latest: '' };
let status = 'Not checked yet', fresh = false;

async function get(url, accept) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'mall-call-app', Accept: accept || '*/*' }, cache: 'no-store' });
  if (!r.ok) throw new Error(r.status + ' for ' + url);
  return r.text();
}
const builtSha = () => { try { return JSON.parse(fs.readFileSync(path.join(bundled, 'build.json'), 'utf8')).sha || ''; } catch (e) { return ''; } };
async function load() {
  try { Object.assign(state, JSON.parse(await fsp.readFile(stateFile(), 'utf8'))); } catch (e) {}
  if (!state.v) { state.v = 2; if (state.channel === 'main') state.channel = null; }      // the first version saved 'main' without anyone choosing it
  if (state.channel === null) state.channel = app.isPackaged ? 'latest' : 'off';    // run from source and you already have the latest
  // a copy fetched for an older build of the app is dropped when the app itself is rebuilt
  if (state.built !== builtSha()) { state.sha = ''; state.built = builtSha(); state.shell = false; }
}
const save = () => fsp.writeFile(stateFile(), JSON.stringify(state), 'utf8').catch(() => {});

// the page to open: the fetched copy when there is one for the branch being followed, else the one built into the app
function pagePath() {
  const live = path.join(liveDir(), 'index.html');
  return state.channel !== 'off' && state.sha && fs.existsSync(live) ? live : path.join(bundled, 'index.html');
}
// 'latest' follows whichever branch was worked on most recently, so new work arrives without choosing anything.
// Looking that up costs a few requests, so it is done at launch and from the menu, not on the timer.
async function newestBranch() {
  const list = JSON.parse(await get(API + '/branches?per_page=100')).filter(x => /^[\w./-]+$/.test(String(x.name)) && x.commit && /^[0-9a-f]{40}$/.test(x.commit.sha));
  if (!list.length) throw new Error('404 no branches');
  state.branches = list.map(x => x.name);
  let best = null, when = 0;
  await Promise.all(list.slice(0, 12).map(async x => { try { const t = Date.parse(JSON.parse(await get(API + '/commits/' + x.commit.sha)).commit.committer.date) || 0; if (t > when) { when = t; best = x.name; } } catch (e) {} }));
  if (best) state.latest = best;
  return state.latest || 'main';
}
async function check(quick) {
  if (state.channel === 'off') { status = 'Updates are off'; return false; }
  let branch = state.channel;
  try {
    if (branch === 'latest') branch = quick && state.latest ? state.latest : await newestBranch();
    else if (!quick) get(API + '/branches?per_page=100').then(t => { const b = JSON.parse(t).map(x => String(x.name)).filter(n => /^[\w./-]+$/.test(n)); if (b.length) { state.branches = b; save(); } }).catch(() => {});
    const sha = (await get(API + '/commits/' + branch, 'application/vnd.github.sha')).trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('no commit for ' + branch);
    const short = sha.slice(0, 7);
    if (sha === state.sha || (!state.sha && sha === builtSha())) { status = 'Up to date with ' + branch + ' (' + short + ')'; return false; }
    const at = RAW + '/' + sha + '/';
    const m = A.sources(await get(at + A.MANIFEST)), files = {};
    await Promise.all([m.page, ...m.parts.map(x => x[1])].map(async f => { files[f] = await get(at + f); }));
    const page = A.appPage(A.webPage(m, files));
    let shell = false;
    await Promise.all(SHELL.map(async f => { try { if ((await get(at + f)) !== (await fsp.readFile(path.join(__dirname, f), 'utf8'))) shell = true; } catch (e) { shell = true; } }));
    const dir = liveDir();
    await fsp.mkdir(dir, { recursive: true });
    for (const sub of ['fonts', 'vendor']) await fsp.cp(path.join(bundled, sub), path.join(dir, sub), { recursive: true });
    await fsp.writeFile(path.join(dir, 'index.html.tmp'), page, 'utf8');
    await fsp.rename(path.join(dir, 'index.html.tmp'), path.join(dir, 'index.html'));
    state.sha = sha; state.shell = shell; fresh = true;
    status = 'Updated to ' + branch + ' (' + short + ')' + (shell ? '. The app itself has changed too: pull and run npm run dist' : '');
    await save();
    return true;
  } catch (e) {
    status = /^(403|429)/.test(e.message) ? 'GitHub is limiting requests. Try again in a while' : /^404/.test(e.message) ? 'Nothing found for ' + branch : /marker|manifest|CDN/.test(e.message) ? 'This update needs a newer app: pull and run npm run dist' : 'Could not reach GitHub';
    return false;
  }
}
async function setChannel(c) { state.channel = c; state.sha = ''; state.shell = false; await save(); }
module.exports = { load, check, pagePath, setChannel, state: () => state, status: () => status, takeFresh: () => { const f = fresh; fresh = false; return f; } };
