// Builds the page from src/ into two targets:
//   app/index.html  for the Mac app: engine inlined, encoder library and fonts bundled, works offline
//   web/index.html  the same page for a browser, loading the library and fonts from their CDNs
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let page = read('src/page.html');
const engine = read('src/engine.js');
if (page.split('/*__SCORE__*/').length !== 2) throw new Error('src/page.html must contain the /*__SCORE__*/ marker exactly once');
page = page.replace('/*__SCORE__*/', () => engine);

fs.mkdirSync(path.join(root, 'web'), { recursive: true });
fs.writeFileSync(path.join(root, 'web/index.html'), page);

const cdn = '<script src="https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js"></script>';
const fontLinks = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/;
if (!page.includes(cdn) || !fontLinks.test(page)) throw new Error('could not find the CDN script or the font links to swap for local copies');

const fonts = [
  ['DM Mono', 400, '@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2'],
  ['DM Mono', 500, '@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2'],
  ['Instrument Sans', 400, '@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff2'],
  ['Instrument Sans', 500, '@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff2'],
  ['Instrument Sans', 600, '@fontsource/instrument-sans/files/instrument-sans-latin-600-normal.woff2']
];
fs.mkdirSync(path.join(root, 'app/vendor'), { recursive: true });
fs.mkdirSync(path.join(root, 'app/fonts'), { recursive: true });
let css = '';
for (const [family, weight, file] of fonts) {
  const name = path.basename(file);
  fs.copyFileSync(path.join(root, 'node_modules', file), path.join(root, 'app/fonts', name));
  css += '@font-face{font-family:"' + family + '";font-style:normal;font-weight:' + weight + ';font-display:block;src:url(fonts/' + name + ') format("woff2")}\n';
}
fs.copyFileSync(path.join(root, 'node_modules/mp4-muxer/build/mp4-muxer.js'), path.join(root, 'app/vendor/mp4-muxer.js'));
const appPage = page.replace(cdn, () => '<script src="vendor/mp4-muxer.js"></script>').replace(fontLinks, () => '<style>\n' + css + '</style>');
fs.writeFileSync(path.join(root, 'app/index.html'), appPage);
console.log('built app/index.html (' + appPage.length + ' bytes) and web/index.html (' + page.length + ' bytes)');
