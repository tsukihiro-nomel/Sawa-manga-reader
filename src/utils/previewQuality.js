export const PREVIEW_SIZES = Object.freeze({
  chapter: Object.freeze({
    compact: Object.freeze({ width: 180, height: 126, minWidth: 170 }),
    comfortable: Object.freeze({ width: 240, height: 168, minWidth: 220 }),
    large: Object.freeze({ width: 320, height: 224, minWidth: 300 })
  }),
  page: Object.freeze({
    compact: Object.freeze({ width: 140, height: 200, minWidth: 130 }),
    comfortable: Object.freeze({ width: 200, height: 286, minWidth: 180 }),
    large: Object.freeze({ width: 280, height: 400, minWidth: 260 })
  })
});

export const PREVIEW_SIZE_OPTIONS = Object.freeze([
  Object.freeze({ id: 'compact', label: 'Compact' }),
  Object.freeze({ id: 'comfortable', label: 'Confort' }),
  Object.freeze({ id: 'large', label: 'Large' })
]);

export const PREVIEW_QUALITY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'economy', label: 'Économe' }),
  Object.freeze({ id: 'balanced', label: 'Auto' }),
  Object.freeze({ id: 'high', label: 'Net' })
]);

export function normalizePreviewSize(value) {
  return value === 'compact' || value === 'large' ? value : 'comfortable';
}

export function normalizePreviewQuality(value) {
  return value === 'economy' || value === 'high' ? value : 'balanced';
}

export function resolvePreviewSize(kind, value) {
  const group = kind === 'chapter' ? PREVIEW_SIZES.chapter : PREVIEW_SIZES.page;
  return group[normalizePreviewSize(value)];
}

export function resolvePreviewPixelRatio(quality, devicePixelRatio = 1) {
  const ratio = Math.max(1, Number(devicePixelRatio) || 1);
  switch (normalizePreviewQuality(quality)) {
    case 'economy':
      return 1;
    case 'high':
      return Math.min(3, Math.max(1.5, ratio * 1.25));
    default:
      return Math.min(2, ratio);
  }
}

export function resolvePreviewRequest({
  width,
  height,
  quality = 'balanced',
  devicePixelRatio = 1
} = {}) {
  const normalizedQuality = normalizePreviewQuality(quality);
  const pixelRatio = resolvePreviewPixelRatio(normalizedQuality, devicePixelRatio);
  const ceiling = normalizedQuality === 'economy'
    ? 720
    : normalizedQuality === 'high'
      ? 2048
      : 1400;
  const safeWidth = Math.max(32, Number(width) || 360);
  const safeHeight = Math.max(32, Number(height) || 540);
  const largestRequested = Math.max(safeWidth * pixelRatio, safeHeight * pixelRatio);
  const scale = largestRequested > ceiling ? ceiling / largestRequested : 1;

  return {
    width: Math.max(32, Math.round(safeWidth * pixelRatio * scale)),
    height: Math.max(32, Math.round(safeHeight * pixelRatio * scale)),
    pixelRatio: Math.max(1, pixelRatio * scale),
    quality: normalizedQuality,
    nativeQuality: normalizedQuality === 'economy' ? 'good' : 'best'
  };
}

export function normalizeMeasuredPreviewDimensions(width, height, fallback = {}) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || safeWidth < 16 || !Number.isFinite(safeHeight) || safeHeight < 16) {
    return {
      width: Math.max(32, Number(fallback.width) || 360),
      height: Math.max(32, Number(fallback.height) || 540),
      measured: false
    };
  }
  return {
    width: Math.max(32, Math.round(safeWidth / 8) * 8),
    height: Math.max(32, Math.round(safeHeight / 8) * 8),
    measured: true
  };
}
