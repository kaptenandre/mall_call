// Puts the page together from its source files. Used by scripts/build.js, and by the app itself when it updates from GitHub.
// src/build.json names the page and the files that replace its markers; all of them share the page's one script scope.
const MANIFEST = 'src/build.json';
const CDN = '<script src="https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js"></script>';
const FONT_LINKS = /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/;
const FONTS = [
  ['DM Mono', 400, '@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2'],
  ['DM Mono', 500, '@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2'],
  ['Instrument Sans', 400, '@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff2'],
  ['Instrument Sans', 500, '@fontsource/instrument-sans/files/instrument-sans-latin-500-normal.woff2'],
  ['Instrument Sans', 600, '@fontsource/instrument-sans/files/instrument-sans-latin-600-normal.woff2']
];
const base = p => p.split('/').pop();

// which source files a manifest needs
function sources(manifestText) {
  const m = JSON.parse(manifestText);
  if (typeof m.page !== 'string' || !Array.isArray(m.parts)) throw new Error(MANIFEST + ' is not a build manifest');
  const ok = p => typeof p === 'string' && /^src\/[\w.-]+$/.test(p);
  if (!ok(m.page) || !m.parts.every(x => Array.isArray(x) && typeof x[0] === 'string' && ok(x[1]))) throw new Error(MANIFEST + ' names a file outside src/');
  return m;
}
// the page for a browser: every marker replaced by its file. files: { path: text }
function webPage(m, files) {
  let page = files[m.page];
  for (const [mark, file] of m.parts) {
    if (page.split(mark).length !== 2) throw new Error(m.page + ' must contain the ' + mark + ' marker exactly once');
    page = page.replace(mark, () => files[file]);
  }
  return page;
}
// the page for the app: encoder library and fonts from local copies, so it works offline
function appPage(page) {
  if (!page.includes(CDN) || !FONT_LINKS.test(page)) throw new Error('could not find the CDN script or the font links to swap for local copies');
  let css = '';
  for (const [family, weight, file] of FONTS) css += '@font-face{font-family:"' + family + '";font-style:normal;font-weight:' + weight + ';font-display:block;src:url(fonts/' + base(file) + ') format("woff2")}\n';
  return page.replace(CDN, () => '<script src="vendor/mp4-muxer.js"></script>').replace(FONT_LINKS, () => '<style>\n' + css + '</style>');
}
module.exports = { MANIFEST, FONTS, sources, webPage, appPage };
