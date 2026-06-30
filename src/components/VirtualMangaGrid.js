export function chunkMangas(mangas = [], columns = 1) {
  const safeColumns = Math.max(1, Math.floor(Number(columns) || 1));
  const rows = [];
  for (let index = 0; index < mangas.length; index += safeColumns) {
    rows.push(mangas.slice(index, index + safeColumns));
  }
  return rows;
}

export function resolveVirtualGridMetrics(cardSize = 'comfortable', itemCount = 0) {
  const size = cardSize === 'compact' || cardSize === 'large' ? cardSize : 'comfortable';
  const performanceMode = Number(itemCount) >= 150;
  return {
    minCard: size === 'compact' ? 180 : size === 'large' ? 320 : 240,
    rowHeight: size === 'compact' ? 460 : size === 'large' ? 620 : 540,
    performanceMode,
    overscan: performanceMode ? 0 : 1
  };
}
