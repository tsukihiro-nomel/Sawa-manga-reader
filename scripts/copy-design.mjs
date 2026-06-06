// Copies the Midnight Ember design assets (fonts) from the branding
// repository into the installer UI tree. Run before vite build.
//
// Source : C:\Users\evcam\Documents\VTubing\01_Branding\police\
// Target : installer/ui/fonts/{bodoni-moda,quicksand,starlight-rune}/
//
// We keep the design CSS / JSX out of this sync — those files are committed
// in-tree (verbatim copies + adaptations). Only fonts are re-synced because
// they are large binaries that don't belong in a separate commit.
//
// IMPORTANT: fonts.css references fonts under subdirectories
// (`../../fonts/bodoni-moda/…`, `../../fonts/quicksand/…`). We sort each
// matched file into its bucket here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BRANDING_ROOT = path.resolve(
  process.env.SAWA_BRANDING_ROOT ||
    path.join(
      process.env.USERPROFILE || '',
      'Documents',
      'VTubing',
      '01_Branding',
      'police'
    )
);
const FONTS_OUT = path.join(REPO_ROOT, 'installer', 'ui', 'fonts');

// Each bucket: a subdirectory + a regex matching the file BASENAME.
const BUCKETS = [
  {
    dir: 'bodoni-moda',
    re: /^BodoniModa.*\.(ttf|otf|woff2?)$/i,
  },
  {
    dir: 'quicksand',
    re: /^Quicksand.*\.(ttf|otf|woff2?)$/i,
  },
  {
    dir: 'starlight-rune',
    // Filename in the branding repo: "StarlightRune-Personal Use.ttf"
    re: /^Starlight ?Rune.*\.(ttf|otf|woff2?)$/i,
  },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield { name: entry.name, full };
    }
  }
}

// Remove old flat copies that earlier (broken) versions of this script left
// directly under installer/ui/fonts/.
function cleanFlatStrays() {
  if (!fs.existsSync(FONTS_OUT)) return;
  for (const entry of fs.readdirSync(FONTS_OUT, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (BUCKETS.some((b) => b.re.test(entry.name))) {
      try {
        fs.unlinkSync(path.join(FONTS_OUT, entry.name));
      } catch (_err) {
        /* ignore */
      }
    }
  }
}

function main() {
  if (!fs.existsSync(BRANDING_ROOT)) {
    console.warn(`[copy-design] Branding root not found: ${BRANDING_ROOT}`);
    console.warn('[copy-design] Skipping font sync (UI will use fallback CSS).');
    return;
  }
  ensureDir(FONTS_OUT);
  cleanFlatStrays();

  const counts = Object.fromEntries(BUCKETS.map((b) => [b.dir, 0]));
  for (const file of walk(BRANDING_ROOT)) {
    const bucket = BUCKETS.find((b) => b.re.test(file.name));
    if (!bucket) continue;
    const dest = path.join(FONTS_OUT, bucket.dir);
    ensureDir(dest);
    try {
      fs.copyFileSync(file.full, path.join(dest, file.name));
      counts[bucket.dir] += 1;
    } catch (err) {
      console.warn('[copy-design] Failed to copy', file.full, '-', err.message);
    }
  }

  for (const [dir, n] of Object.entries(counts)) {
    if (n === 0) {
      console.warn(`[copy-design] No fonts matched for bucket "${dir}".`);
    } else {
      console.log(`[copy-design] ${dir}: ${n} file(s) → ${path.join(FONTS_OUT, dir)}`);
    }
  }
  console.log(
    '[copy-design] Reminder: JetBrains Mono is not in 01_Branding — keep installer/ui/fonts/jetbrains-mono/ in sync separately.'
  );
}

main();
