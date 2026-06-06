import { describe, expect, it } from 'vitest';
import { resolveReaderCommand } from '../src/interfaces/kavita/readerCommands.js';

const shortcuts = {
  nextPage: 'ArrowRight',
  prevPage: 'ArrowLeft',
  nextChapter: 'Ctrl+ArrowRight',
  prevChapter: 'Ctrl+ArrowLeft',
  toggleFullscreen: 'F',
  toggleUI: 'H',
  zoomIn: '+',
  zoomOut: '-',
  zoomReset: '0',
  exitReader: 'Escape',
  closeTab: 'Ctrl+W',
  newTab: 'Ctrl+T',
  nextTab: 'Ctrl+Tab',
  prevTab: 'Ctrl+Shift+Tab'
};

function keyEvent(key, patch = {}) {
  return { key, target: null, ...patch };
}

describe('Kavita reader command resolver', () => {
  it('leaves global tab shortcuts to the application listener', () => {
    expect(resolveReaderCommand(keyEvent('w', { ctrlKey: true }), { shortcuts, mode: 'single' })).toEqual({ type: 'global' });
    expect(resolveReaderCommand(keyEvent('Tab', { ctrlKey: true }), { shortcuts, mode: 'single' })).toEqual({ type: 'global' });
    expect(resolveReaderCommand(keyEvent('9', { ctrlKey: true }), { shortcuts, mode: 'single' })).toEqual({ type: 'global' });
  });

  it('maps vertical keys to page navigation in paginated modes', () => {
    expect(resolveReaderCommand(keyEvent('ArrowUp'), { shortcuts, mode: 'single' })).toEqual({ type: 'previous-page' });
    expect(resolveReaderCommand(keyEvent('PageUp'), { shortcuts, mode: 'double-ltr' })).toEqual({ type: 'previous-page' });
    expect(resolveReaderCommand(keyEvent('ArrowDown'), { shortcuts, mode: 'single' })).toEqual({ type: 'next-page' });
    expect(resolveReaderCommand(keyEvent('PageDown'), { shortcuts, mode: 'double-rtl' })).toEqual({ type: 'next-page' });
    expect(resolveReaderCommand(keyEvent(' '), { shortcuts, mode: 'single' })).toEqual({ type: 'next-page' });
  });

  it('maps vertical keys to viewport scrolling in Webtoon mode', () => {
    expect(resolveReaderCommand(keyEvent('ArrowUp'), { shortcuts, mode: 'webtoon' })).toEqual({ type: 'scroll-webtoon', direction: -1, amount: 'small' });
    expect(resolveReaderCommand(keyEvent('ArrowDown'), { shortcuts, mode: 'webtoon' })).toEqual({ type: 'scroll-webtoon', direction: 1, amount: 'small' });
    expect(resolveReaderCommand(keyEvent('PageUp'), { shortcuts, mode: 'webtoon' })).toEqual({ type: 'scroll-webtoon', direction: -1, amount: 'page' });
    expect(resolveReaderCommand(keyEvent('PageDown'), { shortcuts, mode: 'webtoon' })).toEqual({ type: 'scroll-webtoon', direction: 1, amount: 'page' });
  });

  it('keeps chapter, chrome and zoom commands configurable', () => {
    expect(resolveReaderCommand(keyEvent('ArrowRight', { ctrlKey: true }), { shortcuts, mode: 'webtoon' })).toEqual({ type: 'next-chapter' });
    expect(resolveReaderCommand(keyEvent('ArrowLeft', { ctrlKey: true }), { shortcuts, mode: 'single' })).toEqual({ type: 'previous-chapter' });
    expect(resolveReaderCommand(keyEvent('h'), { shortcuts, mode: 'single' })).toEqual({ type: 'toggle-chrome' });
    expect(resolveReaderCommand(keyEvent('+'), { shortcuts, mode: 'single' })).toEqual({ type: 'zoom-in' });
  });

  it('ignores reader navigation from editable controls', () => {
    const target = { tagName: 'INPUT', isContentEditable: false };
    expect(resolveReaderCommand(keyEvent('ArrowDown', { target }), { shortcuts, mode: 'single' })).toBeNull();
  });
});
