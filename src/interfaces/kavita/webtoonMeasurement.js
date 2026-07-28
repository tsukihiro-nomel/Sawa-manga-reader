function parsePageIndex(node) {
  const index = Number(node?.dataset?.kvPageIndex);
  return Number.isInteger(index) ? index : null;
}

function findPageNodeFromElement(element) {
  if (!element) return null;
  if (typeof element.closest === 'function') {
    return element.closest('[data-kv-page-index]');
  }

  let current = element;
  while (current) {
    if (current.dataset?.kvPageIndex !== undefined) return current;
    current = current.parentElement;
  }
  return null;
}

export function measureVisibleWebtoonPage(root) {
  if (
    !root
    || root.isConnected === false
    || typeof root.getBoundingClientRect !== 'function'
    || !Number.isFinite(Number(root.clientHeight))
    || Number(root.clientHeight) <= 0
  ) {
    return null;
  }

  const rootRect = root.getBoundingClientRect();
  if (!rootRect || !Number.isFinite(Number(rootRect.top))) return null;

  const width = Number.isFinite(Number(rootRect.width)) && Number(rootRect.width) > 0
    ? Number(rootRect.width)
    : Number(root.clientWidth || 0);
  const centerX = Number(rootRect.left || 0) + width / 2;
  const centerY = Number(rootRect.top) + Number(root.clientHeight) / 2;
  const elementFromPoint = root.ownerDocument?.elementFromPoint;

  if (typeof elementFromPoint === 'function') {
    const pageNode = findPageNodeFromElement(elementFromPoint.call(root.ownerDocument, centerX, centerY));
    const index = parsePageIndex(pageNode);
    const belongsToRoot = pageNode && (typeof root.contains !== 'function' || root.contains(pageNode));
    if (index !== null && belongsToRoot && pageNode.isConnected !== false) return index;
  }

  if (typeof root.querySelectorAll !== 'function') return null;

  let closest = null;

  root.querySelectorAll('[data-kv-page-index]').forEach((node) => {
    if (!node || node.isConnected === false || typeof node.getBoundingClientRect !== 'function') return;
    const rect = node.getBoundingClientRect();
    const index = parsePageIndex(node);
    const top = Number(rect?.top);
    const height = Number(rect?.height);
    if (index === null || !Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return;

    const distance = Math.abs((top + height / 2) - centerY);
    if (!closest || distance < closest.distance) closest = { distance, index };
  });

  return closest?.index ?? null;
}
