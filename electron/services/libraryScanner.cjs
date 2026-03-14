/**
 * Sawa Manga Library v2.0.0 — Library Scanner
 *
 * Scans local manga folders and produces a compact index for the renderer.
 * Supports tags, collections, reading states, new-chapter detection,
 * and compact grid summaries.
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif', '.jfif', '.svg', '.tif', '.tiff'
]);

function hashFromString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function makeId(prefix, absolutePath) {
  return `${prefix}_${hashFromString(absolutePath)}`;
}

function toFileSrc(absolutePath) {
  return `manga://local/${encodeURIComponent(absolutePath)}`;
}

function isImageFile(fileName) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function sortNames(list) {
  return [...list].sort(naturalCompare);
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Page helpers                                                       */
/* ------------------------------------------------------------------ */

function makePage(pagePath, index) {
  return {
    id: makeId('page', pagePath),
    name: path.basename(pagePath),
    index,
    path: pagePath,
    src: toFileSrc(pagePath)
  };
}

function scanPageFilePaths(directoryPath) {
  const entries = safeReadDir(directoryPath);
  const fileNames = sortNames(
    entries
      .filter((entry) => entry.isFile() && isImageFile(entry.name))
      .map((entry) => entry.name)
  );
  return fileNames.map((name) => path.join(directoryPath, name));
}

function getChapterPages(chapterPath) {
  return scanPageFilePaths(chapterPath).map((pagePath, index) => makePage(pagePath, index));
}

/* ------------------------------------------------------------------ */
/*  Reading-state derivation                                           */
/* ------------------------------------------------------------------ */

/**
 * Derive a chapter reading state from persisted data.
 * Returns 'never' | 'in-progress' | 'read'
 */
function deriveChapterReadingState(chapterId, persistedState) {
  const explicit = persistedState.chapterStates?.[chapterId];
  if (explicit === 'read') return 'read';
  if (explicit === 'in-progress') return 'in-progress';

  const markedRead = Boolean(persistedState.chapterReadStatus?.[chapterId]);
  if (markedRead) return 'read';

  const progress = persistedState.progress?.[chapterId];
  if (progress && progress.pageCount && progress.pageIndex >= progress.pageCount - 1) return 'read';
  if (progress && progress.pageIndex > 0) return 'in-progress';

  return 'never';
}

/**
 * Derive the manga-level reading state.
 * Returns 'never' | 'in-progress' | 'read' | 'to-resume'
 */
function deriveMangaReadingState(mangaId, chapters, persistedState) {
  // Explicit override from user
  const explicit = persistedState.readingStates?.[mangaId];
  if (explicit === 'to-resume') return 'to-resume';

  if (chapters.length === 0) return 'never';

  const allRead = chapters.every((ch) => ch.readingState === 'read');
  if (allRead) return 'read';

  const anyStarted = chapters.some((ch) => ch.readingState !== 'never');
  if (anyStarted) return 'in-progress';

  if (explicit === 'in-progress') return 'in-progress';

  return 'never';
}

/* ------------------------------------------------------------------ */
/*  Chapter scanning                                                   */
/* ------------------------------------------------------------------ */

function scanChapterSummary(chapterPath, chapterName, persistedState, isOneShot = false) {
  const pagePaths = scanPageFilePaths(chapterPath);
  const chapterId = isOneShot
    ? makeId('chapter', `${chapterPath}::oneshot`)
    : makeId('chapter', chapterPath);
  const progress = persistedState.progress?.[chapterId] ?? null;
  const readingState = deriveChapterReadingState(chapterId, persistedState);
  const isRead = readingState === 'read';

  return {
    id: chapterId,
    name: chapterName,
    path: chapterPath,
    pageCount: pagePaths.length,
    previewSrc: pagePaths[0] ? toFileSrc(pagePaths[0]) : null,
    pages: null,
    progress,
    isRead,
    readingState,
    isOneShot
  };
}

/* ------------------------------------------------------------------ */
/*  Cover helpers                                                      */
/* ------------------------------------------------------------------ */

function resolveCover(metadata, firstPreviewSrc) {
  // Custom cover set by user
  if (metadata.coverPath && fs.existsSync(metadata.coverPath)) {
    return { coverSrc: toFileSrc(metadata.coverPath), coverType: 'custom' };
  }

  // Auto-detected from first chapter preview
  if (firstPreviewSrc) {
    return { coverSrc: firstPreviewSrc, coverType: 'auto' };
  }

  return { coverSrc: null, coverType: 'default' };
}

/* ------------------------------------------------------------------ */
/*  Tag & collection resolution                                        */
/* ------------------------------------------------------------------ */

function resolveTagsForManga(mangaId, persistedState) {
  const tagIds = persistedState.mangaTags?.[mangaId] || [];
  const allTags = persistedState.tags || {};
  return tagIds
    .map((tid) => allTags[tid])
    .filter(Boolean);
}

function resolveCollectionIdsForManga(mangaId, persistedState) {
  const collections = persistedState.collections || {};
  const ids = [];
  for (const [colId, col] of Object.entries(collections)) {
    if (Array.isArray(col.mangaIds) && col.mangaIds.includes(mangaId)) {
      ids.push(colId);
    }
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/*  Manga scanning                                                     */
/* ------------------------------------------------------------------ */

function scanManga(mangaPath, persistedState) {
  const mangaName = path.basename(mangaPath);
  const entries = safeReadDir(mangaPath);

  let stats = null;
  try {
    stats = fs.statSync(mangaPath);
  } catch (error) {
    stats = null;
  }

  const childDirs = sortNames(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  );
  const mangaId = makeId('manga', mangaPath);
  const metadata = persistedState.metadata?.[mangaId] ?? {};
  const isFavorite = Boolean(persistedState.favorites?.[mangaId]);

  /* --- Build chapters ------------------------------------------------ */
  let chapters = [];

  if (childDirs.length === 0) {
    // One-shot: images directly inside the manga folder
    chapters = [scanChapterSummary(mangaPath, 'Chapitre unique', persistedState, true)];
  } else {
    chapters = childDirs.map((dirName) =>
      scanChapterSummary(path.join(mangaPath, dirName), dirName, persistedState, false)
    );
  }

  /* --- Progress aggregation ------------------------------------------ */
  const chapterProgressEntries = chapters
    .map((ch) => ch.progress)
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime());

  const lastProgress = chapterProgressEntries[0] ?? null;
  const completedChapterCount = chapters.filter((ch) => ch.isRead).length;

  const progressUnits = chapters.reduce((sum, ch) => {
    if (ch.isRead) return sum + 1;
    if (ch.progress?.pageCount) {
      const ratio = Math.max(0, Math.min(1, (ch.progress.pageIndex + 1) / ch.progress.pageCount));
      return sum + ratio;
    }
    return sum;
  }, 0);

  const progressPercent = chapters.length
    ? Math.max(0, Math.min(100, Math.round((progressUnits / chapters.length) * 100)))
    : 0;

  const isRead = chapters.length > 0 && completedChapterCount === chapters.length;

  /* --- Reading state ------------------------------------------------- */
  const readingState = deriveMangaReadingState(mangaId, chapters, persistedState);

  /* --- Cover (hierarchy: user custom > online > auto-detect) --------- */
  let resolvedCover;
  if (metadata.coverPath && fs.existsSync(metadata.coverPath)) {
    resolvedCover = { coverSrc: toFileSrc(metadata.coverPath), coverType: 'custom' };
  } else if (metadata.onlineCoverPath && fs.existsSync(metadata.onlineCoverPath)) {
    resolvedCover = { coverSrc: toFileSrc(metadata.onlineCoverPath), coverType: 'online' };
  } else {
    resolvedCover = resolveCover(metadata, chapters[0]?.previewSrc ?? null);
  }
  const { coverSrc, coverType } = resolvedCover;

  /* --- Tags & collections -------------------------------------------- */
  const tags = resolveTagsForManga(mangaId, persistedState);
  const collectionIds = resolveCollectionIdsForManga(mangaId, persistedState);

  /* --- New-chapter detection ----------------------------------------- */
  const knownCount = persistedState.knownChapterCounts?.[mangaId];
  const hasNewChapters = typeof knownCount === 'number' && chapters.length > knownCount;

  /* --- Timestamps ---------------------------------------------------- */
  const addedAt = stats?.birthtime?.toISOString?.() || stats?.ctime?.toISOString?.() || null;
  const modifiedAt = stats?.mtime?.toISOString?.() || null;

  return {
    id: mangaId,
    name: mangaName,
    displayTitle: metadata.title?.trim() || metadata.onlineTitle?.trim() || mangaName,
    author: metadata.author?.trim() || metadata.onlineAuthor?.trim() || '',
    description: metadata.description?.trim() || metadata.onlineDescription?.trim() || '',
    path: mangaPath,
    chapterCount: chapters.length,
    completedChapterCount,
    progressPercent,
    pageCount: chapters.reduce((sum, ch) => sum + ch.pageCount, 0),
    coverSrc,
    coverType,
    isFavorite,
    isRead,
    readingState,
    chapters,
    progress: {
      percent: progressPercent,
      completedChapterCount,
      totalChapterCount: chapters.length,
      lastChapterId: lastProgress?.chapterId ?? null
    },
    lastProgress,
    lastReadAt: lastProgress?.lastReadAt ?? null,
    addedAt,
    modifiedAt,
    categoryId: null,
    categoryName: null,
    categoryHidden: false,
    tags,
    collectionIds,
    hasNewChapters
  };
}

/* ------------------------------------------------------------------ */
/*  Library scan                                                       */
/* ------------------------------------------------------------------ */

function scanLibrary(persistedState) {
  const categories = (persistedState.categories || []).map((categoryRecord) => {
    const exists = fs.existsSync(categoryRecord.path);
    const entries = exists ? safeReadDir(categoryRecord.path) : [];
    const mangaDirs = sortNames(
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    );
    const mangas = mangaDirs.map((dirName) =>
      scanManga(path.join(categoryRecord.path, dirName), persistedState)
    );

    return {
      id: categoryRecord.id,
      name: categoryRecord.name,
      path: categoryRecord.path,
      hidden: Boolean(categoryRecord.hidden),
      exists,
      mangaCount: mangas.length,
      mangas
    };
  });

  const allMangas = categories.flatMap((category) =>
    category.mangas.map((manga) => ({
      ...manga,
      categoryId: category.id,
      categoryName: category.name,
      categoryHidden: category.hidden
    }))
  );

  const favorites = allMangas.filter((manga) => manga.isFavorite);

  const recents = [...(persistedState.recents || [])]
    .sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime())
    .slice(0, 20)
    .map((recent) => {
      const manga = allMangas.find((item) => item.id === recent.mangaId);
      if (!manga) return null;
      const chapter = manga.chapters.find((item) => item.id === recent.chapterId);
      if (!chapter) return null;
      return {
        ...recent,
        mangaTitle: manga.displayTitle,
        mangaCoverSrc: manga.coverSrc,
        chapterName: chapter.name,
        categoryName: manga.categoryName
      };
    })
    .filter(Boolean);

  return {
    categories,
    allMangas,
    favorites,
    recents
  };
}

/* ------------------------------------------------------------------ */
/*  Compact index for the grid                                         */
/* ------------------------------------------------------------------ */

function buildCompactIndex(library) {
  return (library.allMangas || []).map((manga) => ({
    id: manga.id,
    displayTitle: manga.displayTitle,
    author: manga.author,
    coverSrc: manga.coverSrc,
    coverType: manga.coverType,
    isFavorite: manga.isFavorite,
    isRead: manga.isRead,
    readingState: manga.readingState,
    progressPercent: manga.progressPercent,
    chapterCount: manga.chapterCount,
    completedChapterCount: manga.completedChapterCount,
    categoryId: manga.categoryId,
    categoryName: manga.categoryName,
    tags: manga.tags,
    collectionIds: manga.collectionIds,
    hasNewChapters: manga.hasNewChapters,
    addedAt: manga.addedAt,
    lastReadAt: manga.lastReadAt
  }));
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

module.exports = {
  scanLibrary,
  getChapterPages,
  makeId,
  toFileSrc,
  isImageFile,
  buildCompactIndex
};
