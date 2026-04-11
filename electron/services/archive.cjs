const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { Readable } = require('stream');
const yauzl = require('yauzl');
const { XMLParser } = require('fast-xml-parser');
const { getCbzCacheDir } = require('./storage.cjs');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.jfif', '.svg', '.tif', '.tiff'
]);
const CBZ_EXTENSIONS = new Set(['.cbz']);
const COMIC_INFO_NAMES = new Set(['comicinfo.xml']);
const CBZ_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const xmlParser = new XMLParser({ ignoreAttributes: false, trimValues: true, parseTagValue: false });

function isCbzFile(fileName) {
  return CBZ_EXTENSIONS.has(path.extname(String(fileName || '')).toLowerCase());
}

function isImageEntry(fileName) {
  return IMAGE_EXTENSIONS.has(path.extname(String(fileName || '')).toLowerCase());
}

function naturalCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function openZipFile(cbzPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(cbzPath, { lazyEntries: true, autoClose: false }, (error, zipFile) => {
      if (error) reject(error);
      else resolve(zipFile);
    });
  });
}

async function withZipFile(cbzPath, callback) {
  const zipFile = await openZipFile(cbzPath);
  try {
    return await callback(zipFile);
  } finally {
    try { zipFile.close(); } catch (_error) {}
  }
}

function normalizeEntryName(entryName) {
  return String(entryName || '').replace(/\\/g, '/');
}

async function collectZipEntries(cbzPath) {
  return withZipFile(cbzPath, (zipFile) => new Promise((resolve, reject) => {
    const entries = [];
    zipFile.on('entry', (entry) => {
      entries.push(entry);
      zipFile.readEntry();
    });
    zipFile.once('error', reject);
    zipFile.once('end', () => resolve(entries));
    zipFile.readEntry();
  }));
}

async function listCbzImageEntries(cbzPath) {
  const entries = await collectZipEntries(cbzPath);
  return entries
    .filter((entry) => !/\/$/.test(entry.fileName || ''))
    .map((entry) => ({
      fileName: normalizeEntryName(entry.fileName),
      uncompressedSize: Number(entry.uncompressedSize || 0),
      compressedSize: Number(entry.compressedSize || 0)
    }))
    .filter((entry) => isImageEntry(entry.fileName))
    .sort((a, b) => naturalCompare(a.fileName, b.fileName));
}

async function readZipEntryBuffer(cbzPath, entryName) {
  const normalizedEntryName = normalizeEntryName(entryName);
  return withZipFile(cbzPath, (zipFile) => new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    zipFile.on('entry', (entry) => {
      if (settled) return;
      const currentName = normalizeEntryName(entry.fileName);
      if (currentName !== normalizedEntryName) {
        zipFile.readEntry();
        return;
      }
      zipFile.openReadStream(entry, (streamError, stream) => {
        if (streamError) {
          fail(streamError);
          return;
        }
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.once('error', fail);
        stream.once('end', () => {
          if (settled) return;
          settled = true;
          resolve(Buffer.concat(chunks));
        });
      });
    });

    zipFile.once('error', fail);
    zipFile.once('end', () => {
      if (!settled) fail(new Error(`Archive entry not found: ${normalizedEntryName}`));
    });
    zipFile.readEntry();
  }));
}

function getArchiveVersionToken(cbzPath) {
  try {
    const stats = fs.statSync(cbzPath);
    return `${Math.floor(Number(stats.mtimeMs || 0))}-${Number(stats.size || 0)}`;
  } catch (_error) {
    return '0-0';
  }
}

function cacheKeyForEntry(cbzPath, entryName) {
  const versionToken = getArchiveVersionToken(cbzPath);
  return crypto
    .createHash('sha1')
    .update(`${cbzPath}::${entryName}::${versionToken}`)
    .digest('hex');
}

function getCachedEntryPath(cbzPath, entryName) {
  const ext = path.extname(String(entryName || '')).toLowerCase() || '.img';
  return path.join(getCbzCacheDir(), `${cacheKeyForEntry(cbzPath, entryName)}${ext}`);
}

function touchFile(filePath) {
  const now = new Date();
  try {
    fs.utimesSync(filePath, now, now);
  } catch (_error) {
    // noop
  }
}

function enforceCbzCacheLimit(maxBytes = CBZ_CACHE_MAX_BYTES) {
  const cacheDir = getCbzCacheDir();
  let entries = [];
  try {
    entries = fs.readdirSync(cacheDir)
      .map((fileName) => {
        const fullPath = path.join(cacheDir, fileName);
        try {
          const stats = fs.statSync(fullPath);
          return stats.isFile()
            ? { path: fullPath, size: Number(stats.size || 0), mtimeMs: Number(stats.mtimeMs || 0) }
            : null;
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.mtimeMs - b.mtimeMs);
  } catch (_error) {
    return;
  }

  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  while (totalBytes > maxBytes && entries.length > 0) {
    const oldest = entries.shift();
    try {
      fs.unlinkSync(oldest.path);
      totalBytes -= oldest.size;
    } catch (_error) {
      // noop
    }
  }
}

async function ensureCbzEntryCached(cbzPath, entryName) {
  const cachedPath = getCachedEntryPath(cbzPath, entryName);
  if (fs.existsSync(cachedPath)) {
    touchFile(cachedPath);
    return cachedPath;
  }

  const buffer = await readZipEntryBuffer(cbzPath, entryName);
  fs.writeFileSync(cachedPath, buffer);
  touchFile(cachedPath);
  enforceCbzCacheLimit();
  return cachedPath;
}

function clearCbzCache() {
  const cacheDir = getCbzCacheDir();
  if (!fs.existsSync(cacheDir)) return;
  for (const fileName of fs.readdirSync(cacheDir)) {
    try {
      fs.unlinkSync(path.join(cacheDir, fileName));
    } catch (_error) {
      // noop
    }
  }
}

function guessContentType(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    case '.avif': return 'image/avif';
    case '.svg': return 'image/svg+xml';
    case '.tif':
    case '.tiff': return 'image/tiff';
    default: return 'application/octet-stream';
  }
}

function splitTagString(value) {
  return String(value || '')
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function pickFirstString(...values) {
  for (const value of values) {
    const next = String(value || '').trim();
    if (next) return next;
  }
  return '';
}

function normalizeComicInfoRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const series = pickFirstString(record.Series, record.series);
  const title = pickFirstString(record.Title, record.title, series);
  const number = pickFirstString(record.Number, record.number);
  const volume = pickFirstString(record.Volume, record.volume);
  const summary = pickFirstString(record.Summary, record.summary, record.Notes, record.notes);
  const writer = pickFirstString(record.Writer, record.writer);
  const artist = pickFirstString(record.Penciller, record.Artist, record.Inker, record.artist);
  const year = pickFirstString(record.Year, record.year);
  const tags = [
    ...splitTagString(record.Genre),
    ...splitTagString(record.Tags),
    ...splitTagString(record.genre),
    ...splitTagString(record.tags)
  ];
  const dedupTags = [...new Map(tags.map((tag) => [tag.toLowerCase(), tag])).values()];

  if (!title && !series && !summary && !writer && !artist && !year && dedupTags.length === 0) {
    return null;
  }

  return {
    title,
    series,
    number,
    volume,
    summary,
    writer,
    artist,
    year,
    tags: dedupTags,
    raw: record
  };
}

function parseComicInfoXml(xmlString) {
  if (!xmlString) return null;
  try {
    const parsed = xmlParser.parse(xmlString);
    const root = parsed?.ComicInfo || parsed?.comicinfo || parsed;
    return normalizeComicInfoRecord(root);
  } catch (_error) {
    return null;
  }
}

async function extractComicInfoFromCbz(cbzPath) {
  const entries = await collectZipEntries(cbzPath);
  const match = entries.find((entry) => COMIC_INFO_NAMES.has(path.basename(String(entry.fileName || '')).toLowerCase()));
  if (!match) return null;
  const xmlBuffer = await readZipEntryBuffer(cbzPath, match.fileName);
  return parseComicInfoXml(xmlBuffer.toString('utf-8'));
}

function findComicInfoSidecarCandidates(sourcePath) {
  if (!sourcePath) return [];
  const candidates = [];
  try {
    const stats = fs.statSync(sourcePath);
    if (stats.isDirectory()) {
      candidates.push(path.join(sourcePath, 'ComicInfo.xml'));
    } else {
      const directory = path.dirname(sourcePath);
      const baseName = path.basename(sourcePath, path.extname(sourcePath));
      candidates.push(path.join(directory, 'ComicInfo.xml'));
      candidates.push(path.join(directory, `${baseName}.ComicInfo.xml`));
    }
  } catch (_error) {
    return [];
  }
  return [...new Set(candidates)];
}

function readComicInfoSidecar(sourcePath) {
  for (const candidate of findComicInfoSidecarCandidates(sourcePath)) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const xml = fs.readFileSync(candidate, 'utf-8');
      const parsed = parseComicInfoXml(xml);
      if (parsed) {
        return {
          ...parsed,
          sidecarPath: candidate
        };
      }
    } catch (_error) {
      // noop
    }
  }
  return null;
}

async function loadComicInfoForSource(sourcePath) {
  if (!sourcePath) return null;
  if (isCbzFile(sourcePath)) {
    try {
      return await extractComicInfoFromCbz(sourcePath);
    } catch (_error) {
      return null;
    }
  }
  return readComicInfoSidecar(sourcePath);
}

async function createCbzAssetResponse(cbzPath, entryName) {
  const cachedPath = await ensureCbzEntryCached(cbzPath, entryName);
  const stream = fs.createReadStream(cachedPath);
  return new Response(Readable.toWeb(stream), {
    headers: {
      'content-type': guessContentType(entryName),
      'cache-control': 'public, max-age=31536000, immutable'
    }
  });
}

/* ---- Sync ZIP helpers (for use in synchronous scanner) ---- */

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

function parseZipCentralDirectory(buffer) {
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65536); i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) return [];

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const entries = [];
  let offset = cdOffset;

  for (let i = 0; i < entryCount && offset + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(offset) !== CD_SIG) break;
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf-8', offset + 46, offset + 46 + fileNameLength);
    entries.push({ fileName, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraFieldLength + commentLength;
  }
  return entries;
}

function readZipEntryDataSync(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_SIG) {
    throw new Error('Invalid local file header');
  }
  const localFileNameLength = buffer.readUInt16LE(offset + 26);
  const localExtraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + localFileNameLength + localExtraLength;
  const compressedData = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressedData);
  throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
}

function listCbzImageEntriesSync(cbzPath) {
  try {
    const buffer = fs.readFileSync(cbzPath);
    const entries = parseZipCentralDirectory(buffer);
    return entries
      .filter((entry) => !/\/$/.test(entry.fileName || ''))
      .map((entry) => ({
        fileName: normalizeEntryName(entry.fileName),
        uncompressedSize: entry.uncompressedSize,
        compressedSize: entry.compressedSize
      }))
      .filter((entry) => isImageEntry(entry.fileName))
      .sort((a, b) => naturalCompare(a.fileName, b.fileName))
      .map((entry) => entry.fileName);
  } catch (_) {
    return [];
  }
}

function extractComicInfoFromCbzSync(cbzPath) {
  try {
    const buffer = fs.readFileSync(cbzPath);
    const entries = parseZipCentralDirectory(buffer);
    const match = entries.find((entry) => COMIC_INFO_NAMES.has(path.basename(String(entry.fileName || '')).toLowerCase()));
    if (!match) return null;
    const xmlBuffer = readZipEntryDataSync(buffer, match);
    return parseComicInfoXml(xmlBuffer.toString('utf-8'));
  } catch (_) {
    return null;
  }
}

function loadComicInfoForSourceSync(sourcePath) {
  if (!sourcePath) return null;
  if (isCbzFile(sourcePath)) return extractComicInfoFromCbzSync(sourcePath);
  return readComicInfoSidecar(sourcePath);
}

module.exports = {
  CBZ_CACHE_MAX_BYTES,
  isCbzFile,
  listCbzImageEntries,
  listCbzImageEntriesSync,
  readZipEntryBuffer,
  ensureCbzEntryCached,
  clearCbzCache,
  createCbzAssetResponse,
  loadComicInfoForSource,
  loadComicInfoForSourceSync,
  readComicInfoSidecar,
  extractComicInfoFromCbz,
  parseComicInfoXml,
  getArchiveVersionToken
};
