// Gives every version a tag and an entry under Releases on GitHub, so the history can be read there.
// Run by workflows/versions.yml on every push to main. It walks main from the start, finds the commit where
// each version number first shows in src/page.html, and makes what is missing. The notes come from CHANGELOG.md.
// These entries are never marked latest: "latest" stays the newest app download, which the app's Download button opens.
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const log = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const notes = v => { const m = log.split(/^## /m).find(s => s.startsWith(v + ' ')); return m ? m.split('\n').slice(1).join('\n').trim() : ''; };
const have = new Set(git('tag', '-l').split('\n').filter(Boolean)), seen = new Set();
let made = 0;
for (const sha of git('rev-list', '--first-parent', '--reverse', 'HEAD').split('\n').filter(Boolean)) {
  let page = '';
  try { page = git('show', sha + ':src/page.html'); } catch (e) { continue; }
  const m = /const BUILD = '(v\d+\.\d+\.\d+)'/.exec(page);
  if (!m || seen.has(m[1])) continue;
  seen.add(m[1]);
  if (have.has(m[1])) continue;
  const n = notes(m[1]), first = (n.split('\n').find(l => l.startsWith('- ')) || '').slice(2);
  execFileSync('gh', ['release', 'create', m[1], '--target', sha, '--title', m[1] + (first ? ': ' + first : ''), '--notes', n || 'See CHANGELOG.md.', '--latest=false'], { stdio: 'inherit' });
  made++;
}
console.log('versions: ' + seen.size + ' found, ' + made + ' added');
