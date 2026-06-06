import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Kavita reader architecture', () => {
  it('uses a dedicated reader controller and renderer components', () => {
    const shell = read('src/interfaces/kavita/KavitaReaderShell.jsx');
    const controller = read('src/interfaces/kavita/useReaderController.js');
    const renderers = read('src/interfaces/kavita/readerRenderers.jsx');

    expect(shell).toContain('useReaderController');
    expect(shell).toContain('ReaderRenderer');
    expect(controller).toContain('requestAnimationFrame');
    expect(controller).toContain('onUpdateProgress');
    expect(renderers).toContain('SinglePageRenderer');
    expect(renderers).toContain('DoublePageRenderer');
    expect(renderers).toContain('WebtoonRenderer');
    expect(renderers).toContain('SplitPageRenderer');
  });

  it('owns its fullscreen overlays and settings without importing the Sawa reader', () => {
    const source = read('src/interfaces/kavita/KavitaReaderShell.jsx');

    expect(source).toContain('kv-reader-top-overlay');
    expect(source).toContain('kv-reader-bottom-overlay');
    expect(source).toContain('kv-reader-settings');
    expect(source).toContain('data-reader-interface="kavita"');
    expect(source).not.toContain("components/ReaderView");
  });

  it('resets on chapter changes and persists the complete Kavita reader profile', () => {
    const shell = read('src/interfaces/kavita/KavitaReaderShell.jsx');
    const appShell = read('src/interfaces/kavita/KavitaShell.jsx');
    const controller = read('src/interfaces/kavita/useReaderController.js');
    const storage = read('electron/services/storage.cjs');

    expect(controller).toContain('[chapter.id, initialPageIndex');
    expect(controller).toContain('onReaderSettingsChange');
    expect(controller).toContain('progressChangeRef');
    expect(appShell).toContain('readerSettings={');
    expect(appShell).toContain('onReaderSettingsChange={');
    expect(shell).toContain('onReaderSettingsChange');
    expect(storage).toContain('kavitaReaderSettings');
  });

  it('uses a stable Webtoon root and cancels delayed measurements on unmount', () => {
    const renderers = read('src/interfaces/kavita/readerRenderers.jsx');

    expect(renderers).toContain('measureVisibleWebtoonPage');
    expect(renderers).toContain('rootRef');
    expect(renderers).toContain('cancelAnimationFrame');
    expect(renderers).not.toContain('const root = event.currentTarget');
  });

  it('keeps the Kavita profile separate and does not reveal chrome on pointer movement', () => {
    const shell = read('src/interfaces/kavita/KavitaReaderShell.jsx');
    const controller = read('src/interfaces/kavita/useReaderController.js');

    expect(shell).not.toContain('onPointerMove={controller.showOverlays}');
    expect(controller).toContain('resolveReaderCommand');
    expect(controller).not.toContain('initialReaderState?.mode');
    expect(controller).not.toContain('initialReaderState?.fitMode');
    expect(controller).not.toContain('initialReaderState?.zoom');
  });
});
