const DENSITY_CANDIDATES = [
  { density: 'full', regularWidth: 228, pinnedWidth: 44, tabGap: 8, iconOnly: false },
  { density: 'compact', regularWidth: 176, pinnedWidth: 40, tabGap: 8, iconOnly: false },
  { density: 'minimal', regularWidth: 132, pinnedWidth: 36, tabGap: 6, iconOnly: false }
];

const ICON_ONLY_THRESHOLD = 72;
const MIN_COMPRESSED_WIDTH = 10;

function clampWidth(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function measureLineWidth(pinnedCount, regularCount, pinnedWidth, regularWidth, tabGap) {
  const itemCount = pinnedCount + regularCount;
  if (itemCount <= 0) return 0;
  const gapWidth = tabGap * Math.max(0, itemCount - 1);
  return (pinnedCount * pinnedWidth) + (regularCount * regularWidth) + gapWidth;
}

function pickCompressedGap(itemCount) {
  if (itemCount >= 64) return 0;
  if (itemCount >= 28) return 1;
  if (itemCount >= 14) return 2;
  return 4;
}

export function computeTabLayout({ tabs = [], activeTabId: _activeTabId = null, availableWidth = 0 } = {}) {
  const safeTabs = Array.isArray(tabs) ? tabs : [];
  const clampedWidth = clampWidth(availableWidth);

  if (safeTabs.length === 0) {
    const baseline = DENSITY_CANDIDATES[0];
    return {
      density: baseline.density,
      regularWidth: baseline.regularWidth,
      pinnedWidth: baseline.pinnedWidth,
      tabGap: baseline.tabGap,
      iconOnly: false,
      visibleTabs: [],
      overflowTabs: [],
      hasOverflow: false
    };
  }

  const pinnedCount = safeTabs.filter((tab) => tab.pinned).length;
  const regularCount = safeTabs.length - pinnedCount;

  for (const candidate of DENSITY_CANDIDATES) {
    const requiredWidth = measureLineWidth(
      pinnedCount,
      regularCount,
      candidate.pinnedWidth,
      candidate.regularWidth,
      candidate.tabGap
    );
    if (requiredWidth <= clampedWidth) {
      return {
        density: candidate.density,
        regularWidth: candidate.regularWidth,
        pinnedWidth: candidate.pinnedWidth,
        tabGap: candidate.tabGap,
        iconOnly: candidate.iconOnly,
        visibleTabs: safeTabs,
        overflowTabs: [],
        hasOverflow: false
      };
    }
  }

  const compressedGap = pickCompressedGap(safeTabs.length);
  const gapWidth = compressedGap * Math.max(0, safeTabs.length - 1);
  const widthForTabs = Math.max(0, clampedWidth - gapWidth);
  const compressedWidth = safeTabs.length > 0
    ? Math.max(MIN_COMPRESSED_WIDTH, widthForTabs / safeTabs.length)
    : DENSITY_CANDIDATES[DENSITY_CANDIDATES.length - 1].regularWidth;

  const iconOnly = compressedWidth <= ICON_ONLY_THRESHOLD;

  return {
    density: 'minimal',
    regularWidth: compressedWidth,
    pinnedWidth: compressedWidth,
    tabGap: compressedGap,
    iconOnly,
    visibleTabs: safeTabs,
    overflowTabs: [],
    hasOverflow: false
  };
}
