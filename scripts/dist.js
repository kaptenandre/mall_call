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
  // MALLCALL_ARCH builds for the other kind of Mac; MALLCALL_FFMPEG is an ffmpeg to carry inside the app, so exports need no install
  const ARCH = process.env.MALLCALL_ARCH || process.arch, FFMPEG = process.env.MALLCALL_FFMPEG && fs.existsSync(process.env.MALLCALL_FFMPEG) ? process.env.MALLCALL_FFMPEG : null;
  const keep = ['/main.js', '/preload.js', '/update.js', '/assemble.js', '/package.json', '/app'];
  const out = await packager({
    dir: root, name: NAME, out: path.join(root, 'dist'), overwrite: true, prune: true,
    platform: process.platform, arch: ARCH,
    extraResource: FFMPEG ? [FFMPEG] : undefined,
    appBundleId: 'local.mall-call', appCategoryType: 'public.app-category.video',
    extendInfo: { NSMicrophoneUsageDescription: 'Mall Call listens to a sound input to follow timecode from a lighting desk.' },
    icon: fs.existsSync(icns) ? icns : undefined,
    ignore: p => p !== '' && !keep.some(k => p === k || p.startsWith(k + '/'))
  });
  for (const dir of out) {
    if (mac) {                                                    // ad-hoc signature so Apple silicon will run the bundle
      const appPath = path.join(dir, NAME + '.app'), ff = path.join(appPath, 'Contents', 'Resources', 'ffmpeg');
      if (fs.existsSync(ff)) { fs.chmodSync(ff, 0o755); execFileSync('codesign', ['--force', '--sign', '-', ff], { stdio: 'inherit' }); }
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
      console.log('built ' + appPath);
    } else console.log('built ' + dir);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
