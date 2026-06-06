// Three-stage installer build:
//
//   Stage A — silent NSIS backend (electron-builder, dedicated config)
//   Stage B — Electron UI shell (vite build of installer/ui + electron-builder --dir)
//   Stage C — NSIS wrapper that produces Sawa-Setup-<version>.exe
//
// The output of Stage A is consumed by Stage B as `extraResources/backend/`.
// The output of Stage B is consumed by Stage C as the bundle to wrap.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PKG = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
);
const VERSION = PKG.version || '0.0.0';

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    ...opts,
  });
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function stageA() {
  console.log('\n=== Stage A — silent NSIS backend ===');
  // Build the main app first (vite) so the backend has the asar to package.
  run('npm run build:web');
  run(
    'npx electron-builder --win nsis -c installer/build/nsis-backend.yml --publish never'
  );
  const backendOut = path.join(REPO_ROOT, 'release-backend');
  // electron-builder will place an `installer-backend.exe` here. Locate it.
  const candidates = fs.existsSync(backendOut)
    ? fs
        .readdirSync(backendOut)
        .filter((f) => /installer-backend.*\.exe$/i.test(f))
    : [];
  if (!candidates.length) {
    throw new Error(
      'Stage A failed: installer-backend.exe not found in release-backend/'
    );
  }
  const backendExe = path.join(backendOut, candidates[0]);
  console.log(`Stage A: backend → ${backendExe}`);
  return backendExe;
}

function stageB(backendExe) {
  console.log('\n=== Stage B — Electron UI shell ===');
  // Copy fonts from branding repo (best effort).
  run('node scripts/copy-design.mjs');
  // Vite build of the installer UI.
  run('npx vite build -c vite.installer.config.js');

  // Stage the backend into installer/build-resources/backend/ so the UI
  // build can reference it via extraResources.
  const stagedBackendDir = path.join(REPO_ROOT, 'installer', 'build-resources', 'backend');
  fs.mkdirSync(stagedBackendDir, { recursive: true });
  fs.copyFileSync(backendExe, path.join(stagedBackendDir, 'installer-backend.exe'));

  // Build a minimal electron-builder config on the fly.
  const uiBuilderConfig = {
    appId: 'com.sawahiro.mangalibrary.installer',
    productName: 'Sawa Installer',
    // executableName drives the .exe filename; mainCJS / NSIS wrapper / and
    // the uninstall flow all reference 'installer-ui.exe'.
    executableName: 'installer-ui',
    copyright: `© 2025 Sawahiro`,
    directories: {
      output: path.join(REPO_ROOT, 'release-installer'),
      app: path.join(REPO_ROOT, 'installer'),
    },
    files: [
      'main/**/*',
      'dist-ui/**/*',
      'ui/fonts/**/*',
      'package.json',
    ],
    extraResources: [
      // Paths are resolved relative to the project root (parent of `app:`),
      // not relative to the `app:` directory.
      { from: 'installer/build-resources/backend', to: 'backend' },
      { from: 'build/LICENSE.txt', to: 'LICENSE.txt' },
      { from: 'README.md', to: 'README.md' },
      { from: 'electron/services', to: 'services' },
    ],
    win: {
      target: 'dir',
      icon: path.join(REPO_ROOT, 'build', 'icon.ico'),
      requestedExecutionLevel: 'asInvoker',
      artifactName: 'installer-ui-${version}.${ext}',
    },
    asar: true,
  };
  const cfgPath = path.join(REPO_ROOT, 'installer', 'build', 'ui-builder.json');
  fs.writeFileSync(cfgPath, JSON.stringify(uiBuilderConfig, null, 2));
  // Override the "main" field so electron-builder loads installer/main/main.cjs.
  const tmpPkgPath = path.join(REPO_ROOT, 'installer', 'package.json');
  fs.writeFileSync(
    tmpPkgPath,
    JSON.stringify(
      {
        name: 'sawa-installer',
        version: VERSION,
        main: 'main/main.cjs',
        productName: 'Sawa Installer',
        // electron-builder needs a productName/description to avoid warnings
        description: 'Sawa Manga Library — Setup',
        author: 'Sawahiro',
        // Reuse the parent project's electron version, otherwise EB pulls
        // its own copy.
        devDependencies: {
          electron: PKG.devDependencies.electron,
        },
      },
      null,
      2
    )
  );

  run(`npx electron-builder --dir -c "${cfgPath}"`);

  const out = path.join(REPO_ROOT, 'release-installer', 'win-unpacked');
  if (!exists(out)) {
    throw new Error('Stage B failed: release-installer/win-unpacked missing');
  }
  console.log(`Stage B: UI bundle → ${out}`);
  return out;
}

function findMakensis() {
  const home =
    process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local');
  const ebCache = path.join(home, 'electron-builder', 'Cache', 'nsis');
  if (!fs.existsSync(ebCache)) return null;
  // Prefer the latest nsis-X.Y/Bin/makensis.exe — explicitly excluding
  // the `nsis-resources-*` companion dirs which only contain include files.
  const versions = fs
    .readdirSync(ebCache, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        /^nsis-\d/i.test(d.name) &&
        !/^nsis-resources/i.test(d.name)
    )
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const v of versions) {
    const candidate = path.join(ebCache, v, 'Bin', 'makensis.exe');
    if (exists(candidate)) return candidate;
    const candidate2 = path.join(ebCache, v, 'makensis.exe');
    if (exists(candidate2)) return candidate2;
  }
  return null;
}

function stageC(uiUnpacked) {
  console.log('\n=== Stage C — NSIS wrapper ===');
  const makensis = findMakensis();
  if (!makensis) {
    throw new Error(
      'Stage C failed: makensis.exe not found in electron-builder cache. ' +
        'Run any electron-builder NSIS build at least once to populate it.'
    );
  }
  console.log(`Using makensis: ${makensis}`);

  const wrapperNsi = path.join(REPO_ROOT, 'installer', 'build', 'sfx-wrapper.nsi');
  const iconFile = path.join(REPO_ROOT, 'build', 'icon.ico');
  const outFile = path.join(
    REPO_ROOT,
    'release-installer',
    `Sawa-Setup-${VERSION}.exe`
  );
  if (exists(outFile)) fs.unlinkSync(outFile);

  // /D defines must be quoted to handle paths with spaces.
  const defines = [
    `/DPAYLOAD_DIR=${uiUnpacked}`,
    `/DOUTPUT_FILE=${outFile}`,
    `/DPRODUCT_VERSION=${VERSION}`,
    `/DICON_FILE=${iconFile}`,
  ];
  // makensis.exe accepts /D switches; on Windows we can pass them positionally
  // but each must be one argument. We use spawnSync via execSync's quoting.
  const cmd = `"${makensis}" /V2 ${defines.map((d) => `"${d}"`).join(' ')} "${wrapperNsi}"`;
  run(cmd);

  if (!exists(outFile)) {
    throw new Error('Stage C failed: makensis did not produce the output file');
  }
  console.log(`Stage C: final installer → ${outFile}`);
  return outFile;
}

try {
  const backendExe = stageA();
  const uiUnpacked = stageB(backendExe);
  const sfxExe = stageC(uiUnpacked);
  console.log('\n=== Done ===');
  console.log(`Output: ${sfxExe}`);
} catch (err) {
  console.error('\n[build-installer] FAILED:', err.message);
  process.exit(1);
}
