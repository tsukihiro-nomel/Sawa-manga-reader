export const DASHBOARD_BLOCK_ORDER = Object.freeze([
  'hero',
  'stats',
  'quick-actions',
  'continue-reading',
  'recently-resumed',
  'recently-added',
  'new-chapters',
  'favorites',
  'completed'
]);

function uniqueIds(values = []) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const id = String(value?.id ?? value ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(id);
  });
  return result;
}

function orderedDashboardBlocks(savedOrder = []) {
  const known = new Set(DASHBOARD_BLOCK_ORDER);
  const normalized = Array.isArray(savedOrder)
    ? savedOrder.filter((id) => known.has(id))
    : [];
  return [
    ...normalized,
    ...DASHBOARD_BLOCK_ORDER.filter((id) => !normalized.includes(id))
  ];
}

export function buildDashboardSelectionModel({
  allMangas = [],
  favorites = [],
  persisted = {},
  ui = {}
} = {}) {
  const continueReading = [...allMangas]
    .filter((manga) => Number(manga?.progressPercent ?? 0) > 0 && !manga?.isRead)
    .sort((a, b) => new Date(b?.lastReadAt || 0).getTime() - new Date(a?.lastReadAt || 0).getTime());
  const recentlyAdded = [...allMangas]
    .filter((manga) => manga?.addedAt)
    .sort((a, b) => new Date(b?.addedAt || 0).getTime() - new Date(a?.addedAt || 0).getTime());
  const newChapters = allMangas.filter((manga) => manga?.hasNewChapters);
  const completed = allMangas.filter((manga) => manga?.isRead);
  const mangaById = new Map(allMangas.map((manga) => [manga.id, manga]));
  const resumedIds = new Set();
  const recentlyResumed = [];
  (Array.isArray(persisted?.recents) ? persisted.recents : []).forEach((entry) => {
    if (!entry?.mangaId || resumedIds.has(entry.mangaId)) return;
    const manga = mangaById.get(entry.mangaId);
    if (!manga) return;
    resumedIds.add(entry.mangaId);
    recentlyResumed.push({
      ...manga,
      resumeChapterId: entry.chapterId,
      resumePageIndex: entry.pageIndex ?? 0
    });
  });

  const sectionMangas = {
    'continue-reading': continueReading,
    'recently-resumed': recentlyResumed.slice(0, 12),
    'recently-added': recentlyAdded.slice(0, 12),
    'new-chapters': newChapters,
    favorites,
    completed
  };
  const orderedBlocks = orderedDashboardBlocks(ui?.dashboardLayout);
  const hiddenBlocks = ui?.dashboardHiddenSections || {};
  const visibleBlocks = orderedBlocks.filter((blockId) => !hiddenBlocks[blockId]);
  const visibleIds = uniqueIds(visibleBlocks.flatMap((blockId) => sectionMangas[blockId] || []));

  return {
    orderedBlocks,
    visibleBlocks,
    hiddenBlocks: orderedBlocks.filter((blockId) => hiddenBlocks[blockId]),
    sectionMangas,
    visibleIds
  };
}

export function resolveVisibleSelectionIds({
  interfaceMode = 'sawa',
  activeViewScreen = 'library',
  activeScreen = 'library',
  filteredMangas = [],
  vaultMangas = [],
  workbenchMangas = [],
  collectionVisibleIds = [],
  dashboardModel = null
} = {}) {
  if (activeViewScreen !== 'library') return [];
  if (activeScreen === 'dashboard') return uniqueIds(dashboardModel?.visibleIds || []);
  if (activeScreen === 'collections') {
    return interfaceMode === 'kavita' ? [] : uniqueIds(collectionVisibleIds);
  }
  if (activeScreen === 'vault') return uniqueIds(vaultMangas);
  if (activeScreen === 'workbench') return uniqueIds(workbenchMangas);
  if (['library', 'favorites', 'recents'].includes(activeScreen)) {
    return uniqueIds(filteredMangas);
  }
  return [];
}

export { orderedDashboardBlocks };
