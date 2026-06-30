const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function clampDimension(value, fallback) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(32, Math.min(1024, parsed));
}

function createThumbnailCache(options = {}) {
  const cacheDir = options.cacheDir;
  const fsImpl = options.fsImpl || fs;
  const nativeImageImpl = options.nativeImageImpl;
  const maxConcurrent = Math.max(1, Math.min(4, Number(options.maxConcurrent) || 2));
  const inFlight = new Map();
  const queue = [];
  let activeCount = 0;

  if (!cacheDir) throw new Error('Thumbnail cache directory is required');
  if (!nativeImageImpl) throw new Error('nativeImage implementation is required');
  fsImpl.mkdirSync(cacheDir, { recursive: true });

  function schedule(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      const drain = () => {
        while (activeCount < maxConcurrent && queue.length > 0) {
          const next = queue.shift();
          activeCount += 1;
          Promise.resolve()
            .then(next.task)
            .then(next.resolve, next.reject)
            .finally(() => {
              activeCount -= 1;
              drain();
            });
        }
      };
      drain();
    });
  }

  async function createImage(sourcePath, size) {
    if (typeof nativeImageImpl.createThumbnailFromPath === 'function') {
      try {
        const thumbnail = await nativeImageImpl.createThumbnailFromPath(sourcePath, size);
        if (thumbnail && !thumbnail.isEmpty?.()) return thumbnail;
      } catch (_error) {
        // Windows shell thumbnail providers reject some otherwise valid PNG/JPEG files.
      }
    }
    const original = nativeImageImpl.createFromPath?.(sourcePath);
    if (!original || original.isEmpty?.()) return null;
    return original?.resize?.({ ...size, quality: 'good' }) || null;
  }

  async function getOrCreate(sourcePath, requestedSize = {}) {
    let stat;
    try {
      stat = fsImpl.statSync(sourcePath);
    } catch (_error) {
      return null;
    }

    const size = {
      width: clampDimension(requestedSize.width, 360),
      height: clampDimension(requestedSize.height, 540)
    };
    const key = crypto.createHash('sha1')
      .update(`${sourcePath}|${stat.size}|${stat.mtimeMs}|${size.width}|${size.height}`)
      .digest('hex');
    const targetPath = path.join(cacheDir, `${key}.png`);
    if (fsImpl.existsSync(targetPath)) return targetPath;
    if (inFlight.has(key)) return inFlight.get(key);

    const pending = schedule(async () => {
      try {
        const image = await createImage(sourcePath, size);
        if (!image || image.isEmpty?.()) return null;
        const buffer = image.toPNG?.();
        if (!buffer?.length) return null;
        const temporaryPath = `${targetPath}.${process.pid}.tmp`;
        await fsImpl.promises.writeFile(temporaryPath, buffer);
        await fsImpl.promises.rename(temporaryPath, targetPath);
        return targetPath;
      } catch (_error) {
        return null;
      }
    }).finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, pending);
    return pending;
  }

  return {
    getOrCreate
  };
}

module.exports = {
  createThumbnailCache
};
