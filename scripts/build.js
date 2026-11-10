// Builds the page from src/ into two targets:
//   app/index.html  for the Mac app: engine inlined, encoder library and fonts bundled, works offline
//   web/index.html  the same page for a browser, loading the library and fonts from their CDNs
// Also writes app/build.json with the commit this was built from, so the app knows whether GitHub has something newer.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const A = require('../assemble.js');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const m = A.sources(read(A.MANIFEST)), files = {};
for (const f of [m.page, ...m.parts.map(x => x[1])]) files[f] = read(f);
const page = A.webPage(m, files), appPage = A.appPage(page);

fs.mkdirSync(path.join(root, 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'web/index.html'), page);
fs.mkdirSync(path.join(root, 'app/vendor'), { recursive: true });
fs.mkdirSync(path.join(root, 'app/fonts'), { recursive: true });
for (const [, , file] of A.FONTS) fs.copyFileSync(path.join(root, 'node_modules', file), path.join(root, 'app/fonts', path.basename(file)));
fs.copyFileSync(path.join(root, 'node_modules/mp4-muxer/build/mp4-muxer.js'), path.join(root, 'app/vendor/mp4-muxer.js'));
fs.writeFileSync(path.join(root, 'app/index.html'), appPage);

let sha = '';
try {
  const git = a => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  if (!git(['status', '--porcelain', '--', 'src', 'assemble.js'])) sha = git(['rev-parse', 'HEAD']);    // only a clean tree is that commit
} catch (e) {}
fs.writeFileSync(path.join(root, 'app/build.json'), JSON.stringify({ sha }));
console.log('built app/index.html (' + appPage.length + ' bytes) and web/index.html (' + page.length + ' bytes)' + (sha ? ' from ' + sha.slice(0, 7) : ''));
