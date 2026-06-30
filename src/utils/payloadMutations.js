function references(entity = {}) {
  return [entity.id, entity.contentId, entity.locationId, entity.legacyId]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function matchesReference(entity, reference) {
  const needle = String(reference || '').trim();
  return Boolean(needle) && references(entity).includes(needle);
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function updateLibraryManga(library, mangaReference, update) {
  if (!library || !Array.isArray(library.allMangas)) return { library, manga: null };
  let updatedManga = null;
  const allMangas = library.allMangas.map((manga) => {
    if (!matchesReference(manga, mangaReference)) return manga;
    updatedManga = update(manga);
    return updatedManga;
  });
  if (!updatedManga) return { library, manga: null };

  const categories = (library.categories || []).map((category) => {
    let changed = false;
    const mangas = (category.mangas || []).map((manga) => {
      if (!matchesReference(manga, mangaReference)) return manga;
      changed = true;
      return updatedManga;
    });
    return changed ? { ...category, mangas } : category;
  });

  return {
    manga: updatedManga,
    library: {
      ...library,
      allMangas,
      categories,
      favorites: allMangas.filter((manga) => manga.isFavorite)
    }
  };
}

function updatePayloadManga(payload, mangaReference, update) {
  if (!payload) return payload;
  const publicResult = updateLibraryManga(payload.library, mangaReference, update);
  const vaultResult = updateLibraryManga(payload.vaultLibrary, mangaReference, update);
  return {
    ...payload,
    library: publicResult.library,
    vaultLibrary: vaultResult.library,
    targetManga: publicResult.manga || vaultResult.manga || null
  };
}

function withoutMutationMetadata(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'targetManga')) return payload;
  const { targetManga: _targetManga, ...clean } = payload;
  return clean;
}

function updatePersisted(payload, patch) {
  return {
    ...payload,
    persisted: {
      ...(payload.persisted || {}),
      ...patch
    }
  };
}

function recomputeMangaProgress(manga, chapters) {
  const completedChapterCount = chapters.filter((chapter) => chapter.isRead).length;
  const progressUnits = chapters.reduce((sum, chapter) => {
    if (chapter.isRead) return sum + 1;
    const pageIndex = Number(chapter.progress?.pageIndex || 0);
    const pageCount = Number(chapter.progress?.pageCount || chapter.pageCount || 0);
    return pageIndex > 0 && pageCount > 0 ? sum + Math.min(1, (pageIndex + 1) / pageCount) : sum;
  }, 0);
  const progressPercent = chapters.length > 0
    ? Math.max(0, Math.min(100, Math.round((progressUnits / chapters.length) * 100)))
    : 0;
  const isRead = chapters.length > 0 && completedChapterCount === chapters.length;
  const readingState = isRead ? 'read' : progressPercent > 0 ? 'in-progress' : 'never';
  return {
    ...manga,
    chapters,
    chapterCount: chapters.length || manga.chapterCount || 0,
    completedChapterCount,
    progressPercent,
    isRead,
    readingState,
    progress: {
      percent: progressPercent,
      completedChapterCount,
      totalChapterCount: chapters.length,
      lastChapterId: manga.progress?.lastChapterId || null
    }
  };
}

export function applyFavoriteMutation(payload, mangaReference, isFavorite) {
  const changed = updatePayloadManga(payload, mangaReference, (manga) => ({ ...manga, isFavorite: Boolean(isFavorite) }));
  const mangaId = changed.targetManga?.id;
  if (!mangaId) return withoutMutationMetadata(changed);
  const favorites = { ...(changed.persisted?.favorites || {}) };
  if (isFavorite) favorites[mangaId] = true;
  else delete favorites[mangaId];
  return withoutMutationMetadata(updatePersisted(changed, { favorites }));
}

export function applyTagMutation(payload, mangaReference, tagId, isAssigned) {
  const tag = payload?.persisted?.tags?.[tagId] || null;
  const changed = updatePayloadManga(payload, mangaReference, (manga) => {
    const tagIds = unique([...(manga.tagIds || manga.tags?.map((entry) => entry.id) || [])]);
    const nextIds = isAssigned ? unique([...tagIds, tagId]) : tagIds.filter((id) => id !== tagId);
    const tagsById = new Map((manga.tags || []).map((entry) => [entry.id, entry]));
    if (tag) tagsById.set(tagId, tag);
    return {
      ...manga,
      tagIds: nextIds,
      tags: nextIds.map((id) => tagsById.get(id) || payload?.persisted?.tags?.[id]).filter(Boolean)
    };
  });
  const mangaId = changed.targetManga?.id;
  if (!mangaId) return withoutMutationMetadata(changed);
  return withoutMutationMetadata(updatePersisted(changed, {
    mangaTags: {
      ...(changed.persisted?.mangaTags || {}),
      [mangaId]: changed.targetManga.tagIds
    }
  }));
}

export function applyCollectionMutation(payload, mangaReference, collectionId, isAssigned) {
  const changed = updatePayloadManga(payload, mangaReference, (manga) => {
    const current = unique(manga.collectionIds || []);
    return {
      ...manga,
      collectionIds: isAssigned ? unique([...current, collectionId]) : current.filter((id) => id !== collectionId)
    };
  });
  const mangaId = changed.targetManga?.id;
  const collection = changed.persisted?.collections?.[collectionId];
  if (!mangaId || !collection) return withoutMutationMetadata(changed);
  const currentIds = unique(collection.mangaIds || []);
  const mangaIds = isAssigned ? unique([...currentIds, mangaId]) : currentIds.filter((id) => id !== mangaId);
  return withoutMutationMetadata(updatePersisted(changed, {
    collections: {
      ...(changed.persisted?.collections || {}),
      [collectionId]: { ...collection, mangaIds }
    }
  }));
}

export function applyChapterReadMutation(payload, mangaReference, chapterId, isRead, pageCount = 0) {
  return withoutMutationMetadata(updatePayloadManga(payload, mangaReference, (manga) => {
    const chapters = (manga.chapters || []).map((chapter) => {
      if (!matchesReference(chapter, chapterId)) return chapter;
      const resolvedPageCount = Math.max(0, Number(pageCount || chapter.pageCount || 0));
      return {
        ...chapter,
        isRead: Boolean(isRead),
        readingState: isRead ? 'read' : 'never',
        progress: isRead
          ? { ...(chapter.progress || {}), mangaId: manga.id, chapterId: chapter.id, pageIndex: Math.max(0, resolvedPageCount - 1), pageCount: resolvedPageCount }
          : null
      };
    });
    return recomputeMangaProgress(manga, chapters);
  }));
}

export function applyMangaReadMutation(payload, mangaReference, isRead, chapterIds = []) {
  const targets = new Set(unique(chapterIds));
  return withoutMutationMetadata(updatePayloadManga(payload, mangaReference, (manga) => {
    const chapters = (manga.chapters || []).map((chapter) => {
      if (targets.size > 0 && !references(chapter).some((reference) => targets.has(reference))) return chapter;
      const pageCount = Math.max(0, Number(chapter.pageCount || chapter.progress?.pageCount || 0));
      return {
        ...chapter,
        isRead: Boolean(isRead),
        readingState: isRead ? 'read' : 'never',
        progress: isRead
          ? { ...(chapter.progress || {}), mangaId: manga.id, chapterId: chapter.id, pageIndex: Math.max(0, pageCount - 1), pageCount }
          : null
      };
    });
    const recomputed = recomputeMangaProgress(manga, chapters);
    return targets.size === 0
      ? { ...recomputed, isRead: Boolean(isRead), readingState: isRead ? 'read' : 'never', progressPercent: isRead ? 100 : 0 }
      : recomputed;
  }));
}
