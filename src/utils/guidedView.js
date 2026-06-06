function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function sortPanelsForReading(panels) {
  return [...panels].sort((left, right) => {
    const topDelta = Math.abs((left.y || 0) - (right.y || 0));
    if (topDelta > 4) return (left.y || 0) - (right.y || 0);
    return (left.x || 0) - (right.x || 0);
  });
}

function createPanelId() {
  return `panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePanel(input = {}, index = 0) {
  const x = clampNumber(input?.x, 0, 99);
  const y = clampNumber(input?.y, 0, 99);
  const width = clampNumber(input?.width, 1, 100 - x);
  const height = clampNumber(input?.height, 1, 100 - y);

  return {
    id: typeof input?.id === 'string' && input.id.trim() ? input.id.trim() : createPanelId(),
    label: typeof input?.label === 'string' && input.label.trim() ? input.label.trim() : `Case ${index + 1}`,
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
    createdAt: typeof input?.createdAt === 'string' && input.createdAt.trim()
      ? input.createdAt
      : new Date().toISOString()
  };
}

export function normalizePanelMap(input = {}, chapterId = '') {
  const rawPages = input?.pages && typeof input.pages === 'object' ? input.pages : {};
  const pages = Object.fromEntries(
    Object.entries(rawPages).map(([pageIndex, rawValue]) => {
      const numericPageIndex = String(Math.max(0, Number.parseInt(pageIndex, 10) || 0));
      const rawPanels = Array.isArray(rawValue?.panels)
        ? rawValue.panels
        : Array.isArray(rawValue)
          ? rawValue
          : [];
      const panels = sortPanelsForReading(rawPanels.map((panel, index) => normalizePanel(panel, index)));
      return [numericPageIndex, { panels }];
    })
  );

  return {
    chapterId: typeof input?.chapterId === 'string' && input.chapterId.trim()
      ? input.chapterId.trim()
      : chapterId,
    updatedAt: typeof input?.updatedAt === 'string' && input.updatedAt.trim()
      ? input.updatedAt
      : null,
    source: typeof input?.source === 'string' && input.source.trim()
      ? input.source.trim()
      : 'manual',
    pages
  };
}

export function getPagePanels(panelMap, pageIndex) {
  return normalizePanelMap(panelMap).pages?.[String(Math.max(0, Number(pageIndex) || 0))]?.panels || [];
}

export function replacePagePanels(panelMap, pageIndex, panels = []) {
  const normalizedMap = normalizePanelMap(panelMap);
  const key = String(Math.max(0, Number(pageIndex) || 0));
  const nextPanels = sortPanelsForReading(panels.map((panel, index) => normalizePanel(panel, index)));

  return {
    ...normalizedMap,
    updatedAt: new Date().toISOString(),
    pages: {
      ...normalizedMap.pages,
      [key]: {
        panels: nextPanels
      }
    }
  };
}

export function createPanelFromDrag(start, end, bounds, index = 0) {
  const width = Number(bounds?.width || 0);
  const height = Number(bounds?.height || 0);
  if (width <= 0 || height <= 0) return null;

  const x1 = clampNumber(((Number(start?.x) - Number(bounds.left || 0)) / width) * 100, 0, 100);
  const y1 = clampNumber(((Number(start?.y) - Number(bounds.top || 0)) / height) * 100, 0, 100);
  const x2 = clampNumber(((Number(end?.x) - Number(bounds.left || 0)) / width) * 100, 0, 100);
  const y2 = clampNumber(((Number(end?.y) - Number(bounds.top || 0)) / height) * 100, 0, 100);

  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const panelWidth = Math.abs(x2 - x1);
  const panelHeight = Math.abs(y2 - y1);

  if (panelWidth < 3 || panelHeight < 3) return null;

  return normalizePanel({
    x,
    y,
    width: panelWidth,
    height: panelHeight,
    label: `Case ${index + 1}`
  }, index);
}
