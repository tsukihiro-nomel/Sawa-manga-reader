const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isMainThread, parentPort, workerData, Worker } = require('worker_threads');

const PAGE_EXTENSIONS = new Set([
  '.avif', '.bmp', '.gif', '.heic', '.heif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp'
]);

async function mapLimit(values, concurrency, mapper) {
  const items = Array.isArray(values) ? values : [];
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, Number(concurrency) || 1), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index], index);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

function digestStrongParts(parts) {
  const hash = crypto.createHash('sha256');
  for (const part of parts) {
    hash.update(String(part || ''));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

async function hashFileStreaming(filePath) {
  const normalizedPath = String(filePath || '').trim();
  if (!normalizedPath) return null;
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(normalizedPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', () => resolve(null));
    stream.once('end', () => resolve(`sha256:${hash.digest('hex')}`));
  });
}

async function listPageFiles(rootPath) {
  const files = [];
  async function visit(currentPath, relativeRoot = '') {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile() && PAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push({ absolutePath, relativePath });
      }
    }
  }
  await visit(rootPath);
  return files;
}

function mediaIssue(chapter, failedPath, reason, code = null) {
  return {
    type: 'identity-media-unreadable',
    severity: 'warning',
    chapterId: String(chapter?.id || chapter?.legacyId || '').trim() || null,
    path: String(chapter?.path || chapter?.filePath || '').trim() || null,
    failedPath: String(failedPath || '').trim() || null,
    reason,
    code: code ? String(code) : null
  };
}

async function hashChapterContent(chapter = {}, options = {}) {
  const hashFile = options.hashFile || hashFileStreaming;
  const discoverPageFiles = options.listPageFiles || listPageFiles;
  const chapterPath = String(chapter.path || chapter.filePath || '').trim();
  let stat = null;
  if (chapterPath) {
    try {
      stat = await fs.promises.stat(chapterPath);
    } catch (error) {
      stat = null;
      if (!Array.isArray(chapter.pages) || chapter.pages.length === 0) {
        return {
          strongFingerprint: null,
          pages: Array.isArray(chapter.pages) ? chapter.pages : [],
          issue: mediaIssue(chapter, chapterPath, 'chapter-path-unavailable', error?.code)
        };
      }
    }
  }

  if (stat?.isFile()) {
    const strongFingerprint = await hashFile(chapterPath);
    return {
      strongFingerprint,
      pages: Array.isArray(chapter.pages) ? chapter.pages : [],
      issue: strongFingerprint
        ? null
        : mediaIssue(chapter, chapterPath, 'chapter-file-unreadable')
    };
  }

  let pageFiles = [];
  if (stat?.isDirectory()) {
    try {
      pageFiles = await discoverPageFiles(chapterPath);
    } catch (error) {
      return {
        strongFingerprint: null,
        pages: Array.isArray(chapter.pages) ? chapter.pages : [],
        issue: mediaIssue(chapter, chapterPath, 'chapter-directory-unreadable', error?.code)
      };
    }
    const expectedPageCount = Math.max(
      Number(chapter.pageCount || 0),
      Array.isArray(chapter.pages) ? chapter.pages.length : 0
    );
    if (expectedPageCount > pageFiles.length) {
      return {
        strongFingerprint: null,
        pages: Array.isArray(chapter.pages) ? chapter.pages : [],
        issue: mediaIssue(chapter, chapterPath, 'chapter-page-set-incomplete')
      };
    }
  } else {
    const expectedPages = Array.isArray(chapter.pages) ? chapter.pages : [];
    pageFiles = expectedPages
      .map((page, index) => ({
        absolutePath: String(page?.path || page?.filePath || '').trim(),
        relativePath: String(page?.name || page?.path || index)
      }));
    const missingPath = pageFiles.find((entry) => !entry.absolutePath);
    if (missingPath) {
      return {
        strongFingerprint: null,
        pages: expectedPages,
        issue: mediaIssue(chapter, null, 'page-path-missing')
      };
    }
  }
  if (!pageFiles.length) {
    return {
      strongFingerprint: null,
      pages: Array.isArray(chapter.pages) ? chapter.pages : [],
      issue: mediaIssue(chapter, chapterPath, 'chapter-has-no-readable-pages')
    };
  }

  const pageHashes = [];
  const pages = [];
  for (const pageFile of pageFiles) {
    const strongFingerprint = await hashFile(pageFile.absolutePath);
    if (!strongFingerprint) {
      return {
        strongFingerprint: null,
        pages: Array.isArray(chapter.pages) ? chapter.pages : [],
        issue: mediaIssue(chapter, pageFile.absolutePath, 'page-unreadable-or-disappeared')
      };
    }
    pageHashes.push(strongFingerprint);
    pages.push({
      path: pageFile.absolutePath,
      name: pageFile.relativePath,
      strongFingerprint
    });
  }
  return {
    strongFingerprint: digestStrongParts(pageHashes),
    pages,
    issue: null
  };
}

async function enrichMangasWithStrongHashes(mangas = [], options = {}) {
  const clones = (Array.isArray(mangas) ? mangas : []).map((manga) => ({
    ...manga,
    chapters: (Array.isArray(manga?.chapters) ? manga.chapters : []).map((chapter) => ({ ...chapter }))
  }));
  const mediaIssues = [];
  const jobs = clones.flatMap((manga) => manga.chapters.map((chapter) => ({ chapter, mangaId: manga.id })));
  await mapLimit(jobs, options.concurrency || 2, async ({ chapter, mangaId }) => {
    const hashed = await hashChapterContent(chapter, options);
    chapter.strongFingerprint = hashed.strongFingerprint;
    chapter.pages = hashed.pages;
    if (hashed.issue) mediaIssues.push({ ...hashed.issue, mangaId });
  });
  return { mangas: clones, mediaIssues };
}

async function runWorker(input = {}) {
  const { analyzeIdentityRecords, buildIdentityRecord } = require('./identityWorks.cjs');
  const privateIds = new Set(input?.privateMangaIds || []);
  const enriched = await enrichMangasWithStrongHashes(input?.mangas || [], { concurrency: 2 });
  const { mangas, mediaIssues } = enriched;
  const currentRecords = Object.fromEntries(mangas.map((manga) => {
    const record = buildIdentityRecord(manga, { private: privateIds.has(manga.id) || manga.isPrivate });
    return [record.mangaId, record];
  }).filter(([id]) => id));
  return {
    ok: true,
    currentRecords,
    mediaIssues,
    analysis: analyzeIdentityRecords(input?.previousRecords || {}, currentRecords)
  };
}

if (!isMainThread) {
  runWorker(workerData)
    .then((result) => parentPort.postMessage(result))
    .catch((error) => {
      parentPort.postMessage({ ok: false, error: error?.message || 'Identity worker failed' });
    });
}

function analyzeIdentityInWorker(input = {}, options = {}) {
  const WorkerClass = options.WorkerClass || Worker;
  const workerPath = options.workerPath || path.join(__dirname, 'identityWorker.cjs');
  return new Promise((resolve, reject) => {
    const worker = new WorkerClass(workerPath, { workerData: input });
    worker.unref?.();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    worker.once('message', (message) => {
      if (message?.ok) finish(resolve, message);
      else finish(reject, new Error(message?.error || 'Identity worker failed'));
    });
    worker.once('error', (error) => finish(reject, error));
    worker.once('exit', (code) => {
      if (code !== 0) finish(reject, new Error(`Identity worker exited with code ${code}`));
    });
  });
}

module.exports = {
  analyzeIdentityInWorker,
  enrichMangasWithStrongHashes,
  hashChapterContent,
  hashFileStreaming,
  mapLimit,
  runWorker
};
