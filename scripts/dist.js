// Packages the Mac app into dist/. Run on the Mac: npm run dist
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const NAME = 'Mall Call';

async function main() {
  const mod = await import('@electron/packager');
  const packager = mod.packager || mod.default;
  const mac = process.platform === 'darwin';
  const png = path.join(root, 'icon/icon.png'), icns = path.join(root, 'icon/icon.icns');
  if (mac && fs.existsSync(png) && !fs.existsSync(icns)) {       // make the .icns from the PNG with the tools macOS ships
    const set = path.join(root, 'icon/icon.iconset');
    fs.mkdirSync(set, { recursive: true });
    for (const s of [16, 32, 128, 256, 512]) {
      execFileSync('sips', ['-z', String(s), String(s), png, '--out', path.join(set, 'icon_' + s + 'x' + s + '.png')], { stdio: 'ignore' });
      execFileSync('sips', ['-z', String(s * 2), String(s * 2), png, '--out', path.join(set, 'icon_' + s + 'x' + s + '@2x.png')], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c', 'icns', set, '-o', icns]);
  }
  const keep = ['/main.js', '/preload.js', '/package.json', '/app'];
  const out = await packager({
    dir: root, name: NAME, out: path.join(root, 'dist'), overwrite: true, prune: true,
    platform: process.platform, arch: process.arch,
    appBundleId: 'local.mall-call', appCategoryType: 'public.app-category.video',
    icon: fs.existsSync(icns) ? icns : undefined,
    ignore: p => p !== '' && !keep.some(k => p === k || p.startsWith(k + '/'))
  });
  for (const dir of out) {
    if (mac) {                                                    // ad-hoc signature so Apple silicon will run the bundle
      const appPath = path.join(dir, NAME + '.app');
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
      console.log('built ' + appPath);
    } else console.log('built ' + dir);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
