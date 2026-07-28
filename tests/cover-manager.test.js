import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  activeCoverPath,
  buildCoverGallery,
  discoverLegacyCovers,
  importManagedCover,
  normalizeCollectionAppearance,
  normalizeCoverProfile,
  resolveCoverCandidatePath,
  selectCoverVariant,
  updateCoverCrop
} = require('../electron/services/coverManager.cjs');

describe('managed cover profiles', () => {
  it('copies by sha-256, deduplicates bytes and leaves the source intact', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cover-manager-'));
    const sourceA = path.join(root, 'cover-a.png');
    const sourceB = path.join(root, 'cover-b.jpg');
    const managed = path.join(root, 'managed');
    fs.writeFileSync(sourceA, Buffer.from('same-image'));
    fs.writeFileSync(sourceB, Buffer.from('same-image'));

    const first = await importManagedCover({ sourcePath: sourceA, managedCoverDir: managed });
    const second = await importManagedCover({ sourcePath: sourceB, managedCoverDir: managed });

    expect(first.hash).toBe(second.hash);
    expect(second.deduplicated).toBe(true);
    expect(fs.readdirSync(managed)).toHaveLength(1);
    expect(fs.readFileSync(sourceA, 'utf8')).toBe('same-image');
    expect(fs.readFileSync(sourceB, 'utf8')).toBe('same-image');
  });

  it('identifies the exact durable temp stream even if the source changes during import', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cover-race-'));
    const source = path.join(root, 'changing.png');
    const managed = path.join(root, 'managed');
    fs.writeFileSync(source, Buffer.alloc(4 * 1024 * 1024, 0x41));
    let changed = false;
    const result = await importManagedCover({
      sourcePath: source,
      managedCoverDir: managed,
      hooks: {
        onChunk: ({ chunkIndex }) => {
          if (changed || chunkIndex !== 0) return;
          changed = true;
          fs.writeFileSync(source, Buffer.alloc(4 * 1024 * 1024, 0x42));
        }
      }
    });
    const stored = fs.readFileSync(result.path);
    const storedHash = crypto.createHash('sha256').update(stored).digest('hex');
    expect(result.hash).toBe(storedHash);
    expect(result.id).toBe(`managed-${storedHash.slice(0, 20)}`);
    expect(fs.readdirSync(managed).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('keeps separate non-destructive portrait and banner crops', () => {
    let profile = normalizeCoverProfile({}, 'manga-1');
    profile = updateCoverCrop(profile, 'portrait', { x: 0.4, y: -0.2, zoom: 2 });
    profile = updateCoverCrop(profile, 'banner', { x: -2, y: 2, zoom: 9 });
    expect(profile.crops.portrait).toEqual({ x: 0.4, y: -0.2, zoom: 2 });
    expect(profile.crops.banner).toEqual({ x: -1, y: 1, zoom: 4 });
  });

  it('selects only known variants and resolves the active path', () => {
    const profile = normalizeCoverProfile({
      variants: [{ id: 'managed-a', path: 'C:\\covers\\a.jpg' }]
    }, 'manga-1');
    const selected = selectCoverVariant(profile, 'managed-a');
    expect(activeCoverPath(selected)).toBe('C:\\covers\\a.jpg');
    expect(() => selectCoverVariant(profile, 'missing')).toThrow(/plus disponible/);
  });
});

describe('legacy cover compatibility', () => {
  it('discovers old custom and online covers without deleting or rewriting them', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cover-legacy-'));
    const custom = path.join(root, '.sawa-custom-cover.jpg');
    const online = path.join(root, '.sawa-online-cover.webp');
    fs.writeFileSync(custom, 'custom');
    fs.writeFileSync(online, 'online');
    fs.writeFileSync(path.join(root, 'page.jpg'), 'page');

    const variants = discoverLegacyCovers(root);
    expect(variants.map((item) => item.kind).sort()).toEqual(['legacy-custom', 'legacy-online']);
    expect(fs.readFileSync(custom, 'utf8')).toBe('custom');
    expect(fs.readFileSync(online, 'utf8')).toBe('online');

    const gallery = buildCoverGallery({
      manga: { id: 'manga-1', path: root, chapters: [] },
      profile: {}
    });
    expect(gallery.profile.variants).toHaveLength(2);
  });
});

describe('cover candidate path safety', () => {
  it('accepts a real image inside the real manga root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cover-root-'));
    const candidate = path.join(root, 'page.jpg');
    fs.writeFileSync(candidate, 'page');
    expect(resolveCoverCandidatePath(candidate, root)).toBe(fs.realpathSync(candidate));
  });

  it('refuses a symlink or reparse target that resolves outside the manga root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cover-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cover-outside-'));
    const outsideFile = path.join(outside, 'private.jpg');
    const linkedFile = path.join(root, 'linked.jpg');
    fs.writeFileSync(outsideFile, 'private');
    try {
      fs.symlinkSync(outsideFile, linkedFile, 'file');
      expect(resolveCoverCandidatePath(linkedFile, root)).toBeNull();
    } catch (_error) {
      const fakeOperations = {
        existsSync: () => true,
        realpathSync: (value) => path.resolve(value) === path.resolve(root) ? root : outsideFile,
        statSync: () => ({ isFile: () => true, size: 7 })
      };
      expect(resolveCoverCandidatePath(linkedFile, root, fakeOperations)).toBeNull();
    }
  });
});

describe('collection appearance normalization', () => {
  it('defaults to mosaic and bounds featured mangas', () => {
    expect(normalizeCollectionAppearance(null)).toEqual({ type: 'mosaic', featuredMangaIds: [] });
    expect(normalizeCollectionAppearance({
      type: 'stack',
      featuredMangaIds: ['a', 'a', 'b', 'c', 'd', 'e']
    })).toEqual({ type: 'stack', featuredMangaIds: ['a', 'b', 'c', 'd'] });
    expect(normalizeCollectionAppearance('invalid').type).toBe('mosaic');
  });
});
