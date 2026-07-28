function overlayOrganizationOnManga(manga, persisted) {
  if (!manga?.id) return manga;
  const tagIds = persisted.mangaTags?.[manga.id] || [];
  const collectionIds = Object.entries(persisted.collections || {})
    .filter(([, collection]) => (collection?.mangaIds || []).includes(manga.id))
    .map(([collectionId]) => collectionId);
  return {
    ...manga,
    isFavorite: Boolean(persisted.favorites?.[manga.id]),
    tags: tagIds.map((tagId) => persisted.tags?.[tagId]).filter(Boolean),
    collectionIds
  };
}

function overlayOrganizationOnLibrary(library, persisted) {
  if (!library || !Array.isArray(library.allMangas)) return library;
  const allMangas = library.allMangas.map((manga) => overlayOrganizationOnManga(manga, persisted));
  const byId = new Map(allMangas.map((manga) => [manga.id, manga]));
  return {
    ...library,
    allMangas,
    favorites: allMangas.filter((manga) => manga.isFavorite),
    categories: (library.categories || []).map((category) => ({
      ...category,
      mangas: (category.mangas || []).map((manga) => byId.get(manga.id) || overlayOrganizationOnManga(manga, persisted))
    }))
  };
}

export function mergeIdentityPatchIntoPayload(previousPayload, result) {
  if (!previousPayload || !result?.ok || !result?.patch || typeof result.patch !== 'object') {
    return previousPayload;
  }
  if (Number(result.revision || 0) < Number(previousPayload.stateRevision || 0)) {
    return previousPayload;
  }
  const persisted = {
    ...(previousPayload.persisted || {}),
    ...result.patch
  };
  return {
    ...previousPayload,
    stateRevision: Math.max(
      Number(previousPayload.stateRevision || 0),
      Number(result.revision || 0)
    ),
    persisted,
    library: overlayOrganizationOnLibrary(previousPayload.library, persisted),
    vaultLibrary: overlayOrganizationOnLibrary(previousPayload.vaultLibrary, persisted)
  };
}
