export function resolveTabOpenIntent(event = {}, selectionMode = false) {
  if (selectionMode) return 'selection';
  if (event.button === 1 || event.ctrlKey || event.metaKey) return 'background';
  if (event.shiftKey) return 'foreground';
  return 'current';
}

export function resolveNumberedTabIndex(event = {}, tabCount = 0) {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return null;
  const count = Math.max(0, Number(tabCount || 0));
  const digit = Number.parseInt(String(event.key || ''), 10);
  if (!Number.isFinite(digit) || digit < 1 || digit > 9 || count === 0) return null;
  if (digit === 9) return count - 1;
  const index = digit - 1;
  return index < count ? index : null;
}

export function reorderTabsPreservingPins(tabs, activeId, overId) {
  const source = Array.isArray(tabs) ? tabs : [];
  const activeIndex = source.findIndex((tab) => tab.id === activeId);
  const overIndex = source.findIndex((tab) => tab.id === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return source;
  if (Boolean(source[activeIndex]?.pinned) !== Boolean(source[overIndex]?.pinned)) return source;

  const next = [...source];
  const [moved] = next.splice(activeIndex, 1);
  next.splice(overIndex, 0, moved);
  return next;
}
