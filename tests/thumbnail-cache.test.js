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

describe('thumbnail cache', () => {
  it('deduplicates generation and writes a bounded cached image', async () => {
    let thumbnailModule = null;
    try {
      thumbnailModule = require('../electron/services/thumbnailCache.cjs');
    } catch (_error) {
      thumbnailModule = null;
    }
    expect(typeof thumbnailModule?.createThumbnailCache).toBe('function');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-thumbs-'));
    tempDirs.push(root);
    const sourcePath = path.join(root, 'cover.jpg');
    const cacheDir = path.join(root, 'cache');
    fs.writeFileSync(sourcePath, 'source-image');
    const createThumbnailFromPath = vi.fn(async (_source, size) => {
      expect(size).toEqual({ width: 360, height: 540 });
      return {
        isEmpty: () => false,
        toPNG: () => Buffer.from('thumbnail-png')
      };
    });
    const cache = thumbnailModule.createThumbnailCache({
      cacheDir,
      nativeImageImpl: { createThumbnailFromPath }
    });

    const [first, second] = await Promise.all([
      cache.getOrCreate(sourcePath, { width: 360, height: 540 }),
      cache.getOrCreate(sourcePath, { width: 360, height: 540 })
    ]);

    expect(first).toBe(second);
    expect(fs.readFileSync(first, 'utf8')).toBe('thumbnail-png');
    expect(createThumbnailFromPath).toHaveBeenCalledTimes(1);
  });

  it('falls back to Electron image decoding when the Windows thumbnail API rejects a file', async () => {
    const { createThumbnailCache } = require('../electron/services/thumbnailCache.cjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-thumbs-fallback-'));
    tempDirs.push(root);
    const sourcePath = path.join(root, 'cover.png');
    fs.writeFileSync(sourcePath, 'source-image');
    const resized = {
      isEmpty: () => false,
      toPNG: () => Buffer.from('decoded-thumbnail')
    };
    const resize = vi.fn(() => resized);
    const cache = createThumbnailCache({
      cacheDir: path.join(root, 'cache'),
      nativeImageImpl: {
        createThumbnailFromPath: vi.fn(async () => {
          throw new Error('No thumbnail handler registered');
        }),
        createFromPath: vi.fn(() => ({ resize }))
      }
    });

    const result = await cache.getOrCreate(sourcePath, { width: 360, height: 540 });

    expect(fs.readFileSync(result, 'utf8')).toBe('decoded-thumbnail');
    expect(resize).toHaveBeenCalledWith({ width: 360, height: 540, quality: 'good' });
  });

  it('returns null instead of rejecting when no decoder can create a thumbnail', async () => {
    const { createThumbnailCache } = require('../electron/services/thumbnailCache.cjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-thumbs-invalid-'));
    tempDirs.push(root);
    const sourcePath = path.join(root, 'cover.invalid');
    fs.writeFileSync(sourcePath, 'source-image');
    const cache = createThumbnailCache({
      cacheDir: path.join(root, 'cache'),
      nativeImageImpl: {
        createThumbnailFromPath: vi.fn(async () => {
          throw new Error('Unsupported image');
        }),
        createFromPath: vi.fn(() => ({
          isEmpty: () => true,
          resize: () => null
        }))
      }
    });

    await expect(cache.getOrCreate(sourcePath)).resolves.toBeNull();
  });
});
