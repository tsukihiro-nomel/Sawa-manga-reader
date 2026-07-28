const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const THUMBNAIL_BUCKETS = Object.freeze([256, 384, 512, 768, 1024, 1536, 2048]);
const DEFAULT_MAX_CACHE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function clampDimension(value, fallback = 512) {
  const number = Math.round(Number(value) || fallback);
  return Math.max(32, Math.min(2048, number));
}

function resolveDimensionBucket(value, fallback = 512) {
  const requested = clampDimension(value, fallback);
  return THUMBNAIL_BUCKETS.find((bucket) => bucket >= requested)
    || THUMBNAIL_BUCKETS[THUMBNAIL_BUCKETS.length - 1];
}

function resolveThumbnailBucket(options = {}) {
  return {
    width: resolveDimensionBucket(options.width, 512),
    height: resolveDimensionBucket(options.height, 768)
  };
}

function normalizeQuality(value) {
  return ['high', 'best', 'net'].includes(String(value || '').toLowerCase())
    ? 'best'
    : 'good';
}

function fitSizeWithinBounds(sourceSize = {}, bounds = {}) {
  const sourceWidth = Math.max(1, Number(sourceSize.width) || 1);
  const sourceHeight = Math.max(1, Number(sourceSize.height) || 1);
  const maxWidth = clampDimension(bounds.width, sourceWidth);
  const maxHeight = clampDimension(bounds.height, sourceHeight);
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

async function fileExists(fsImpl, filePath) {
  try {
    await fsImpl.promises.stat(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

async function evictThumbnailCache({
  cacheDir,
  fsImpl = fs,
  maxCacheBytes = DEFAULT_MAX_CACHE_BYTES,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  now = Date.now(),
  protectedPaths = []
} = {}) {
  const protectedSet = new Set(protectedPaths.map((entry) => path.resolve(entry)));
  let dirents;
  try {
    dirents = await fsImpl.promises.readdir(cacheDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { removed: 0, bytes: 0 };
    throw error;
  }

  const entries = [];
  for (const dirent of dirents) {
    if (!dirent.isFile() || !dirent.name.toLowerCase().endsWith('.png')) continue;
    const filePath = path.join(cacheDir, dirent.name);
    try {
      const stat = await fsImpl.promises.stat(filePath);
      entries.push({
        filePath,
        size: Math.max(0, Number(stat.size) || 0),
        lastUsed: Number(stat.mtimeMs) || Number(stat.atimeMs) || 0
      });
    } catch (_) {
      // A concurrent cleanup or generation may have moved the entry.
    }
  }

  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  let removed = 0;
  const removedPaths = new Set();
  const removeEntry = async (entry) => {
    if (protectedSet.has(path.resolve(entry.filePath))) return false;
    try {
      await fsImpl.promises.unlink(entry.filePath);
      removedPaths.add(entry.filePath);
      totalBytes = Math.max(0, totalBytes - entry.size);
      removed += 1;
      return true;
    } catch (_) {
      return false;
    }
  };

  for (const entry of entries) {
    if (maxAgeMs >= 0 && now - entry.lastUsed > maxAgeMs) {
      await removeEntry(entry);
    }
  }

  const quota = Math.max(0, Number(maxCacheBytes) || 0);
  if (totalBytes > quota) {
    const lruEntries = entries
      .filter((entry) => !removedPaths.has(entry.filePath))
      .sort((left, right) => left.lastUsed - right.lastUsed);
    for (const entry of lruEntries) {
      if (totalBytes <= quota) break;
      await removeEntry(entry);
    }
  }

  return { removed, bytes: totalBytes };
}

function createScheduler(maxConcurrent = 2) {
  const queue = [];
  let active = 0;
  const drain = () => {
    while (active < maxConcurrent && queue.length > 0) {
      const task = queue.shift();
      active += 1;
      Promise.resolve()
        .then(task.run)
        .then(task.resolve, task.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };
  return (run) => new Promise((resolve, reject) => {
    queue.push({ run, resolve, reject });
    drain();
  });
}

function createThumbnailCache({
  cacheDir,
  generateThumbnail,
  fsImpl = fs,
  maxConcurrent = 2,
  maxCacheBytes = DEFAULT_MAX_CACHE_BYTES,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
  now = () => Date.now()
} = {}) {
  if (!cacheDir) throw new TypeError('cacheDir is required');
  if (typeof generateThumbnail !== 'function') {
    throw new TypeError('generateThumbnail must be a function');
  }

  const schedule = createScheduler(Math.max(1, Math.min(2, Number(maxConcurrent) || 2)));
  const inFlight = new Map();
  let lastCleanupAt = 0;
  let cleanupPromise = null;
  const ensureCacheDir = fsImpl.promises.mkdir(cacheDir, { recursive: true });

  const maybeCleanup = async (protectedPaths = []) => {
    const currentTime = now();
    if (cleanupPromise) return cleanupPromise;
    if (currentTime - lastCleanupAt < cleanupIntervalMs) return null;
    lastCleanupAt = currentTime;
    cleanupPromise = ensureCacheDir
      .then(() => evictThumbnailCache({
        cacheDir,
        fsImpl,
        maxCacheBytes,
        maxAgeMs,
        now: currentTime,
        protectedPaths
      }))
      .catch(() => null)
      .finally(() => {
        cleanupPromise = null;
      });
    return cleanupPromise;
  };

  const getOrCreate = async (sourcePath, options = {}) => {
    if (!sourcePath) return null;
    let sourceStat;
    try {
      sourceStat = await fsImpl.promises.stat(sourcePath);
    } catch (_) {
      return null;
    }

    const bounds = resolveThumbnailBucket(options);
    const quality = normalizeQuality(options.quality);
    const digest = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        sourcePath: path.resolve(sourcePath),
        size: sourceStat.size,
        mtimeMs: sourceStat.mtimeMs,
        width: bounds.width,
        height: bounds.height,
        quality
      }))
      .digest('hex');
    const targetPath = path.join(cacheDir, `${digest}.png`);

    await ensureCacheDir;
    if (await fileExists(fsImpl, targetPath)) {
      const currentTime = new Date(now());
      fsImpl.promises.utimes(targetPath, currentTime, currentTime).catch(() => {});
      maybeCleanup([targetPath]);
      return targetPath;
    }

    if (inFlight.has(targetPath)) return inFlight.get(targetPath);
    const pending = schedule(async () => {
      if (await fileExists(fsImpl, targetPath)) return targetPath;
      try {
        const generatedPath = await generateThumbnail({
          sourcePath,
          targetPath,
          width: bounds.width,
          height: bounds.height,
          quality
        });
        const resultPath = generatedPath || targetPath;
        if (!(await fileExists(fsImpl, resultPath))) return null;
        await maybeCleanup([resultPath]);
        return resultPath;
      } catch (_) {
        return null;
      }
    }).finally(() => {
      inFlight.delete(targetPath);
    });
    inFlight.set(targetPath, pending);
    return pending;
  };

  return {
    getOrCreate,
    cleanup: (protectedPaths = []) => evictThumbnailCache({
      cacheDir,
      fsImpl,
      maxCacheBytes,
      maxAgeMs,
      now: now(),
      protectedPaths
    })
  };
}

module.exports = {
  DEFAULT_MAX_AGE_MS,
  DEFAULT_MAX_CACHE_BYTES,
  THUMBNAIL_BUCKETS,
  createThumbnailCache,
  evictThumbnailCache,
  fitSizeWithinBounds,
  normalizeQuality,
  resolveDimensionBucket,
  resolveThumbnailBucket
};
