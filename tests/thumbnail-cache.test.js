import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function createTempSource(prefix = 'sawa-thumbs-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(root);
  const sourcePath = path.join(root, 'cover.jpg');
  fs.writeFileSync(sourcePath, 'source-image');
  return { root, sourcePath, cacheDir: path.join(root, 'cache') };
}

function createWritingGenerator(contents = 'thumbnail-png') {
  return vi.fn(async ({ targetPath }) => {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, contents);
    return targetPath;
  });
}

describe('thumbnail cache', () => {
  it('deduplicates nearby display sizes into a bounded palette key', async () => {
    const { createThumbnailCache } = require('../electron/services/thumbnailCache.cjs');
    const { sourcePath, cacheDir } = createTempSource();
    const generateThumbnail = createWritingGenerator();
    const cache = createThumbnailCache({ cacheDir, generateThumbnail });

    const [first, second] = await Promise.all([
      cache.getOrCreate(sourcePath, { width: 360, height: 540 }),
      cache.getOrCreate(sourcePath, { width: 367, height: 545 })
    ]);

    expect(first).toBe(second);
    expect(fs.readFileSync(first, 'utf8')).toBe('thumbnail-png');
    expect(generateThumbnail).toHaveBeenCalledTimes(1);
    expect(generateThumbnail).toHaveBeenCalledWith(expect.objectContaining({
      width: 384,
      height: 768,
      quality: 'good'
    }));
  });

  it('uses only the declared buckets for every requested dimension', () => {
    const {
      THUMBNAIL_BUCKETS,
      resolveDimensionBucket
    } = require('../electron/services/thumbnailCache.cjs');
    const resolved = new Set();
    for (let dimension = 32; dimension <= 2048; dimension += 8) {
      resolved.add(resolveDimensionBucket(dimension));
    }
    expect([...resolved]).toEqual(THUMBNAIL_BUCKETS);
  });

  it('limits generation to two concurrent thumbnail tasks', async () => {
    const { createThumbnailCache } = require('../electron/services/thumbnailCache.cjs');
    const { root, cacheDir } = createTempSource('sawa-thumbs-concurrency-');
    const sources = ['a.jpg', 'b.jpg', 'c.jpg'].map((name) => {
      const sourcePath = path.join(root, name);
      fs.writeFileSync(sourcePath, name);
      return sourcePath;
    });
    let active = 0;
    let maximumActive = 0;
    const releases = [];
    const generateThumbnail = vi.fn(({ targetPath }) => new Promise((resolve) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      releases.push(async () => {
        active -= 1;
        await fs.promises.writeFile(targetPath, 'thumbnail');
        resolve(targetPath);
      });
    }));
    const cache = createThumbnailCache({ cacheDir, generateThumbnail, maxConcurrent: 2 });
    const results = sources.map((sourcePath) => cache.getOrCreate(sourcePath));

    await vi.waitFor(() => expect(releases).toHaveLength(2));
    await Promise.all(releases.splice(0, 2).map((release) => release()));
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    await releases.shift()();
    await Promise.all(results);

    expect(maximumActive).toBe(2);
  });

  it('separates high-quality cache entries', async () => {
    const { createThumbnailCache } = require('../electron/services/thumbnailCache.cjs');
    const { sourcePath, cacheDir } = createTempSource('sawa-thumbs-quality-');
    const generateThumbnail = createWritingGenerator('quality-thumbnail');
    const cache = createThumbnailCache({ cacheDir, generateThumbnail });

    const good = await cache.getOrCreate(sourcePath, { width: 700, height: 900, quality: 'balanced' });
    const best = await cache.getOrCreate(sourcePath, { width: 700, height: 900, quality: 'high' });

    expect(good).not.toBe(best);
    expect(generateThumbnail.mock.calls.map(([payload]) => payload.quality)).toEqual(['good', 'best']);
  });

  it('evicts expired entries first and then least-recently-used entries to the quota', async () => {
    const { evictThumbnailCache } = require('../electron/services/thumbnailCache.cjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-thumbs-evict-'));
    tempDirs.push(root);
    const now = Date.now();
    const paths = {
      expired: path.join(root, 'expired.png'),
      lru: path.join(root, 'lru.png'),
      recent: path.join(root, 'recent.png')
    };
    for (const filePath of Object.values(paths)) fs.writeFileSync(filePath, '1234567890');
    fs.utimesSync(paths.expired, new Date(now - 10_000), new Date(now - 10_000));
    fs.utimesSync(paths.lru, new Date(now - 2_000), new Date(now - 2_000));
    fs.utimesSync(paths.recent, new Date(now - 1_000), new Date(now - 1_000));

    const result = await evictThumbnailCache({
      cacheDir: root,
      maxAgeMs: 5_000,
      maxCacheBytes: 10,
      now
    });

    expect(fs.existsSync(paths.expired)).toBe(false);
    expect(fs.existsSync(paths.lru)).toBe(false);
    expect(fs.existsSync(paths.recent)).toBe(true);
    expect(result).toEqual({ removed: 2, bytes: 10 });
  });

  it('fits portrait and landscape thumbnails inside both ceilings without changing aspect ratio', () => {
    const { fitSizeWithinBounds } = require('../electron/services/thumbnailCache.cjs');
    expect(fitSizeWithinBounds(
      { width: 1000, height: 3000 },
      { width: 1400, height: 2048 }
    )).toEqual({ width: 683, height: 2048 });
    expect(fitSizeWithinBounds(
      { width: 3000, height: 1000 },
      { width: 1400, height: 2048 }
    )).toEqual({ width: 1400, height: 467 });
  });

  it('returns null instead of rejecting when the utility worker cannot decode an image', async () => {
    const { createThumbnailCache } = require('../electron/services/thumbnailCache.cjs');
    const { sourcePath, cacheDir } = createTempSource('sawa-thumbs-invalid-');
    const cache = createThumbnailCache({
      cacheDir,
      generateThumbnail: vi.fn(async () => {
        throw new Error('Unsupported image');
      })
    });

    await expect(cache.getOrCreate(sourcePath)).resolves.toBeNull();
  });
});
