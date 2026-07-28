export function attachWorkGroupMetadata(mangas = [], workGroups = {}) {
  const groupsByEdition = new Map();
  const mangaById = new Map((mangas || []).map((manga) => [manga.id, manga]));
  for (const group of Object.values(workGroups || {})) {
    const editions = (group?.editionIds || []).map((id) => mangaById.get(id)).filter(Boolean);
    if (editions.length < 2) continue;
    const preferredEditionId = editions.some((edition) => edition.id === group.preferredEditionId)
      ? group.preferredEditionId
      : editions
        .sort((left, right) => new Date(right.lastReadAt || 0).getTime() - new Date(left.lastReadAt || 0).getTime())[0].id;
    const metadata = {
      id: group.id,
      title: group.title || mangaById.get(preferredEditionId)?.displayTitle || '',
      editionCount: editions.length,
      preferredEditionId,
      editions: editions.map((edition) => ({
        id: edition.id,
        title: edition.displayTitle,
        path: edition.path,
        lastReadAt: edition.lastReadAt || null
      }))
    };
    editions.forEach((edition) => groupsByEdition.set(edition.id, metadata));
  }
  return (mangas || []).map((manga) => (
    groupsByEdition.has(manga.id) ? { ...manga, workGroup: groupsByEdition.get(manga.id) } : manga
  ));
}

export function projectCanonicalMangas(mangas = [], workGroups = {}) {
  return attachWorkGroupMetadata(mangas, workGroups).filter((manga) => (
    !manga.workGroup || manga.id === manga.workGroup.preferredEditionId
  ));
}
