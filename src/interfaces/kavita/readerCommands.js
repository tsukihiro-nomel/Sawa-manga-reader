function normalizeShortcutToken(token) {
  return String(token || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('control', 'ctrl')
    .replace('command', 'meta')
    .replace('cmd', 'meta')
    .replace('arrow', '');
}

function splitShortcut(shortcut) {
  return String(shortcut || '')
    .split('+')
    .map(normalizeShortcutToken)
    .filter(Boolean);
}

function eventMatchesShortcut(event, shortcut) {
  const tokens = splitShortcut(shortcut);
  if (!tokens.length) return false;

  const key = normalizeShortcutToken(event?.key);
  const modifiers = ['ctrl', 'meta', 'alt', 'shift'];
  const keyToken = tokens.find((token) => !modifiers.includes(token));
  return Boolean(
    event
    && Boolean(event.ctrlKey) === tokens.includes('ctrl')
    && Boolean(event.metaKey) === tokens.includes('meta')
    && Boolean(event.altKey) === tokens.includes('alt')
    && Boolean(event.shiftKey) === tokens.includes('shift')
    && (!keyToken || key === keyToken)
  );
}

function isEditableTarget(target) {
  const tagName = String(target?.tagName || '').toLowerCase();
  return Boolean(
    target?.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
  );
}

function hasPlainKey(event, key) {
  return !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && !event.shiftKey
    && normalizeShortcutToken(event.key) === normalizeShortcutToken(key);
}

function matches(event, configured, fallback) {
  const shortcut = configured || fallback;
  if (shortcut === '+') return hasPlainKey(event, '+');
  return eventMatchesShortcut(event, shortcut);
}

export function resolveReaderCommand(event, context = {}) {
  if (!event || isEditableTarget(event.target)) return null;

  const shortcuts = context.shortcuts || {};
  if (
    matches(event, shortcuts.closeTab, 'Ctrl+W')
    || matches(event, shortcuts.newTab, 'Ctrl+T')
    || matches(event, shortcuts.nextTab, 'Ctrl+Tab')
    || matches(event, shortcuts.prevTab || shortcuts.previousTab, 'Ctrl+Shift+Tab')
    || (event.ctrlKey && !event.metaKey && !event.altKey && /^[1-9]$/.test(String(event.key)))
  ) {
    return { type: 'global' };
  }

  if (matches(event, shortcuts.prevChapter || shortcuts.previousChapter, 'Ctrl+ArrowLeft')) {
    return { type: 'previous-chapter' };
  }
  if (matches(event, shortcuts.nextChapter, 'Ctrl+ArrowRight')) {
    return { type: 'next-chapter' };
  }
  if (matches(event, shortcuts.toggleUI || shortcuts.toggleReaderUi, 'H')) return { type: 'toggle-chrome' };
  if (matches(event, shortcuts.exitReader, 'Escape')) return { type: 'exit-reader' };
  if (matches(event, shortcuts.toggleFullscreen || shortcuts.fullscreen, 'F')) return { type: 'toggle-fullscreen' };
  if (matches(event, shortcuts.zoomIn, '+') || hasPlainKey(event, '=')) return { type: 'zoom-in' };
  if (matches(event, shortcuts.zoomOut, '-')) return { type: 'zoom-out' };
  if (matches(event, shortcuts.zoomReset, '0')) return { type: 'zoom-reset' };

  if (context.mode === 'webtoon') {
    if (hasPlainKey(event, 'ArrowUp')) return { type: 'scroll-webtoon', direction: -1, amount: 'small' };
    if (hasPlainKey(event, 'ArrowDown')) return { type: 'scroll-webtoon', direction: 1, amount: 'small' };
    if (hasPlainKey(event, 'PageUp')) return { type: 'scroll-webtoon', direction: -1, amount: 'page' };
    if (hasPlainKey(event, 'PageDown') || hasPlainKey(event, ' ')) {
      return { type: 'scroll-webtoon', direction: 1, amount: 'page' };
    }
  } else {
    if (
      matches(event, shortcuts.prevPage || shortcuts.previousPage, 'ArrowLeft')
      || hasPlainKey(event, 'ArrowUp')
      || hasPlainKey(event, 'PageUp')
    ) {
      return { type: 'previous-page' };
    }
    if (
      matches(event, shortcuts.nextPage, 'ArrowRight')
      || hasPlainKey(event, 'ArrowDown')
      || hasPlainKey(event, 'PageDown')
      || hasPlainKey(event, ' ')
    ) {
      return { type: 'next-page' };
    }
  }

  if (hasPlainKey(event, 'ArrowLeft')) return { type: 'previous-page' };
  if (hasPlainKey(event, 'ArrowRight')) return { type: 'next-page' };
  return null;
}

export { eventMatchesShortcut, isEditableTarget };
