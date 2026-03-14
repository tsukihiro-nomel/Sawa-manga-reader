/**
 * Sawa Manga Library v2.0.0 — Reader Utilities
 */

export function sortMangas(mangas, sortKey) {
  const list = [...mangas];
  switch (sortKey) {
    case 'title-desc':
      return list.sort((a, b) => b.displayTitle.localeCompare(a.displayTitle, undefined, { numeric: true }));
    case 'recent':
      return list.sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime());
    case 'chapters-desc':
      return list.sort((a, b) => b.chapterCount - a.chapterCount);
    case 'pages-desc':
      return list.sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0));
    case 'favorites':
      return list.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
    case 'added-recent':
      return list.sort((a, b) => new Date(b.addedAt || b.modifiedAt || 0).getTime() - new Date(a.addedAt || a.modifiedAt || 0).getTime());
    case 'added-oldest':
      return list.sort((a, b) => new Date(a.addedAt || a.modifiedAt || 0).getTime() - new Date(b.addedAt || b.modifiedAt || 0).getTime());
    case 'progress-desc':
      return list.sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0));
    case 'progress-asc':
      return list.sort((a, b) => (a.progressPercent || 0) - (b.progressPercent || 0));
    case 'updated-recent':
      return list.sort((a, b) => new Date(b.modifiedAt || 0).getTime() - new Date(a.modifiedAt || 0).getTime());
    case 'title-asc':
    default:
      return list.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle, undefined, { numeric: true }));
  }
}

export function buildDoubleSpreadRanges(pageCount) {
  if (pageCount <= 0) return [];
  const ranges = [{ start: 0, end: 0 }];
  for (let index = 1; index < pageCount; index += 2) {
    ranges.push({ start: index, end: Math.min(index + 1, pageCount - 1) });
  }
  return ranges;
}

export function buildMangaJPSpreadRanges(pageCount) {
  if (pageCount <= 0) return [];
  // Manga JP: first page alone (cover), then pairs in right-to-left order
  const ranges = [{ start: 0, end: 0, isRTL: false }];
  for (let index = 1; index < pageCount; index += 2) {
    const end = Math.min(index + 1, pageCount - 1);
    // In manga JP, the right page comes first visually (higher index)
    ranges.push({ start: index, end, isRTL: true });
  }
  return ranges;
}

export function getProgressPercent(progress) {
  if (!progress || typeof progress.pageIndex !== 'number' || !progress.pageCount) return 0;
  return Math.max(0, Math.min(100, Math.round(((progress.pageIndex + 1) / progress.pageCount) * 100)));
}

export function filterMangas(mangas, filters = {}) {
  let result = mangas;

  if (filters.readStatus && filters.readStatus !== 'all') {
    result = result.filter((m) => {
      const state = m.readingState || (m.isRead ? 'read' : m.progressPercent > 0 ? 'in-progress' : 'never');
      switch (filters.readStatus) {
        case 'unread': return state === 'never';
        case 'in-progress': return state === 'in-progress' || state === 'to-resume';
        case 'read': return state === 'read';
        default: return true;
      }
    });
  }

  if (filters.favoriteOnly) {
    result = result.filter((m) => m.isFavorite);
  }

  if (filters.hasDescription === true) {
    result = result.filter((m) => m.description && m.description.trim().length > 0);
  } else if (filters.hasDescription === false) {
    result = result.filter((m) => !m.description || m.description.trim().length === 0);
  }

  if (filters.hasCustomCover === true) {
    result = result.filter((m) => m.coverType === 'custom');
  } else if (filters.hasCustomCover === false) {
    result = result.filter((m) => m.coverType !== 'custom');
  }

  if (Array.isArray(filters.tags) && filters.tags.length > 0) {
    const tagSet = new Set(filters.tags);
    result = result.filter((m) => {
      const mTags = Array.isArray(m.tags) ? m.tags.map((t) => t.id) : [];
      return mTags.some((t) => tagSet.has(t));
    });
  }

  if (Array.isArray(filters.collections) && filters.collections.length > 0) {
    const colSet = new Set(filters.collections);
    result = result.filter((m) => {
      const mCols = Array.isArray(m.collectionIds) ? m.collectionIds : [];
      return mCols.some((c) => colSet.has(c));
    });
  }

  return result;
}

export function searchMangas(mangas, query) {
  if (!query || !query.trim()) return mangas;
  const lowered = query.trim().toLowerCase();
  return mangas.filter((manga) => {
    const fields = [
      manga.displayTitle,
      manga.author,
      manga.description,
      manga.name,
      ...(Array.isArray(manga.aliases) ? manga.aliases : []),
      ...(Array.isArray(manga.tags) ? manga.tags.map((t) => t.name) : []),
    ];
    const haystack = fields.filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(lowered);
  });
}

export function resolveSmartCollection(allMangas, smartId, persisted = {}) {
  const now = Date.now();
  const dayMs = 86400000;

  switch (smartId) {
    case 'smart-continue': {
      return allMangas.filter((m) => {
        const state = m.readingState || (m.progressPercent > 0 && !m.isRead ? 'in-progress' : null);
        return state === 'in-progress' || state === 'to-resume';
      }).sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime());
    }
    case 'smart-unread':
      return allMangas.filter((m) => !m.isRead && (!m.progressPercent || m.progressPercent === 0));
    case 'smart-in-progress':
      return allMangas.filter((m) => m.progressPercent > 0 && !m.isRead);
    case 'smart-completed':
      return allMangas.filter((m) => m.isRead);
    case 'smart-favorites':
      return allMangas.filter((m) => m.isFavorite);
    case 'smart-recent-added':
      return allMangas
        .filter((m) => m.addedAt && (now - new Date(m.addedAt).getTime()) < 30 * dayMs)
        .sort((a, b) => new Date(b.addedAt || 0).getTime() - new Date(a.addedAt || 0).getTime());
    case 'smart-recent-read':
      return allMangas
        .filter((m) => m.lastReadAt && (now - new Date(m.lastReadAt).getTime()) < 14 * dayMs)
        .sort((a, b) => new Date(b.lastReadAt || 0).getTime() - new Date(a.lastReadAt || 0).getTime());
    case 'smart-new-chapters':
      return allMangas.filter((m) => m.hasNewChapters);
    case 'smart-no-cover':
      return allMangas.filter((m) => m.coverType === 'default' || !m.coverSrc);
    case 'smart-no-metadata':
      return allMangas.filter((m) => (!m.author || !m.author.trim()) && (!m.description || !m.description.trim()));
    default:
      return [];
  }
}

export function buildMangaAggregate(manga) {
  const chapters = Array.isArray(manga?.chapters) ? manga.chapters : [];
  const completedChapterCount = chapters.filter((ch) => ch.isRead).length;
  const progressUnits = chapters.reduce((sum, ch) => {
    if (ch.isRead) return sum + 1;
    if (ch.progress?.pageCount) {
      return sum + Math.max(0, Math.min(1, (ch.progress.pageIndex + 1) / ch.progress.pageCount));
    }
    return sum;
  }, 0);
  const progressPercent = chapters.length
    ? Math.max(0, Math.min(100, Math.round((progressUnits / chapters.length) * 100)))
    : 0;

  let readingState = 'never';
  if (chapters.length > 0 && completedChapterCount === chapters.length) {
    readingState = 'read';
  } else if (progressPercent > 0) {
    readingState = 'in-progress';
  }

  return {
    ...manga,
    completedChapterCount,
    progressPercent,
    isRead: chapters.length > 0 && completedChapterCount === chapters.length,
    readingState,
    progress: {
      percent: progressPercent,
      completedChapterCount,
      totalChapterCount: chapters.length,
      lastChapterId: manga?.lastProgress?.chapterId ?? null
    }
  };
}
