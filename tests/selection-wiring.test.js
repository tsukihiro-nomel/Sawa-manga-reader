import fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('selection wiring', () => {
  it('shares the selection toolbar between Sawa and Kavita and keeps it visible at zero', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    const kavita = fs.readFileSync('src/interfaces/kavita/KavitaShell.jsx', 'utf8');
    const bar = fs.readFileSync('src/components/BulkActionBar.jsx', 'utf8');
    expect(app).toMatch(/selectionMode && \(\s*<BulkActionBar/);
    expect(kavita).toMatch(/\{selectionMode \? \(\s*<BulkActionBar/);
    expect(bar).not.toMatch(/if \(!selectionCount\) return null/);
    expect(bar).toContain('hiddenCount');
    expect(bar).toContain('onSelectAll');
    expect(bar).toContain('onInvert');
    expect(bar).toContain('onUndo');
    expect(bar).toContain('onTrash');
  });

  it('propagates modifier events and stable full ordering in both virtualized grids', () => {
    const card = fs.readFileSync('src/components/MangaCard.jsx', 'utf8');
    const library = fs.readFileSync('src/components/LibraryView.jsx', 'utf8');
    const kavita = fs.readFileSync('src/interfaces/kavita/KavitaLibraryView.jsx', 'utf8');
    expect(card).toMatch(/event\.ctrlKey \|\| event\.metaKey \|\| event\.shiftKey/);
    expect(card).toContain('orderedIds: selectionOrder');
    expect(library).toMatch(/mangas\.map\(\(manga\) => manga\.id\)/);
    expect(kavita).toMatch(/event\.ctrlKey \|\| event\.metaKey \|\| event\.shiftKey/);
    expect(kavita).toContain('orderedIds: selectionOrder');
  });

  it('exposes lightweight individual and bulk trash IPC through the preload boundary', () => {
    const main = fs.readFileSync('electron/main.cjs', 'utf8');
    const preload = fs.readFileSync('electron/preload.cjs', 'utf8');
    expect(main).toContain("ipcMain.handle('library:trashManga'");
    expect(main).toContain("ipcMain.handle('library:bulkTrashMangas'");
    expect(main).toContain("kind: 'bulk-trash'");
    expect(main).toContain('jobOrchestrator.enqueue');
    expect(main).toContain('requeueable: false');
    expect(preload).toContain("invoke('library:bulkTrashMangas'");
    expect(preload).toContain("invoke('tags:removeMany'");
    expect(preload).toContain("invoke('collections:removeMany'");
  });
});
