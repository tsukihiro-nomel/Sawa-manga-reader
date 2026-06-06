import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('independent Kavita shell', () => {
  it('mounts a dedicated lazily loaded shell instead of a CSS interface class', () => {
    const appSource = read('src/App.jsx');
    const shellSource = read('src/interfaces/kavita/KavitaShell.jsx');

    expect(appSource).toContain("lazy(() => import('./interfaces/kavita/KavitaShell.jsx'))");
    expect(appSource).toContain("interfaceMode === 'kavita'");
    expect(shellSource).toContain('data-interface="kavita"');
    expect(shellSource).not.toMatch(/from ['"]\.\.\/\.\.\/components\/(?:Sidebar|TitleBar|TopBar|LibraryView|MangaDetailView|ChapterPreviewView|ReaderView)/);
  });

  it('provides Kavita-owned library, detail, chapter and advanced tool surfaces', () => {
    const shellSource = read('src/interfaces/kavita/KavitaShell.jsx');

    expect(shellSource).toContain('KavitaLibraryView');
    expect(shellSource).toContain('KavitaSeriesView');
    expect(shellSource).toContain('KavitaChapterView');
    expect(shellSource).toContain('KavitaToolsView');
  });

  it('keeps theme selection independent from interface selection', () => {
    const settingsSource = read('src/components/SettingsDrawer.jsx');

    expect(settingsSource).toContain("id: 'kavita'");
    expect(settingsSource).toContain("id: 'sawa'");
    expect(settingsSource).toContain('onRequestInterfaceMode?.(entry.id)');
    expect(settingsSource).not.toContain("interfaceMode: 'kavita-clean'");
  });

  it('keeps editor state live and exposes the complete Sawa action groups', () => {
    const appSource = read('src/App.jsx');
    const shellSource = read('src/interfaces/kavita/KavitaShell.jsx');
    const librarySource = read('src/interfaces/kavita/KavitaLibraryView.jsx');
    const seriesSource = read('src/interfaces/kavita/KavitaSeriesView.jsx');

    expect(shellSource).toContain('resolveEditorManga');
    expect(shellSource).toContain('mangaId');
    expect(shellSource).not.toContain("setEditor({ type: 'tags', manga:");
    expect(seriesSource).toContain('kv-series-tag-list');
    expect(seriesSource).toContain('kv-series-collection-list');
    expect(librarySource).not.toContain('kv-series-tag-list');
    expect(librarySource).not.toContain('kv-series-collection-list');

    [
      'onOpenMangaInNewTab',
      'onResumeMangaIncognito',
      'onOpenSourceSeries',
      'onSetMangaReadStatus',
      'onSearchOnlineMetadata',
      'onImportComicInfo',
      'onPickCover',
      'onQueueWorkbench',
      'onAddMangaToQueue',
      'onAddNextToQueue',
      'onSetPrivateFlag',
      'onResetMangaProgress',
      'onTrashManga',
      'onOpenChapterInNewTab',
      'onOpenChapterIncognito',
      'onAddChapterToQueue',
      'onAddNextChapterToQueue',
      'onResetChapterProgress',
      'onToggleCategoryHidden',
      'onRemoveCategory',
      'onOpenCollection',
      'onToggleCollectionPin',
      'onToggleTabPin',
      'onDuplicateTab',
      'onCloseOtherTabs',
      'onCloseTabsToRight',
      'onMoveTabToWorkspace'
    ].forEach((actionName) => {
      expect(appSource).toContain(actionName);
      expect(shellSource).toContain(actionName);
    });
  });
});
