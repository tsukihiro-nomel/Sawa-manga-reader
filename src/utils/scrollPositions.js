export const MAX_SCROLL_POSITIONS = 256;

export function normalizeScrollPosition(value, previous = null) {
  const fallbackOffset = Number(typeof value === 'number' ? value : value?.fallbackOffset);
  const previousOffset = Number(typeof previous === 'number' ? previous : previous?.fallbackOffset);
  const intraRowOffset = Number(value?.intraRowOffset);
  return {
    anchorId: typeof value?.anchorId === 'string' && value.anchorId
      ? value.anchorId
      : (typeof previous?.anchorId === 'string' ? previous.anchorId : null),
    intraRowOffset: Number.isFinite(intraRowOffset)
      ? intraRowOffset
      : (Number.isFinite(Number(previous?.intraRowOffset)) ? Number(previous.intraRowOffset) : 0),
    fallbackOffset: Math.max(0, Number.isFinite(fallbackOffset)
      ? fallbackOffset
      : (Number.isFinite(previousOffset) ? previousOffset : 0)),
    layoutKey: typeof value?.layoutKey === 'string'
      ? value.layoutKey
      : (typeof previous?.layoutKey === 'string' ? previous.layoutKey : ''),
    updatedAt: Number.isFinite(Number(value?.updatedAt)) ? Number(value.updatedAt) : Date.now()
  };
}

export function normalizeScrollPositions(positions, maxEntries = MAX_SCROLL_POSITIONS) {
  return Object.fromEntries(
    Object.entries(positions && typeof positions === 'object' ? positions : {})
      .map(([key, value]) => [key, normalizeScrollPosition(value)])
      .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
      .slice(-Math.max(1, maxEntries))
  );
}

export function updateScrollPositionRegistry(positions, key, value) {
  if (!key) return normalizeScrollPositions(positions);
  return normalizeScrollPositions({
    ...(positions || {}),
    [key]: normalizeScrollPosition(value, positions?.[key])
  });
}

export function getScrollOffset(position) {
  return normalizeScrollPosition(position).fallbackOffset;
}

export function makeAnchoredScrollPosition({ mangas = [], columns = 1, rowHeight = 1, scrollTop = 0, contentOffset = 0, layoutKey = '' } = {}) {
  const safeColumns = Math.max(1, Number(columns) || 1);
  const safeRowHeight = Math.max(1, Number(rowHeight) || 1);
  const safeScrollTop = Math.max(0, Number(scrollTop) || 0);
  const relativeOffset = Math.max(0, safeScrollTop - Math.max(0, Number(contentOffset) || 0));
  const rowIndex = Math.floor(relativeOffset / safeRowHeight);
  const anchor = mangas[rowIndex * safeColumns] || null;
  return normalizeScrollPosition({
    anchorId: anchor?.id || anchor?.contentId || null,
    intraRowOffset: relativeOffset - (rowIndex * safeRowHeight),
    fallbackOffset: safeScrollTop,
    layoutKey,
    updatedAt: Date.now()
  });
}

export function resolveAnchoredScrollOffset({ position, mangas = [], columns = 1, rowHeight = 1, contentOffset = 0 } = {}) {
  const normalized = normalizeScrollPosition(position);
  if (!normalized.anchorId) return normalized.fallbackOffset;
  const itemIndex = mangas.findIndex((manga) => (
    manga?.id === normalized.anchorId || manga?.contentId === normalized.anchorId
  ));
  if (itemIndex < 0) return normalized.fallbackOffset;
  const rowIndex = Math.floor(itemIndex / Math.max(1, Number(columns) || 1));
  return Math.max(0,
    Math.max(0, Number(contentOffset) || 0)
      + rowIndex * Math.max(1, Number(rowHeight) || 1)
      + normalized.intraRowOffset
  );
}
