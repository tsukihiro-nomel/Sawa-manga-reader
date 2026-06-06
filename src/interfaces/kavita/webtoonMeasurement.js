export function measureVisibleWebtoonPage(root) {
  if (
    !root
    || root.isConnected === false
    || typeof root.getBoundingClientRect !== 'function'
    || typeof root.querySelectorAll !== 'function'
    || !Number.isFinite(Number(root.clientHeight))
    || Number(root.clientHeight) <= 0
  ) {
    return null;
  }

  const rootRect = root.getBoundingClientRect();
  if (!rootRect || !Number.isFinite(Number(rootRect.top))) return null;

  const center = Number(rootRect.top) + Number(root.clientHeight) / 2;
  let closest = null;

  root.querySelectorAll('[data-kv-page-index]').forEach((node) => {
    if (!node || node.isConnected === false || typeof node.getBoundingClientRect !== 'function') return;
    const rect = node.getBoundingClientRect();
    const index = Number(node.dataset?.kvPageIndex);
    const top = Number(rect?.top);
    const height = Number(rect?.height);
    if (!Number.isInteger(index) || !Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return;

    const distance = Math.abs((top + height / 2) - center);
    if (!closest || distance < closest.distance) closest = { distance, index };
  });

  return closest?.index ?? null;
}
