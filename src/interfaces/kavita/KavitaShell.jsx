import { memo, useMemo, useState } from 'react';
import {
  Archive,
  BookMarked,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Database,
  Folder,
  Heart,
  Home,
  Library,
  Lock,
  Menu,
  Minus,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Square,
  SlidersHorizontal,
  Star,
  Wrench,
  X
} from 'lucide-react';
import KavitaLibraryView from './KavitaLibraryView.jsx';
import KavitaSeriesView from './KavitaSeriesView.jsx';
import KavitaChapterView from './KavitaChapterView.jsx';
import KavitaToolsView from './KavitaToolsView.jsx';
import KavitaReaderShell from './KavitaReaderShell.jsx';
import KavitaTabsBar from './KavitaTabsBar.jsx';
import KavitaVaultView from './KavitaVaultView.jsx';
import KavitaEditorDialog from './KavitaEditorDialog.jsx';
import KavitaContextMenu from './KavitaContextMenu.jsx';
import KavitaOnlineMetadataDialog from './KavitaOnlineMetadataDialog.jsx';
import { resolveEditorManga, resolveMangaCollections } from './kavitaState.js';
import './kavita.css';

const MAIN_NAV = [
  { id: 'dashboard', label: 'Accueil', icon: Home },
  { id: 'favorites', label: 'Favoris', icon: Heart },
  { id: 'collections', label: 'Collections', icon: BookMarked },
  { id: 'recents', label: 'Lectures recentes', icon: BookOpen },
  { id: 'library', label: 'Toutes les series', icon: Library }
];

const TOOL_NAV = [
  { id: 'vault', label: 'Coffre', icon: Lock },
  { id: 'sources', label: 'Sources', icon: Plus },
  { id: 'workbench', label: 'Atelier', icon: SlidersHorizontal },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench }
];

const COLOR_THEMES = [
  { id: 'dark-night', label: 'Dark Night' },
  { id: 'light-paper', label: 'Light Paper' },
  { id: 'coffee-house', label: 'Coffee House' },
  { id: 'neon-city', label: 'Neon City' }
];

function NavButton({ item, active, collapsed, count, onClick }) {
  const Icon = item.icon;
  return (
    <button type="button" className={`kv-nav-button ${active ? 'is-active' : ''}`} onClick={onClick} title={collapsed ? item.label : undefined}>
      <Icon size={18} />
      {!collapsed ? <span>{item.label}</span> : null}
      {!collapsed && count > 0 ? <small>{count}</small> : null}
    </button>
  );
}

function KavitaSettingsPanel({ ui, onChange, onRequestInterfaceMode, onClose }) {
  return (
    <div className="kv-settings-backdrop" onClick={onClose}>
      <aside className="kv-settings-panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><strong>Parametres</strong><span>Interface et lecture</span></div>
          <button type="button" className="kv-icon-button" onClick={onClose}><X size={18} /></button>
        </header>
        <section>
          <h3>Interface</h3>
          <div className="kv-settings-options">
            <button type="button" className={ui.interfaceMode === 'kavita' ? 'is-active' : ''} onClick={() => onRequestInterfaceMode('kavita')}>
              <Library size={18} /><span><strong>Kavita</strong><small>Navigation plate et dense</small></span>
            </button>
            <button type="button" className={ui.interfaceMode === 'sawa' ? 'is-active' : ''} onClick={() => onRequestInterfaceMode('sawa')}>
              <Star size={18} /><span><strong>Sawa</strong><small>Interface visuelle historique</small></span>
            </button>
          </div>
        </section>
        <section>
          <h3>Theme couleur</h3>
          <div className="kv-theme-list">
            {COLOR_THEMES.map((theme) => (
              <button type="button" key={theme.id} className={ui.theme === theme.id ? 'is-active' : ''} onClick={() => onChange({ theme: theme.id })}>
                <span className={`kv-theme-swatch is-${theme.id}`} />
                {theme.label}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Comportement</h3>
          <label className="kv-settings-toggle"><span>Apercu avant lecture</span><input type="checkbox" checked={Boolean(ui.showPagePreviewBeforeReading)} onChange={(event) => onChange({ showPagePreviewBeforeReading: event.target.checked })} /></label>
          <label className="kv-settings-toggle"><span>Masquage auto du lecteur</span><input type="checkbox" checked={Boolean(ui.autoHideReaderUI)} onChange={(event) => onChange({ autoHideReaderUI: event.target.checked })} /></label>
        </section>
      </aside>
    </div>
  );
}

function KavitaShell({ model }) {
  const {
    ui,
    activeView,
    activeScreen,
    library,
    mangas,
    categories,
    selectedCategoryId,
    currentManga,
    currentChapter,
    annotations,
    collections,
    tags,
    maintenanceIssues,
    maintenanceStats,
    workbenchMangas,
    vault,
    vaultMangas = [],
    vaultCategories = [],
    activeVaultCategoryId = null,
    plugins,
    migrationStatus,
    syncStatus,
    tabs,
    activeTabId,
    workspaces = [],
    activeWorkspaceId,
    search,
    settingsOpen,
    selectionMode,
    selectedIds,
    actions
  } = model;
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [editor, setEditor] = useState(null);
  const [onlineMetadataMangaId, setOnlineMetadataMangaId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [actionError, setActionError] = useState('');
  const {
    onOpenManga,
    onOpenMangaInNewTab,
    onResumeMangaIncognito,
    onOpenSourceSeries,
    onToggleFavorite,
    onSetMangaReadStatus,
    onSearchOnlineMetadata,
    onImportOnlineMetadata,
    onImportComicInfo,
    onPickCover,
    onQueueWorkbench,
    onAddMangaToQueue,
    onAddNextToQueue,
    onSetPrivateFlag,
    onResetMangaProgress,
    onTrashManga,
    onOpenChapter,
    onOpenChapterInNewTab,
    onOpenChapterIncognito,
    onSetChapterReadStatus,
    onAddChapterToQueue,
    onAddNextChapterToQueue,
    onResetChapterProgress,
    onToggleCategoryHidden,
    onRemoveCategory,
    onOpenCollection,
    onToggleCollectionPin,
    onToggleTabPin,
    onDuplicateTab,
    onCloseOtherTabs,
    onCloseTabsToRight,
    onMoveTabToWorkspace
  } = actions;
  const contextActions = {
    ...actions,
    onOpenManga,
    onOpenMangaInNewTab,
    onResumeMangaIncognito,
    onOpenSourceSeries,
    onToggleFavorite,
    onSetMangaReadStatus,
    onImportComicInfo,
    onPickCover,
    onQueueWorkbench,
    onAddMangaToQueue,
    onAddNextToQueue,
    onSetPrivateFlag,
    onResetMangaProgress,
    onTrashManga,
    onOpenChapter,
    onOpenChapterInNewTab,
    onOpenChapterIncognito,
    onSetChapterReadStatus,
    onAddChapterToQueue,
    onAddNextChapterToQueue,
    onResetChapterProgress,
    onToggleCategoryHidden,
    onRemoveCategory,
    onOpenCollection,
    onToggleCollectionPin,
    onToggleTabPin,
    onDuplicateTab,
    onCloseOtherTabs,
    onCloseTabsToRight,
    onMoveTabToWorkspace
  };
  const collapsed = Boolean(ui.sidebarCollapsed);
  const screenTitle = activeScreen === 'favorites'
    ? 'Favoris'
    : activeScreen === 'recents'
      ? 'Lectures recentes'
      : categories.find((entry) => entry.id === selectedCategoryId)?.name || 'Bibliotheque';
  const searchResultsLabel = search ? `${mangas.length} resultat(s)` : '';
  const visibleToolNav = TOOL_NAV.filter((item) => item.id !== 'sources' || model.webSourcesEnabled);
  const readerState = activeView.screen === 'reader' && currentManga && currentChapter;
  const selectedCount = selectedIds?.size || 0;
  const editorManga = useMemo(
    () => resolveEditorManga(editor?.mangaId, library)
      || resolveEditorManga(editor?.mangaId, { allMangas: currentManga ? [currentManga] : [] }),
    [currentManga, editor?.mangaId, library]
  );
  const currentMangaCollections = useMemo(
    () => resolveMangaCollections(currentManga, collections),
    [collections, currentManga]
  );
  const onlineMetadataManga = useMemo(
    () => resolveEditorManga(onlineMetadataMangaId, library)
      || resolveEditorManga(onlineMetadataMangaId, { allMangas: currentManga ? [currentManga] : [] }),
    [currentManga, library, onlineMetadataMangaId]
  );
  const openContextMenu = (event, context) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 306)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - Math.min(628, window.innerHeight - 16))),
      context
    });
  };

  const counts = useMemo(() => ({
    favorites: library.favorites?.length || 0,
    recents: library.recents?.length || 0,
    maintenance: maintenanceIssues?.totalCount || 0,
    workbench: workbenchMangas.length || 0,
    vault: vault?.locked ? 0 : vault?.privateCount || 0
  }), [library, maintenanceIssues, vault, workbenchMangas.length]);

  if (readerState) {
    return (
      <>
        <KavitaReaderShell
          manga={currentManga}
          chapter={currentChapter}
          chapters={currentManga.chapters || []}
          annotations={annotations}
          tabs={tabs}
          activeTabId={activeTabId}
          initialPageIndex={activeView.pageIndex}
          autoHideUI={ui.autoHideReaderUI}
          readerSettings={ui.kavitaReaderSettings || {}}
          shortcuts={ui.keyboardShortcuts || {}}
          overlayPinned={Boolean(contextMenu)}
          onExit={actions.onReaderExit}
          onOpenChapter={actions.onOpenReaderChapter}
          onUpdateProgress={actions.onUpdateProgress}
          onReaderSettingsChange={actions.onReaderSettingsChange}
          onAddAnnotation={actions.onAddAnnotation}
          onDeleteAnnotation={actions.onDeleteAnnotation}
          onSelectTab={actions.onSelectTab}
          onCloseTab={actions.onCloseTab}
          onNewTab={actions.onNewTab}
          onReorderTabs={actions.onReorderTabs}
          onTabContextMenu={openContextMenu}
        />
        <KavitaContextMenu
          menu={contextMenu}
          actions={contextActions}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onEdit={(type, mangaId) => setEditor({ type, mangaId })}
          onOnlineMetadata={setOnlineMetadataMangaId}
          onClose={() => setContextMenu(null)}
          onError={setActionError}
        />
        {actionError ? <div className="kv-action-error" role="alert">{actionError}</div> : null}
      </>
    );
  }

  return (
    <div className={`kv-app theme-${ui.theme} ${collapsed ? 'is-sidebar-collapsed' : ''}`} data-interface="kavita">
      <header className="kv-topbar">
        <button type="button" className="kv-topbar-menu" onClick={() => setMobileSidebarOpen((value) => !value)} title="Menu"><Menu size={21} /></button>
        <button type="button" className="kv-brand" onClick={() => actions.onScreenChange('dashboard')}>
          <span><BookOpen size={18} /></span><strong>Sawa</strong>
        </button>
        <label className="kv-global-search">
          <Search size={17} />
          <input value={search} onChange={(event) => actions.onSearchChange(event.target.value)} placeholder="Rechercher dans Sawa..." />
          {search ? <button type="button" onClick={() => actions.onSearchChange('')}><X size={15} /></button> : null}
        </label>
        <div className="kv-topbar-status" title={syncStatus?.task || 'Taches en arriere-plan'}>
          <CircleGauge size={17} />
          <span>{syncStatus?.running ? 'Travail en cours' : 'A jour'}</span>
        </div>
        <button type="button" className="kv-topbar-action" onClick={() => actions.onSettingsOpenChange(true)} title="Parametres"><Settings size={19} /></button>
        <div className="kv-window-actions">
          <button type="button" onClick={() => window.mangaAPI.minimizeWindow()} title="Minimiser"><Minus size={17} /></button>
          <button type="button" onClick={() => window.mangaAPI.toggleMaximizeWindow()} title="Agrandir"><Square size={14} /></button>
          <button type="button" className="is-close" onClick={() => window.mangaAPI.closeWindow()} title="Fermer"><X size={17} /></button>
        </div>
      </header>

      <aside className={`kv-sidebar ${mobileSidebarOpen ? 'is-mobile-open' : ''}`}>
        <button type="button" className="kv-sidebar-collapse" onClick={() => actions.onUpdateSettings({ sidebarCollapsed: !collapsed })} title={collapsed ? 'Deployer' : 'Replier'}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <nav>
          {MAIN_NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              collapsed={collapsed}
              active={activeView.screen === 'library' && activeScreen === item.id}
              count={counts[item.id]}
              onClick={() => {
                actions.onScreenChange(item.id);
                setMobileSidebarOpen(false);
              }}
            />
          ))}
        </nav>
        <div className="kv-nav-separator" />
        {!collapsed ? <span className="kv-nav-label">Bibliotheques</span> : null}
        <nav className="kv-category-nav">
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={`kv-nav-button ${selectedCategoryId === category.id && activeScreen === 'library' ? 'is-active' : ''}`}
              onContextMenu={(event) => openContextMenu(event, { type: 'category', category })}
              onClick={() => {
                actions.onSelectCategory(category.id);
                actions.onScreenChange('library');
                setMobileSidebarOpen(false);
              }}
              title={collapsed ? category.name : undefined}
            >
              <Folder size={17} />
              {!collapsed ? <span>{category.name}</span> : null}
              {!collapsed ? <small>{category.mangas?.length || 0}</small> : null}
            </button>
          ))}
        </nav>
        <div className="kv-nav-separator" />
        <nav>
          {visibleToolNav.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              collapsed={collapsed}
              active={activeView.screen === 'library' && activeScreen === item.id}
              count={counts[item.id]}
              onClick={() => {
                actions.onScreenChange(item.id);
                setMobileSidebarOpen(false);
              }}
            />
          ))}
        </nav>
      </aside>

      <KavitaTabsBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={actions.onSelectTab}
        onCloseTab={actions.onCloseTab}
        onNewTab={actions.onNewTab}
        onReorderTabs={actions.onReorderTabs}
        onContextMenu={openContextMenu}
      />

      <main className="kv-main">
        {selectionMode && selectedCount > 0 ? (
          <div className="kv-selection-bar"><strong>{selectedCount} selectionne(s)</strong><button type="button" onClick={actions.onClearSelection}>Effacer</button></div>
        ) : null}

        {activeView.screen === 'library' && ['library', 'favorites', 'recents'].includes(activeScreen) ? (
          <KavitaLibraryView
            mangas={mangas}
            title={screenTitle}
            subtitle={searchResultsLabel}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onOpenManga={actions.onOpenManga}
            onOpenMangaInNewTab={actions.onOpenMangaInNewTab}
            onContextMenu={openContextMenu}
            onToggleFavorite={actions.onToggleFavorite}
            onToggleSelect={actions.onToggleSelect}
          />
        ) : null}

        {activeView.screen === 'library' && activeScreen === 'vault' ? (
          <KavitaVaultView
            vault={vault}
            mangas={vaultMangas}
            categories={vaultCategories}
            activeCategoryId={activeVaultCategoryId}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onSetupPin={actions.onSetupVault}
            onUnlock={actions.onUnlockVault}
            onLock={actions.onLockVault}
            onSelectCategory={actions.onSelectVaultCategory}
            onToggleSelectionMode={actions.onToggleSelectionMode}
            onToggleSelect={actions.onToggleSelect}
            onOpenManga={actions.onOpenManga}
            onOpenMangaInNewTab={actions.onOpenMangaInNewTab}
            onToggleFavorite={actions.onToggleFavorite}
            onContextMenu={openContextMenu}
            onToggleBlur={actions.onToggleVaultBlur}
            onToggleStealth={actions.onToggleVaultStealth}
          />
        ) : null}

        {activeView.screen === 'library' && !['library', 'favorites', 'recents', 'vault'].includes(activeScreen) ? (
          <KavitaToolsView
            screen={activeScreen}
            library={library}
            collections={collections}
            maintenanceIssues={maintenanceIssues}
            maintenanceStats={maintenanceStats}
            workbenchMangas={workbenchMangas}
            plugins={plugins}
            migrationStatus={migrationStatus}
            onOpenManga={actions.onOpenManga}
            onOpenMangaInNewTab={actions.onOpenMangaInNewTab}
            onContextMenu={openContextMenu}
            onForceRescan={actions.onForceRescan}
            onRunDeepScan={actions.onRunDeepScan}
            onRebuildDerivedData={actions.onRebuildDerivedData}
            onAnalyzeMigration={actions.onAnalyzeMigration}
            onRunMigration={actions.onRunMigration}
            onOpenSettings={() => actions.onSettingsOpenChange(true)}
          />
        ) : null}

        {activeView.screen === 'manga' && currentManga ? (
          <KavitaSeriesView
            manga={currentManga}
            annotations={annotations}
            onBack={actions.onBack}
            onResume={() => actions.onResumeManga(currentManga.id)}
            onOpenChapter={(chapterId) => actions.onOpenChapter(currentManga.id, chapterId, 0)}
            onOpenChapterInNewTab={(chapterId, options) => actions.onOpenChapterInNewTab(currentManga.id, chapterId, 0, options)}
            onToggleFavorite={actions.onToggleFavorite}
            collections={currentMangaCollections}
            onEditMetadata={() => setEditor({ type: 'metadata', mangaId: currentManga.id })}
            onManageTags={() => setEditor({ type: 'tags', mangaId: currentManga.id })}
            onAddToCollection={() => setEditor({ type: 'collections', mangaId: currentManga.id })}
            onContextMenu={openContextMenu}
          />
        ) : null}

        {activeView.screen === 'preview' && currentManga && currentChapter ? (
          <KavitaChapterView
            manga={currentManga}
            chapter={currentChapter}
            annotations={annotations}
            onBack={actions.onBack}
            onReadFrom={(pageIndex) => actions.onReadFrom(currentManga.id, currentChapter.id, pageIndex)}
            onReadFromInNewTab={(pageIndex, options) => actions.onReadFromInNewTab(currentManga.id, currentChapter.id, pageIndex, options)}
          />
        ) : null}
      </main>

      {settingsOpen ? (
        <KavitaSettingsPanel
          ui={ui}
          onChange={actions.onUpdateSettings}
          onRequestInterfaceMode={actions.onRequestInterfaceMode}
          onClose={() => actions.onSettingsOpenChange(false)}
        />
      ) : null}
      <KavitaEditorDialog
        editor={editor}
        manga={editorManga}
        tags={tags}
        collections={collections}
        onClose={() => setEditor(null)}
        onSaveMetadata={actions.onSaveMetadata}
        onToggleTag={actions.onToggleTag}
        onCreateTag={actions.onCreateTag}
        onDeleteTag={actions.onDeleteTag}
        onAddToCollection={actions.onAddToCollection}
        onRemoveFromCollection={actions.onRemoveFromCollection}
        onCreateCollection={actions.onCreateCollection}
      />
      <KavitaOnlineMetadataDialog
        manga={onlineMetadataManga}
        onClose={() => setOnlineMetadataMangaId(null)}
        onSearch={onSearchOnlineMetadata}
        onImport={onImportOnlineMetadata}
      />
      <KavitaContextMenu
        menu={contextMenu}
        actions={contextActions}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onEdit={(type, mangaId) => setEditor({ type, mangaId })}
        onOnlineMetadata={setOnlineMetadataMangaId}
        onClose={() => setContextMenu(null)}
        onError={setActionError}
      />
      {actionError ? (
        <div className="kv-action-error" role="alert">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} title="Fermer"><X size={15} /></button>
        </div>
      ) : null}
    </div>
  );
}

export default memo(KavitaShell);
