import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function loadInteractions() {
  try {
    return await import('../src/interfaces/kavita/tabInteractions.js');
  } catch (_error) {
    return {};
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Kavita tab interactions', () => {
  it('resolves normal, middle, ctrl and shift clicks without opening during selection', async () => {
    const { resolveTabOpenIntent } = await loadInteractions();

    expect(resolveTabOpenIntent).toBeTypeOf('function');
    expect(resolveTabOpenIntent({ button: 0 }, false)).toBe('current');
    expect(resolveTabOpenIntent({ button: 1 }, false)).toBe('background');
    expect(resolveTabOpenIntent({ button: 0, ctrlKey: true }, false)).toBe('background');
    expect(resolveTabOpenIntent({ button: 0, metaKey: true }, false)).toBe('background');
    expect(resolveTabOpenIntent({ button: 0, shiftKey: true }, false)).toBe('foreground');
    expect(resolveTabOpenIntent({ button: 1 }, true)).toBe('selection');
  });

  it('maps Ctrl+1 through Ctrl+8 and Ctrl+9 to available tabs', async () => {
    const { resolveNumberedTabIndex } = await loadInteractions();

    expect(resolveNumberedTabIndex).toBeTypeOf('function');
    expect(resolveNumberedTabIndex({ key: '1', ctrlKey: true }, 5)).toBe(0);
    expect(resolveNumberedTabIndex({ key: '5', ctrlKey: true }, 5)).toBe(4);
    expect(resolveNumberedTabIndex({ key: '8', ctrlKey: true }, 5)).toBeNull();
    expect(resolveNumberedTabIndex({ key: '9', ctrlKey: true }, 5)).toBe(4);
    expect(resolveNumberedTabIndex({ key: '2', metaKey: true }, 5)).toBe(1);
    expect(resolveNumberedTabIndex({ key: '2', ctrlKey: true, shiftKey: true }, 5)).toBeNull();
  });

  it('reorders tabs without crossing the pinned boundary', async () => {
    const { reorderTabsPreservingPins } = await loadInteractions();
    const tabs = [
      { id: 'pinned', pinned: true },
      { id: 'one', pinned: false },
      { id: 'two', pinned: false }
    ];

    expect(reorderTabsPreservingPins(tabs, 'two', 'one').map((tab) => tab.id)).toEqual(['pinned', 'two', 'one']);
    expect(reorderTabsPreservingPins(tabs, 'two', 'pinned')).toBe(tabs);
  });

  it('uses one Kavita-owned tabs bar in the application and reader shells', () => {
    const shell = read('src/interfaces/kavita/KavitaShell.jsx');
    const reader = read('src/interfaces/kavita/KavitaReaderShell.jsx');
    const tabs = read('src/interfaces/kavita/KavitaTabsBar.jsx');

    expect(shell).toContain("import KavitaTabsBar from './KavitaTabsBar.jsx'");
    expect(reader).toContain("import KavitaTabsBar from './KavitaTabsBar.jsx'");
    expect(reader).toContain('kv-reader-top-chrome');
    expect(reader).toContain('tabs={tabs}');
    expect(tabs).toContain('onMouseUp');
    expect(tabs).toContain('event.button === 1');
    expect(tabs).toContain('DndContext');
    expect(tabs).toContain('onReorderTabs');
  });
});

describe('Kavita vault parity', () => {
  it('uses a dedicated vault surface with local PIN forms and private content', () => {
    const shell = read('src/interfaces/kavita/KavitaShell.jsx');
    const vault = read('src/interfaces/kavita/KavitaVaultView.jsx');
    const app = read('src/App.jsx');

    expect(shell).toContain("import KavitaVaultView from './KavitaVaultView.jsx'");
    expect(shell).toContain('<KavitaVaultView');
    expect(vault).toContain('onSetupPin');
    expect(vault).toContain('confirmPin');
    expect(vault).toContain('onUnlock');
    expect(vault).toContain('categories.map');
    expect(vault).toContain('KavitaLibraryView');
    expect(vault).not.toContain('window.prompt');
    expect(app).toContain('vaultMangas: filteredPrivateMangas');
    expect(app).toContain('vaultCategories');
    expect(app).toContain('onToggleVaultBlur');
    expect(app).toContain('onToggleVaultStealth');
  });

  it('keeps private tab labels neutral while the vault is locked', () => {
    const app = read('src/App.jsx');

    expect(app).toContain('neutralizeLockedVaultTabs');
    expect(app).toContain("label: 'Contenu prive'");
    expect(app).toContain("subtitle: 'Coffre verrouille'");
  });
});
