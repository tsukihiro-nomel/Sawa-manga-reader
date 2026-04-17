import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import LibraryView from './components/LibraryView.jsx';
import MangaDetailView from './components/MangaDetailView.jsx';
import ChapterPreviewView from './components/ChapterPreviewView.jsx';
import ReaderView from './components/ReaderView.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import Dashboard from './components/Dashboard.jsx';
import CollectionsView from './components/CollectionsView.jsx';
import TagManagerModal from './components/TagManagerModal.jsx';
import BulkActionBar from './components/BulkActionBar.jsx';
import MaintenanceView from './components/MaintenanceView.jsx';
import MetadataWorkbenchView from './components/MetadataWorkbenchView.jsx';
import VaultView from './components/VaultView.jsx';
import BatchPickerModal from './components/BatchPickerModal.jsx';
import MetadataEditorModal from './components/MetadataEditorModal.jsx';
import ReadingQueueDrawer from './components/ReadingQueueDrawer.jsx';
import {
  AlertIcon,
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BookIcon,
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  FolderPlusIcon,
  FullscreenIcon,
  HeartIcon,
  LayoutGridIcon,
  LibraryIcon,
  PlusIcon,
  PinIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TagIcon,
  LayersIcon,
  TrashIcon
} from './components/Icons.jsx';
import {
  applySearchQuery,
  buildSmartCollectionFromSearch,
  formatSearchChips,
  parseSearchQuery,
  sortMangas
} from './utils/reader.js';

function sanitizeReaderState(state = null) {
  if (!state || typeof state !== 'object') return null;
  const zoom = Number(state.zoom);
  const scrollTop = Number(state.scrollTop);
  const scrollRatio = Number(state.scrollRatio);
  return {
    mode: typeof state.mode === 'string' ? state.mode : null,
    fitMode: typeof state.fitMode === 'string' ? state.fitMode : null,
    zoom: Number.isFinite(zoom) ? zoom : null,
    scrollTop: Number.isFinite(scrollTop) ? scrollTop : 0,
    scrollRatio: Number.isFinite(scrollRatio) ? scrollRatio : 0
  };
}

function normalizeView(view = {}) {
  const normalizedReaderState = sanitizeReaderState(view?.readerState);
  return {
    screen: 'library',
    mangaId: null,
    chapterId: null,
    pageIndex: 0,
    ...view,
    readerState: normalizedReaderState
  };
}

let tabSequence = 0;
function createTab(initialView, seedStack = [], options = {}) {
  tabSequence += 1;
  return {
    id: `tab-${Date.now()}-${tabSequence}`,
    pinned: false,
    incognito: Boolean(options?.incognito),
    stack: [...seedStack.map(normalizeView), normalizeView(initialView)]
  };
}

const INITIAL_TAB = createTab(normalizeView());
const MAX_WORKSPACES = 8;
const WORKSPACE_ICON_KEYS = ['home', 'library', 'layout', 'scroll', 'heart', 'sparkles', 'layers', 'book'];
let workspaceSequence = 0;

function defaultWorkspaceName(index) {
  return `Espace ${index + 1}`;
}

function nextWorkspaceId() {
  workspaceSequence += 1;
  return `workspace-${Date.now()}-${workspaceSequence}`;
}

function sanitizeTab(candidate, fallbackIdPrefix = 'restored') {
  const stack = Array.isArray(candidate?.stack) && candidate.stack.length > 0
    ? candidate.stack.map(normalizeView)
    : [normalizeView()];

  return {
    id: typeof candidate?.id === 'string' && candidate.id.trim()
      ? candidate.id
      : `${fallbackIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pinned: Boolean(candidate?.pinned),
    incognito: Boolean(candidate?.incognito),
    stack
  };
}

function sanitizeWorkspace(candidate, index = 0) {
  const id = typeof candidate?.id === 'string' && candidate.id.trim()
    ? candidate.id
    : nextWorkspaceId();

  const name = typeof candidate?.name === 'string' && candidate.name.trim()
    ? candidate.name.trim()
    : defaultWorkspaceName(index);

  const iconKey = WORKSPACE_ICON_KEYS.includes(candidate?.iconKey)
    ? candidate.iconKey
    : WORKSPACE_ICON_KEYS[index % WORKSPACE_ICON_KEYS.length];

  const tabs = Array.isArray(candidate?.tabs) && candidate.tabs.length > 0
    ? candidate.tabs.map((tab, tabIndex) => sanitizeTab(tab, `${id}-${tabIndex}`))
    : [createTab(normalizeView())];

  const activeTabId = tabs.some((tab) => tab.id === candidate?.activeTabId)
    ? candidate.activeTabId
    : tabs[0].id;

  return {
    id,
    name,
    iconKey,
    tabs,
    activeTabId
  };
}

function createWorkspace(index = 0, overrides = {}) {
  return sanitizeWorkspace({
    id: nextWorkspaceId(),
    name: defaultWorkspaceName(index),
    iconKey: WORKSPACE_ICON_KEYS[index % WORKSPACE_ICON_KEYS.length],
    tabs: [createTab(normalizeView())],
    ...overrides
  }, index);
}

const INITIAL_WORKSPACE = createWorkspace(0, {
  tabs: [INITIAL_TAB],
  activeTabId: INITIAL_TAB.id
});

function restoreSessionModel(session) {
  if (session?.version === 2 && Array.isArray(session?.workspaces) && session.workspaces.length > 0) {
    const restoredWorkspaces = session.workspaces
      .slice(0, MAX_WORKSPACES)
      .map((workspace, index) => sanitizeWorkspace(workspace, index));

    return {
      workspaces: restoredWorkspaces,
      activeWorkspaceId: restoredWorkspaces.some((workspace) => workspace.id === session?.activeWorkspaceId)
        ? session.activeWorkspaceId
        : restoredWorkspaces[0].id
    };
  }

  const restoredTabs = Array.isArray(session?.tabs) && session.tabs.length > 0
    ? session.tabs.map((tab, index) => sanitizeTab(tab, `restored-${index}`))
    : [createTab(normalizeView())];

  const restoredActiveTabId = restoredTabs.some((tab) => tab.id === session?.activeTabId)
    ? session.activeTabId
    : restoredTabs[0].id;

  const defaultWorkspace = sanitizeWorkspace({
    id: nextWorkspaceId(),
    name: defaultWorkspaceName(0),
    iconKey: WORKSPACE_ICON_KEYS[0],
    tabs: restoredTabs,
    activeTabId: restoredActiveTabId
  }, 0);

  return {
    workspaces: [defaultWorkspace],
    activeWorkspaceId: defaultWorkspace.id
  };
}

function getTabView(tab) {
  return tab?.stack?.[tab.stack.length - 1] ?? normalizeView();
}

function matchesEntityReference(entity, reference) {
  const needle = String(reference || '').trim();
  if (!needle) return false;
  return [entity?.id, entity?.contentId, entity?.locationId].some((value) => String(value || '').trim() === needle);
}

function findManga(library, mangaId) {
  return library.allMangas.find((manga) => matchesEntityReference(manga, mangaId)) ?? null;
}

function findChapter(library, mangaId, chapterId) {
  const manga = findManga(library, mangaId);
  if (!manga) return { manga: null, chapter: null };
  const chapter = manga.chapters.find((item) => matchesEntityReference(item, chapterId)) ?? null;
  return { manga, chapter };
}

function chapterTargetView(ui, mangaId, chapterId, pageIndex = 0) {
  return ui.showPagePreviewBeforeReading
    ? { screen: 'preview', mangaId, chapterId, pageIndex: 0 }
    : { screen: 'reader', mangaId, chapterId, pageIndex };
}

function makeViewScrollKey(tabId, view, activeScreen = 'library', selectedCategoryId = null) {
  const screen = view?.screen || 'library';
  const mangaId = view?.mangaId || 'none';
  const chapterId = view?.chapterId || 'none';
  return `${tabId}:${screen}:${mangaId}:${chapterId}:${activeScreen}:${selectedCategoryId ?? 'all'}`;
}

function normalizeThemeName(theme) {
  if (theme === 'dark') return 'dark-night';
  if (theme === 'light') return 'light-paper';
  return theme || 'dark-night';
}

function cardSizeMinWidth(cardSize) {
  if (cardSize === 'compact') return '180px';
  if (cardSize === 'large') return '320px';
  return '240px';
}

function cardSizeGridGap(cardSize) {
  if (cardSize === 'compact') return '14px';
  if (cardSize === 'large') return '22px';
  return '18px';
}

function buildMangaAggregate(manga) {
  const chapters = Array.isArray(manga?.chapters) ? manga.chapters : [];
  const completedChapterCount = chapters.filter((chapter) => chapter.isRead).length;
  const progressUnits = chapters.reduce((sum, chapter) => {
    if (chapter.isRead) return sum + 1;
    if (chapter.progress?.pageCount) {
      const ratio = Math.max(0, Math.min(1, (chapter.progress.pageIndex + 1) / chapter.progress.pageCount));
      return sum + ratio;
    }
    return sum;
  }, 0);
  const progressPercent = chapters.length
    ? Math.max(0, Math.min(100, Math.round((progressUnits / chapters.length) * 100)))
    : 0;
  return {
    ...manga,
    completedChapterCount,
    progressPercent,
    isRead: chapters.length > 0 && completedChapterCount === chapters.length,
    progress: {
      percent: progressPercent,
      completedChapterCount,
      totalChapterCount: chapters.length,
      lastChapterId: manga?.lastProgress?.chapterId ?? null
    }
  };
}

export default function App() {
  const [payload, setPayload] = useState(null);
  const [workspaces, setWorkspaces] = useState([INITIAL_WORKSPACE]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(INITIAL_WORKSPACE.id);
  const [activeScreen, setActiveScreen] = useState('library');
  const [vaultCategoryFilterId, setVaultCategoryFilterId] = useState(null);
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(null);
  const [tagManagerManga, setTagManagerManga] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [collectionPickerManga, setCollectionPickerManga] = useState(null);
  const [metadataSearchManga, setMetadataSearchManga] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMangaIds, setSelectedMangaIds] = useState([]);
  const [maintenanceStats, setMaintenanceStats] = useState(null);
  const [batchCollectionOpen, setBatchCollectionOpen] = useState(false);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [requestedCollectionId, setRequestedCollectionId] = useState(null);
  const [requestedCollectionsTab, setRequestedCollectionsTab] = useState('manual');
  const [chapterPagesCache, setChapterPagesCache] = useState({});
  const [bootError, setBootError] = useState('');
  const [readingQueueOpen, setReadingQueueOpen] = useState(false);
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);
  const [panicSession, setPanicSession] = useState('inactive');
  const scrollPositionsRef = useRef({});

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? INITIAL_WORKSPACE,
    [workspaces, activeWorkspaceId]
  );

  const tabs = activeWorkspace?.tabs ?? [INITIAL_TAB];
  const activeTabId = activeWorkspace?.activeTabId ?? tabs[0]?.id ?? INITIAL_TAB.id;

  const setTabs = useCallback((updater) => {
    setWorkspaces((prev) => prev.map((workspace) => {
      if (workspace.id !== activeWorkspaceId) return workspace;

      const nextTabsRaw = typeof updater === 'function' ? updater(workspace.tabs) : updater;
      const nextTabs = Array.isArray(nextTabsRaw) && nextTabsRaw.length > 0
        ? nextTabsRaw.map((tab, index) => sanitizeTab(tab, `${workspace.id}-${index}`))
        : [createTab(normalizeView())];

      const nextActiveTabId = nextTabs.some((tab) => tab.id === workspace.activeTabId)
        ? workspace.activeTabId
        : nextTabs[0].id;

      return {
        ...workspace,
        tabs: nextTabs,
        activeTabId: nextActiveTabId
      };
    }));
  }, [activeWorkspaceId]);

  const setActiveTabId = useCallback((nextActiveTabId) => {
    setWorkspaces((prev) => prev.map((workspace) => {
      if (workspace.id !== activeWorkspaceId) return workspace;
      const requestedId = typeof nextActiveTabId === 'function'
        ? nextActiveTabId(workspace.activeTabId)
        : nextActiveTabId;
      const resolvedActiveTabId = workspace.tabs.some((tab) => tab.id === requestedId)
        ? requestedId
        : workspace.tabs[0]?.id ?? workspace.activeTabId;
      return {
        ...workspace,
        activeTabId: resolvedActiveTabId
      };
    }));
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (workspaces.some((workspace) => workspace.id === activeWorkspaceId)) return;
    const fallbackWorkspaceId = workspaces[0]?.id;
    if (fallbackWorkspaceId) setActiveWorkspaceId(fallbackWorkspaceId);
  }, [workspaces, activeWorkspaceId]);

  useEffect(() => {
    let unsubscribe = () => {};
    let disposed = false;
    const signalBootReady = () => {
      try {
        window.mangaAPI?.signalBootReady?.();
      } catch (_error) {
        // Renderer boot should stay resilient even if IPC is unavailable.
      }
    };

    async function boot() {
      try {
        const nextPayload = await window.mangaAPI.bootstrap();
        if (disposed) return;
        setBootError('');
        setPayload(nextPayload);
        const restoredSession = restoreSessionModel(nextPayload?.persisted?.session);
        setWorkspaces(restoredSession.workspaces);
        setActiveWorkspaceId(restoredSession.activeWorkspaceId);
        setPanicSession('inactive');
        unsubscribe = window.mangaAPI.onLibraryChanged((incoming) => {
          if (!disposed) setPayload(incoming);
        });
        signalBootReady();
      } catch (error) {
        if (!disposed) {
          setBootError(error?.message || 'Impossible de charger la bibliotheque.');
        }
        signalBootReady();
      }
    }

    boot();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!payload) return;

    const serializableWorkspaces = workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      iconKey: workspace.iconKey,
      activeTabId: workspace.activeTabId,
      tabs: workspace.tabs.map((tab) => ({
        id: tab.id,
        pinned: Boolean(tab.pinned),
        incognito: Boolean(tab.incognito),
        stack: tab.stack.map(normalizeView)
      }))
    }));

    const timer = window.setTimeout(() => {
      window.mangaAPI.saveTabsSession({
        version: 2,
        activeWorkspaceId,
        workspaces: serializableWorkspaces
      }).catch(() => {
        // Le stockage de session ne doit jamais casser l'UI.
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [payload, workspaces, activeWorkspaceId]);

  useEffect(() => {
    if (panicSession !== 'recovered') return undefined;
    const timer = window.setTimeout(() => {
      setPanicSession('inactive');
    }, 120);
    return () => window.clearTimeout(timer);
  }, [panicSession]);

  const theme = normalizeThemeName(payload?.persisted.ui.theme);
  const ui = {
    ...(payload?.persisted.ui ?? {}),
    theme
  };
  const library = payload?.library ?? { categories: [], allMangas: [], favorites: [], recents: [] };

  const selectedCategoryId = payload?.persisted.ui.selectedCategoryId ?? null;
  const selectedCategory = library.categories.find((category) => category.id === selectedCategoryId) ?? null;

  const visibleCategories = useMemo(() => {
    return library.categories.filter((category) => !category.hidden);
  }, [library.categories]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? INITIAL_TAB;
  const activeView = getTabView(activeTab);
  const activeScrollCategoryId = activeScreen === 'vault' ? vaultCategoryFilterId : selectedCategoryId;
  const activeScrollKey = useMemo(() => makeViewScrollKey(activeTab?.id || 'tab', activeView, activeScreen, activeScrollCategoryId), [activeTab?.id, activeView, activeScreen, activeScrollCategoryId]);
  const activeInitialScrollTop = scrollPositionsRef.current[activeScrollKey] ?? 0;
  const captureCurrentViewScroll = useCallback(() => {
    const currentScrollable = document.querySelector('.library-view, .detail-view, .preview-view, .dashboard-view, .collections-view, .vault-view');
    if (currentScrollable) {
      scrollPositionsRef.current[activeScrollKey] = currentScrollable.scrollTop || 0;
    }
  }, [activeScrollKey]);

  const baseMangas = useMemo(() => {
    if (activeScreen === 'favorites') return library.favorites;
    if (activeScreen === 'recents') {
      const seen = new Set();
      return library.recents
        .map((recent) => findManga(library, recent.mangaId))
        .filter((manga) => {
          if (!manga || seen.has(manga.id)) return false;
          seen.add(manga.id);
          return true;
        });
    }
    return library.allMangas;
  }, [activeScreen, library]);

  const parsedSearch = useMemo(() => parseSearchQuery(search), [search]);

  const filteredMangas = useMemo(() => {
    const byCategory = baseMangas.filter((manga) => {
      if (!ui.showHiddenCategories && manga.categoryHidden) return false;
      if (selectedCategory && manga.categoryId !== selectedCategory.id) return false;
      return true;
    });
    const bySearch = applySearchQuery(byCategory, parsedSearch, {
      collectionsById: payload?.persisted?.collections || {}
    });
    return sortMangas(bySearch, ui.sort);
  }, [baseMangas, parsedSearch, payload?.persisted?.collections, ui.showHiddenCategories, ui.sort, selectedCategory]);

  const searchChips = useMemo(
    () => formatSearchChips(parsedSearch, { collectionsById: payload?.persisted?.collections || {} }),
    [parsedSearch, payload?.persisted?.collections]
  );

  const allCollections = useMemo(
    () => Object.values(payload?.persisted?.collections ?? {}),
    [payload?.persisted?.collections]
  );

  const allTags = useMemo(
    () => Object.values(payload?.persisted?.tags ?? {}),
    [payload?.persisted?.tags]
  );

  const sidebarPins = useMemo(
    () => (Array.isArray(ui.sidebarPins) ? ui.sidebarPins : []),
    [ui.sidebarPins]
  );

  const selectedMangaIdSet = useMemo(
    () => new Set(selectedMangaIds),
    [selectedMangaIds]
  );

  const vaultLibrary = payload?.vaultLibrary ?? { categories: [], allMangas: [], favorites: [], recents: [] };
  const selectableMangas = useMemo(() => {
    const merged = new Map();
    [...(library.allMangas || []), ...(vaultLibrary.allMangas || [])].forEach((manga) => {
      if (manga?.id && !merged.has(manga.id)) merged.set(manga.id, manga);
    });
    return [...merged.values()];
  }, [library.allMangas, vaultLibrary.allMangas]);
  const entityLibrary = useMemo(
    () => ({ allMangas: selectableMangas }),
    [selectableMangas]
  );
  const selectedMangas = useMemo(
    () => selectableMangas.filter((manga) => selectedMangaIdSet.has(manga.id)),
    [selectableMangas, selectedMangaIdSet]
  );

  const vaultState = payload?.persisted?.vault ?? {
    configured: false,
    locked: true,
    blurCovers: true,
    privateCount: 0,
    privateCategoryCount: 0,
    privateMangaIds: [],
    privateCategoryIds: [],
    autoLockOnClose: true,
    securityMode: 'none',
    systemProtectionAvailable: false,
    stealthMode: false
  };
  const vaultCategories = useMemo(
    () => (Array.isArray(vaultLibrary.categories) ? vaultLibrary.categories : []),
    [vaultLibrary.categories]
  );
  const activeVaultCategory = useMemo(
    () => vaultCategories.find((category) => category.id === vaultCategoryFilterId) ?? null,
    [vaultCategories, vaultCategoryFilterId]
  );

  const workbenchQueueIds = payload?.persisted?.metadataWorkbenchQueue ?? [];
  const workbenchQueueMangas = useMemo(
    () => workbenchQueueIds.map((mangaId) => findManga(entityLibrary, mangaId)).filter(Boolean),
    [entityLibrary, workbenchQueueIds]
  );

  const privateMangas = useMemo(
    () => {
      const mangas = Array.isArray(vaultLibrary.allMangas) ? vaultLibrary.allMangas : [];
      if (!vaultCategoryFilterId) return mangas;
      return mangas.filter((manga) => manga.categoryId === vaultCategoryFilterId);
    },
    [vaultCategoryFilterId, vaultLibrary.allMangas]
  );
  const filteredPrivateMangas = useMemo(() => {
    const bySearch = applySearchQuery(privateMangas, parsedSearch, {
      collectionsById: payload?.persisted?.collections || {}
    });
    return sortMangas(bySearch, ui.sort);
  }, [privateMangas, parsedSearch, payload?.persisted?.collections, ui.sort]);

  const readingQueue = payload?.persisted?.readingQueue ?? [];
  const readingQueueEntries = useMemo(() => {
    return readingQueue.map((entry, index) => {
      const manga = findManga(library, entry.mangaContentId || entry.mangaId)
        || findManga(vaultLibrary, entry.mangaContentId || entry.mangaId)
        || findManga({ allMangas: selectableMangas }, entry.mangaContentId || entry.mangaId);
      if (!manga) return null;

      const chapter = entry.chapterContentId || entry.chapterId
        ? (manga.chapters || []).find((item) => matchesEntityReference(item, entry.chapterContentId || entry.chapterId)) || null
        : null;

      return {
        key: `${entry.mangaId}:${entry.chapterId || 'manga'}:${index}`,
        raw: entry,
        manga,
        chapter,
        mangaId: manga.id,
        chapterId: chapter?.id || null,
        title: manga.displayTitle,
        subtitle: chapter?.name || manga.author || manga.categoryName || 'Manga',
        displaySource: entry.displaySource || 'manual',
        pinned: Boolean(entry.pinned),
        deferredUntil: entry.deferredUntil || null
      };
    }).filter(Boolean);
  }, [readingQueue, library, vaultLibrary, selectableMangas]);

  useEffect(() => {
    if (vaultCategoryFilterId && !vaultCategories.some((category) => category.id === vaultCategoryFilterId)) {
      setVaultCategoryFilterId(null);
    }
  }, [vaultCategories, vaultCategoryFilterId]);

  const maintenanceIssues = useMemo(() => {
    const missingCover = [];
    const missingMetadata = [];
    const sparseChapters = [];
    const duplicateMap = new Map();

    library.allMangas.forEach((manga) => {
      const displayTitle = manga.displayTitle || manga.name || 'Manga';
      const normalizedTitle = displayTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

      if (normalizedTitle) {
        const group = duplicateMap.get(normalizedTitle) ?? [];
        group.push(manga);
        duplicateMap.set(normalizedTitle, group);
      }

      if (!manga.coverSrc || manga.coverType === 'default') {
        missingCover.push(manga);
      }

      const hasAuthor = typeof manga.author === 'string' && manga.author.trim();
      const hasDescription = typeof manga.description === 'string' && manga.description.trim();
      if (!hasAuthor || !hasDescription) {
        missingMetadata.push(manga);
      }

      const chapters = Array.isArray(manga.chapters) ? manga.chapters : [];
      if (!chapters.length) {
        sparseChapters.push({ manga, reason: 'Aucun chapitre detecte dans ce dossier.' });
        return;
      }

      const emptyChapter = chapters.find((chapter) => !chapter.pageCount || chapter.pageCount <= 0);
      if (emptyChapter) {
        sparseChapters.push({
          manga,
          reason: `${emptyChapter.name || 'Chapitre'} semble vide ou incomplet.`
        });
      }
    });

    const duplicateGroups = [...duplicateMap.entries()]
      .filter(([, mangas]) => mangas.length > 1)
      .map(([key, mangas]) => ({
        key,
        mangas,
        label: mangas[0]?.displayTitle || mangas[0]?.name || 'Titre proche'
      }));

    return {
      missingCover,
      missingMetadata,
      sparseChapters,
      duplicateGroups
    };
  }, [library.allMangas]);

  const maintenanceCount = (
    maintenanceIssues.missingCover.length
    + maintenanceIssues.missingMetadata.length
    + maintenanceIssues.sparseChapters.length
    + maintenanceIssues.duplicateGroups.length
  );

  const dashboardMangas = useMemo(
    () => library.allMangas.filter((manga) => !manga.categoryHidden),
    [library.allMangas]
  );

  const dashboardFavorites = useMemo(
    () => library.favorites.filter((manga) => !manga.categoryHidden),
    [library.favorites]
  );

  const currentManga = activeView.mangaId ? findManga(entityLibrary, activeView.mangaId) : null;
  const currentChapterData = activeView.chapterId && currentManga
    ? {
      manga: currentManga,
      chapter: (currentManga.chapters || []).find((item) => matchesEntityReference(item, activeView.chapterId)) ?? null
    }
    : { manga: currentManga, chapter: null };

  const resolvedChapter = currentChapterData.chapter
    ? (() => {
        const resolvedPages = chapterPagesCache[currentChapterData.chapter.id] ?? currentChapterData.chapter.pages;
        return {
          ...currentChapterData.chapter,
          pages: resolvedPages,
          pageCount: Array.isArray(resolvedPages) && resolvedPages.length > 0
            ? resolvedPages.length
            : currentChapterData.chapter.pageCount
        };
      })()
    : null;

  const currentMangaAnnotations = useMemo(
    () => (currentManga ? (payload?.persisted?.annotations?.[currentManga.id] ?? []) : []),
    [payload?.persisted?.annotations, currentManga]
  );

  useEffect(() => {
    if (!payload) return;
    const visibleIds = new Set(library.allMangas.map((manga) => manga.id));
    setSelectedMangaIds((prev) => {
      const next = prev.filter((mangaId) => visibleIds.has(mangaId));
      return next.length === prev.length ? prev : next;
    });
  }, [payload, library.allMangas]);

  useEffect(() => {
    if (!payload || activeScreen !== 'maintenance') return;
    let disposed = false;
    window.mangaAPI.getStats().then((stats) => {
      if (!disposed) setMaintenanceStats(stats);
    }).catch(() => {
      if (!disposed) setMaintenanceStats(null);
    });
    return () => {
      disposed = true;
    };
  }, [payload, activeScreen]);

  useEffect(() => {
    if (!currentChapterData.chapter?.path) return;
    if (!(activeView.screen === 'preview' || activeView.screen === 'reader')) return;
    if (chapterPagesCache[currentChapterData.chapter.id]) return;

    let disposed = false;
    window.mangaAPI.getChapterPages(currentChapterData.chapter.path).then((pages) => {
      if (disposed) return;
      setChapterPagesCache((prev) => (prev[currentChapterData.chapter.id] ? prev : {
        ...prev,
        [currentChapterData.chapter.id]: pages
      }));

      if (Array.isArray(pages) && pages.length > 0) {
        setPayload((prev) => {
          if (!prev?.library) return prev;
          const nextPageCount = pages.length;
          const applyMangaUpdate = (manga) => {
            if (!manga?.chapters?.some((chapter) => chapter.id === currentChapterData.chapter.id)) return manga;
            const chapters = manga.chapters.map((chapter) => chapter.id === currentChapterData.chapter.id
              ? { ...chapter, pageCount: nextPageCount }
              : chapter);
            return buildMangaAggregate({
              ...manga,
              chapters,
              pageCount: chapters.reduce((sum, chapter) => sum + (chapter.pageCount || 0), 0)
            });
          };

          return {
            ...prev,
            library: {
              ...prev.library,
              allMangas: prev.library.allMangas.map(applyMangaUpdate),
              favorites: prev.library.favorites.map(applyMangaUpdate),
              categories: prev.library.categories.map((category) => ({
                ...category,
                mangas: category.mangas.map(applyMangaUpdate)
              }))
            }
          };
        });
      }
    }).catch(() => {
      // Un échec de préchargement ne doit pas casser l'écran.
    });

    return () => {
      disposed = true;
    };
  }, [activeView.screen, currentChapterData.chapter?.id, currentChapterData.chapter?.path, chapterPagesCache[currentChapterData.chapter?.id]]);

  const tabsMeta = useMemo(() => {
    return tabs.map((tab) => {
      const view = getTabView(tab);
      const manga = view.mangaId ? findManga(entityLibrary, view.mangaId) : null;
      const chapter = view.chapterId && manga
        ? manga.chapters.find((item) => matchesEntityReference(item, view.chapterId)) ?? null
        : null;

      if (view.screen === 'library') {
        const screenLabels = {
          dashboard: 'Dashboard',
          library: 'Bibliotheque',
          collections: 'Collections',
          favorites: 'Favoris',
          recents: 'Recents',
          maintenance: 'Entretien',
          workbench: 'Atelier',
          vault: 'Coffre'
        };
        const screenSubtitles = {
          dashboard: 'Vue d ensemble',
          collections: 'Collections et vues intelligentes',
          favorites: 'Tes favoris',
          recents: 'Dernieres lectures',
          maintenance: 'Centre d entretien',
          workbench: 'Metadata et covers en lot',
          vault: 'Zone privee'
        };
        return {
          id: tab.id,
          kind: 'library',
          pinned: Boolean(tab.pinned),
          label: screenLabels[activeScreen] || 'Bibliotheque',
          subtitle: screenSubtitles[activeScreen] || selectedCategory?.name || 'Toute la bibliotheque'
        };
      }

      if (view.screen === 'manga') {
        return {
          id: tab.id,
          kind: 'manga',
          pinned: Boolean(tab.pinned),
          label: manga?.displayTitle ?? 'Manga',
          subtitle: manga?.author || 'Détails du manga'
        };
      }

      if (view.screen === 'preview') {
        return {
          id: tab.id,
          kind: 'preview',
          pinned: Boolean(tab.pinned),
          label: manga?.displayTitle ?? 'Aperçu',
          subtitle: chapter?.name ?? 'Aperçu du chapitre'
        };
      }

      return {
        id: tab.id,
        kind: 'reader',
        pinned: Boolean(tab.pinned),
        label: manga?.displayTitle ?? 'Lecture',
        subtitle: chapter?.name ?? 'Mode lecture'
      };
    });
  }, [tabs, entityLibrary, activeScreen, selectedCategory]);

  const activeTabMeta = useMemo(
    () => tabsMeta.find((tab) => tab.id === activeTabId) ?? tabsMeta[0] ?? null,
    [tabsMeta, activeTabId]
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    const dismiss = () => closeContextMenu();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeContextMenu();
    };

    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeContextMenu]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      let handled = false;
      if (readingQueueOpen) {
        setReadingQueueOpen(false);
        handled = true;
      }
      if (searchHelpOpen) {
        setSearchHelpOpen(false);
        handled = true;
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [readingQueueOpen, searchHelpOpen]);

  async function refreshWith(promise) {
    const nextPayload = await promise;
    setPayload(nextPayload);
  }

  function pushViewToActive(nextView) {
    captureCurrentViewScroll();
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== activeTabId) return tab;
      return {
        ...tab,
        stack: [...tab.stack, normalizeView(nextView)]
      };
    }));
  }

  function replaceActiveView(nextView) {
    captureCurrentViewScroll();
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== activeTabId) return tab;
      const stack = [...tab.stack];
      stack[stack.length - 1] = normalizeView(nextView);
      return { ...tab, stack };
    }));
  }

  function popActiveView() {
    captureCurrentViewScroll();
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== activeTabId) return tab;
      if (tab.stack.length <= 1) {
        return { ...tab, stack: [normalizeView()] };
      }
      return { ...tab, stack: tab.stack.slice(0, -1) };
    }));
  }

  function openNewTab(nextView, seedStack = [], options = {}) {
    captureCurrentViewScroll();
    const newTab = createTab(nextView, seedStack, options);
    const shouldActivate = options.activate !== false;
    setTabs((prev) => [...prev, newTab]);
    if (shouldActivate) {
      setActiveTabId(newTab.id);
    }
    return newTab.id;
  }

  function openNewLibraryTab(options = {}) {
    openNewTab(normalizeView(), [], options);
  }

  function switchWorkspace(workspaceId) {
    if (!workspaceId || workspaceId === activeWorkspaceId) return;
    captureCurrentViewScroll();
    setActiveWorkspaceId(workspaceId);
  }

  function createWorkspaceFromUI() {
    if (workspaces.length >= MAX_WORKSPACES) {
      window.alert(`Limite atteinte: ${MAX_WORKSPACES} espaces maximum.`);
      return null;
    }

    const nextWorkspace = createWorkspace(workspaces.length);
    setWorkspaces((prev) => [...prev, nextWorkspace]);
    captureCurrentViewScroll();
    setActiveWorkspaceId(nextWorkspace.id);
    return nextWorkspace.id;
  }

  function renameWorkspace(workspaceId) {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    const proposedName = window.prompt("Nouveau nom de l'espace:", workspace.name);
    if (proposedName === null) return;
    const nextName = proposedName.trim();
    if (!nextName) return;
    setWorkspaces((prev) => prev.map((item) => (item.id === workspaceId ? { ...item, name: nextName } : item)));
  }

  function deleteWorkspace(workspaceId) {
    if (workspaces.length <= 1) {
      window.alert('Impossible de supprimer le dernier espace.');
      return;
    }

    const workspaceIndex = workspaces.findIndex((workspace) => workspace.id === workspaceId);
    if (workspaceIndex === -1) return;
    const workspace = workspaces[workspaceIndex];
    const confirmed = window.confirm(`Supprimer l'espace "${workspace.name}" ?`);
    if (!confirmed) return;

    const fallbackWorkspaceId = workspaces[workspaceIndex - 1]?.id
      ?? workspaces[workspaceIndex + 1]?.id
      ?? workspaces[0]?.id
      ?? null;

    setWorkspaces((prev) => prev.filter((item) => item.id !== workspaceId));
    if (activeWorkspaceId === workspaceId && fallbackWorkspaceId) {
      setActiveWorkspaceId(fallbackWorkspaceId);
    }
  }

  function toggleTabPin(tabId) {
    setTabs((prev) => {
      const tabIndex = prev.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) return prev;

      const currentTab = prev[tabIndex];
      const toggledTab = { ...currentTab, pinned: !currentTab.pinned };
      const remainingTabs = prev.filter((tab) => tab.id !== tabId);
      const nextTabs = [...remainingTabs];

      if (toggledTab.pinned) {
        const firstUnpinnedIndex = remainingTabs.findIndex((tab) => !tab.pinned);
        const insertIndex = firstUnpinnedIndex === -1 ? remainingTabs.length : firstUnpinnedIndex;
        nextTabs.splice(insertIndex, 0, toggledTab);
      } else {
        const pinnedCount = remainingTabs.filter((tab) => tab.pinned).length;
        nextTabs.splice(pinnedCount, 0, toggledTab);
      }

      return nextTabs;
    });
  }

  function duplicateTab(tabId) {
    const sourceTab = tabs.find((tab) => tab.id === tabId);
    if (!sourceTab) return;
    const duplicate = {
      ...sourceTab,
      id: createTab(normalizeView()).id,
      incognito: Boolean(sourceTab.incognito),
      stack: sourceTab.stack.map((view) => normalizeView(view))
    };
    const sourceIndex = tabs.findIndex((tab) => tab.id === tabId);
    setTabs((prev) => {
      const next = [...prev];
      next.splice(sourceIndex + 1, 0, duplicate);
      return next;
    });
    setActiveTabId(duplicate.id);
  }

  function closeOtherTabs(tabId) {
    const selected = tabs.find((tab) => tab.id === tabId);
    if (!selected) return;
    const nextTabs = tabs.filter((tab) => tab.id === tabId || tab.pinned);
    setTabs(nextTabs);
    setActiveTabId(tabId);
  }

  function closeTabsToRight(tabId) {
    const selectedIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (selectedIndex === -1) return;
    const nextTabs = tabs.filter((tab, index) => index <= selectedIndex || tab.pinned);
    setTabs(nextTabs);
    if (!nextTabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabId);
    }
  }

  function moveTabToWorkspace(tabId, targetWorkspaceId) {
    if (!tabId || !targetWorkspaceId) return;

    setWorkspaces((prev) => {
      const sourceWorkspaceIndex = prev.findIndex((workspace) => workspace.tabs.some((tab) => tab.id === tabId));
      const targetWorkspaceIndex = prev.findIndex((workspace) => workspace.id === targetWorkspaceId);
      if (sourceWorkspaceIndex === -1 || targetWorkspaceIndex === -1 || sourceWorkspaceIndex === targetWorkspaceIndex) {
        return prev;
      }

      const sourceWorkspace = prev[sourceWorkspaceIndex];
      const sourceTabIndex = sourceWorkspace.tabs.findIndex((tab) => tab.id === tabId);
      if (sourceTabIndex === -1) return prev;
      const movingTab = sourceWorkspace.tabs[sourceTabIndex];
      const sourceRemainingTabs = sourceWorkspace.tabs.filter((tab) => tab.id !== tabId);
      const sourceNextTabs = sourceRemainingTabs.length > 0 ? sourceRemainingTabs : [createTab(normalizeView())];

      const sourceNextActiveTabId = sourceWorkspace.activeTabId === tabId
        ? (sourceNextTabs[Math.max(0, sourceTabIndex - 1)] ?? sourceNextTabs[0]).id
        : (sourceNextTabs.some((tab) => tab.id === sourceWorkspace.activeTabId)
          ? sourceWorkspace.activeTabId
          : sourceNextTabs[0].id);

      const next = prev.map((workspace, index) => {
        if (index === sourceWorkspaceIndex) {
          return {
            ...workspace,
            tabs: sourceNextTabs,
            activeTabId: sourceNextActiveTabId
          };
        }

        if (index === targetWorkspaceIndex) {
          return {
            ...workspace,
            tabs: [...workspace.tabs, movingTab]
          };
        }

        return workspace;
      });

      return next;
    });
  }

  function closeTab(tabId) {
    captureCurrentViewScroll();
    if (tabs.length === 1) {
      setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, stack: [normalizeView()] } : tab)));
      setActiveTabId(tabId);
      return;
    }

    const index = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);

    if (activeTabId === tabId) {
      const fallback = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
      setActiveTabId(fallback.id);
    }
  }

  function reorderTabs(updater) {
    setTabs((prev) => updater(prev));
  }

  function handleSelectTab(tabId) {
    captureCurrentViewScroll();
    setActiveTabId(tabId);
  }

  function handleScreenChange(screen) {
    setActiveScreen(screen);
    if (screen !== 'collections') {
      setRequestedCollectionId(null);
      setRequestedCollectionsTab('manual');
    }
    if (activeView.screen !== 'library') {
      replaceActiveView(normalizeView());
    }
  }

  useEffect(() => {
    const matchesCloseShortcut = (event) => {
      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '').toLowerCase();
      return (event.ctrlKey || event.metaKey)
        && !event.altKey
        && !event.shiftKey
        && (key === 'z' || key === 'undo' || code === 'keyz');
    };

    const onKeyDown = (event) => {
      const isCloseShortcut = matchesCloseShortcut(event);

      if (!isCloseShortcut) return;

      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
      if (isEditable) return;

      event.preventDefault();
      closeTab(activeTabId);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyDown);
    };
  }, [activeTabId, tabs.length]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      const tagName = target?.tagName?.toLowerCase();
      return target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
    };

    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      const key = String(event.key || '');
      const lowerKey = key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && lowerKey === 'q') {
        event.preventDefault();
        if (panicSession !== 'panic') {
          setReadingQueueOpen((prev) => !prev);
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && lowerKey === 'l') {
        event.preventDefault();
        triggerPanicLock();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && lowerKey === 'tab') {
        if (tabs.length <= 1) return;
        event.preventDefault();
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
        if (currentIndex === -1) return;
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
        setActiveTabId(tabs[nextIndex].id);
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const digit = Number.parseInt(lowerKey, 10);
        if (Number.isFinite(digit) && digit >= 1 && digit <= MAX_WORKSPACES) {
          const targetWorkspace = workspaces[digit - 1];
          if (targetWorkspace) {
            event.preventDefault();
            switchWorkspace(targetWorkspace.id);
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeTabId, tabs, workspaces, activeWorkspaceId, panicSession]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      const tagName = target?.tagName?.toLowerCase();
      return target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
    };

    const goBack = () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (activeTab.stack.length > 1 || activeView.screen !== 'library') {
        captureCurrentViewScroll();
        popActiveView();
      }
    };

    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      const key = String(event.key || '').toLowerCase();
      if (event.key === 'BrowserBack' || key === 'browserback') {
        event.preventDefault();
        goBack();
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && key === 'arrowleft') {
        event.preventDefault();
        goBack();
        return;
      }
      if (key === 'backspace') {
        event.preventDefault();
        goBack();
      }
    };

    const onMouseUp = (event) => {
      if (event.button === 3) {
        event.preventDefault();
        goBack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onMouseUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [activeTab.stack.length, activeView.screen, settingsOpen]);

  const handleViewScrollPositionChange = useCallback((scrollTop) => {
    scrollPositionsRef.current[activeScrollKey] = scrollTop;
  }, [activeScrollKey]);

  const buildReaderViewForChapter = useCallback((mangaId, chapterId, fallbackPageIndex = 0, preferSavedProgress = false) => {
    const { chapter } = findChapter(entityLibrary, mangaId, chapterId);
    const progress = preferSavedProgress ? chapter?.progress ?? null : null;
    return {
      screen: 'reader',
      mangaId,
      chapterId,
      pageIndex: progress?.pageIndex ?? fallbackPageIndex,
      readerState: sanitizeReaderState(progress)
    };
  }, [entityLibrary]);

  const buildResumeViewForManga = useCallback((mangaId) => {
    const manga = findManga(entityLibrary, mangaId);
    if (!manga) {
      return { screen: 'library', mangaId: null, chapterId: null, pageIndex: 0, readerState: null };
    }

    const resumeProgress = manga.lastProgress ?? null;
    const chapterId = resumeProgress?.chapterId
      ?? manga.chapters?.find((chapter) => !chapter.isRead)?.id
      ?? manga.chapters?.[0]?.id
      ?? null;

    if (!chapterId) {
      return { screen: 'manga', mangaId, chapterId: null, pageIndex: 0, readerState: null };
    }

    return {
      screen: 'reader',
      mangaId,
      chapterId,
      pageIndex: resumeProgress?.pageIndex ?? 0,
      readerState: sanitizeReaderState(resumeProgress)
    };
  }, [entityLibrary]);

  const isCurrentTabIncognito = Boolean(activeTab?.incognito);

  const isMangaPrivate = useCallback((mangaRef) => {
    const manga = findManga({ allMangas: selectableMangas }, mangaRef);
    return Boolean(manga?.isPrivate);
  }, [selectableMangas]);

  const isViewPrivate = useCallback((view) => {
    if (!view) return false;
    if (view.screen === 'library') {
      return activeScreen === 'vault';
    }
    if (!view.mangaId) return false;
    return isMangaPrivate(view.mangaId);
  }, [activeScreen, isMangaPrivate]);

  useEffect(() => {
    const shouldUseNeutralTitle = panicSession !== 'inactive' || isViewPrivate(activeView);
    document.title = shouldUseNeutralTitle
      ? 'Sawa Manga Library'
      : activeTabMeta?.label
        ? `${activeTabMeta.label} - Sawa Manga Library`
        : 'Sawa Manga Library';
  }, [panicSession, activeView, activeTabMeta, isViewPrivate]);

  const findNextChapterCandidate = useCallback((mangaRef, chapterRef = null) => {
    const manga = findManga(entityLibrary, mangaRef);
    if (!manga) return null;
    const chapters = Array.isArray(manga.chapters) ? manga.chapters : [];
    if (!chapters.length) return null;
    if (!chapterRef) {
      return chapters.find((chapter) => !chapter.isRead) || chapters[0] || null;
    }
    const currentIndex = chapters.findIndex((chapter) => matchesEntityReference(chapter, chapterRef));
    if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
      return chapters[currentIndex + 1];
    }
    return null;
  }, [entityLibrary]);

  const buildQueueDraft = useCallback((mangaRef, chapterRef = null, source = 'manual', extra = {}) => {
    const manga = findManga(entityLibrary, mangaRef);
    if (!manga) return null;
    const chapter = chapterRef
      ? (manga.chapters || []).find((item) => matchesEntityReference(item, chapterRef)) || null
      : null;
    return {
      mangaId: manga.contentId || manga.id,
      chapterId: chapter?.contentId || chapter?.id || null,
      source,
      pinned: Boolean(extra.pinned),
      deferredUntil: extra.deferredUntil || null
    };
  }, [entityLibrary]);

  const buildNextQueueDraft = useCallback((mangaRef, chapterRef = null, source = 'next-engine') => {
    const nextChapter = findNextChapterCandidate(mangaRef, chapterRef);
    if (nextChapter) {
      return buildQueueDraft(mangaRef, nextChapter.contentId || nextChapter.id, source);
    }
    const manga = findManga(entityLibrary, mangaRef);
    if (!manga) return null;
    const sameCategory = selectableMangas.filter((entry) => entry.categoryId === manga.categoryId);
    const currentIndex = sameCategory.findIndex((entry) => matchesEntityReference(entry, mangaRef));
    if (currentIndex >= 0 && currentIndex < sameCategory.length - 1) {
      const nextManga = sameCategory[currentIndex + 1];
      const nextUnreadChapter = findNextChapterCandidate(nextManga.id);
      return buildQueueDraft(nextManga.contentId || nextManga.id, nextUnreadChapter?.contentId || nextUnreadChapter?.id || null, source);
    }
    return null;
  }, [buildQueueDraft, entityLibrary, findNextChapterCandidate, selectableMangas]);

  function openMangaInCurrentTab(mangaId) {
    replaceActiveView({ screen: 'manga', mangaId, chapterId: null, pageIndex: 0 });
  }

  function openMangaInNewTab(mangaId, options = {}) {
    openNewTab({ screen: 'manga', mangaId, chapterId: null, pageIndex: 0 }, [normalizeView()], options);
  }

  function openChapterInCurrentTab(mangaId, chapterId, pageIndex = 0) {
    pushViewToActive(chapterTargetView(ui, mangaId, chapterId, pageIndex));
  }

  function openChapterInNewTab(mangaId, chapterId, pageIndex = 0, options = {}) {
    openNewTab(chapterTargetView(ui, mangaId, chapterId, pageIndex), [normalizeView(), { screen: 'manga', mangaId }], options);
  }

  function resumeMangaInCurrentTab(mangaId) {
    pushViewToActive(buildResumeViewForManga(mangaId));
  }

  function resumeMangaInNewTab(mangaId, options = {}) {
    const nextView = buildResumeViewForManga(mangaId);
    openNewTab(nextView, [normalizeView(), { screen: 'manga', mangaId }], options);
  }

  function resumeChapterInCurrentTab(mangaId, chapterId, fallbackPageIndex = 0) {
    pushViewToActive(buildReaderViewForChapter(mangaId, chapterId, fallbackPageIndex, true));
  }

  async function toggleSidebarCollapsed() {
    await handleUpdateSettings({ sidebarCollapsed: !ui.sidebarCollapsed });
  }

  async function handleSelectCategory(categoryId) {
    await refreshWith(window.mangaAPI.updateSettings({ selectedCategoryId: categoryId }));
  }

  async function handleOpenAddCategories() {
    await refreshWith(window.mangaAPI.addCategories());
  }

  async function handleToggleCategoryHidden(categoryId) {
    await refreshWith(window.mangaAPI.toggleCategoryHidden(categoryId));
  }

  async function handleRemoveCategory(categoryId) {
    await refreshWith(window.mangaAPI.removeCategory(categoryId));
  }

  async function handleToggleFavorite(mangaId) {
    await refreshWith(window.mangaAPI.toggleFavorite(mangaId));
  }

  async function handleTrashManga(mangaId) {
    captureCurrentViewScroll();
    await refreshWith(window.mangaAPI.trashManga(mangaId));
    if (activeView.mangaId === mangaId) {
      replaceActiveView(normalizeView());
    }
  }

  async function handleSetReadStatus(mangaId, isRead, chapterIds = []) {
    await refreshWith(window.mangaAPI.setReadStatus(mangaId, isRead, chapterIds));
  }

  async function handleSetChapterReadStatus(mangaId, chapterId, isRead, pageCount = 0) {
    await refreshWith(window.mangaAPI.setChapterReadStatus(mangaId, chapterId, isRead, pageCount));
  }

  async function handleResetProgress(mangaId, chapterIds = []) {
    await refreshWith(window.mangaAPI.resetProgress(mangaId, chapterIds));
  }

  async function handleResetChapterProgress(chapterId) {
    await refreshWith(window.mangaAPI.resetChapterProgress(chapterId));
  }

  async function handleSaveMetadata(mangaId, patch) {
    await refreshWith(window.mangaAPI.updateMetadata(mangaId, patch));
    setEditingMetadata(null);
  }

  async function handlePickCover(mangaId) {
    await refreshWith(window.mangaAPI.pickCover(mangaId));
  }

  async function handleCreateTag(name, color) {
    await refreshWith(window.mangaAPI.createTag(name, color));
  }

  async function handleDeleteTag(tagId) {
    await refreshWith(window.mangaAPI.deleteTag(tagId));
  }

  async function handleImportOnlineMetadata(mangaId, onlineData) {
    await refreshWith(window.mangaAPI.importOnlineMetadata(mangaId, onlineData));
  }

  async function handleToggleTag(mangaId, tagId) {
    await refreshWith(window.mangaAPI.toggleMangaTag(mangaId, tagId));
  }

  async function handleAddToCollection(mangaId, collectionId) {
    await refreshWith(window.mangaAPI.addMangaToCollection(collectionId, mangaId));
  }

  async function handleCreateCollection(name, description) {
    await refreshWith(window.mangaAPI.createCollection(name, description));
  }

  async function handleDeleteCollection(collectionId) {
    await refreshWith(window.mangaAPI.deleteCollection(collectionId));
  }

  async function handleUpdateCollection(collectionId, patch) {
    await refreshWith(window.mangaAPI.updateCollection(collectionId, patch));
  }

  async function handleRemoveMangaFromCollection(collectionId, mangaId) {
    await refreshWith(window.mangaAPI.removeMangaFromCollection(collectionId, mangaId));
  }

  async function handleUpdateSettings(patch) {
    await refreshWith(window.mangaAPI.updateSettings(patch));
  }

  async function handleSaveQueryAsSmartCollection() {
    const trimmed = search.trim();
    if (!trimmed) return;
    const name = window.prompt('Nom de la smart collection :', 'Recherche sauvegardee');
    if (name === null) return;
    const smartCollection = buildSmartCollectionFromSearch(parsedSearch, {
      name: name.trim() || 'Recherche sauvegardee',
      sort: ui.sort,
      collectionsById: payload?.persisted?.collections || {},
      tagsById: payload?.persisted?.tags || {}
    });
    await handleSaveSmartCollection(smartCollection);
    setActiveScreen('collections');
    setRequestedCollectionsTab('smart');
    setRequestedCollectionId(smartCollection.id);
  }

  async function handlePickBackgroundImage() {
    await refreshWith(window.mangaAPI.pickBackgroundImage());
  }

  async function handleRemoveBackgroundImage() {
    await refreshWith(window.mangaAPI.removeBackgroundImage());
  }

  async function handleForceRescan() {
    setMaintenanceStats(null);
    await refreshWith(window.mangaAPI.forceRescan());
  }

  function clearSelection() {
    setSelectedMangaIds([]);
    setSelectionMode(false);
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedMangaIds([]);
      }
      return next;
    });
  }

  function toggleSelectedManga(mangaId) {
    if (!mangaId) return;
    setSelectionMode(true);
    setSelectedMangaIds((prev) => (
      prev.includes(mangaId)
        ? prev.filter((id) => id !== mangaId)
        : [...prev, mangaId]
    ));
  }

  async function handleBulkFavorite(nextValue) {
    if (!selectedMangaIds.length) return;
    await refreshWith(window.mangaAPI.bulkFavorite(selectedMangaIds, nextValue));
  }

  async function handleBulkRead(isRead) {
    if (!selectedMangaIds.length) return;
    const entries = selectedMangas.map((manga) => ({
      mangaId: manga.id,
      chapterIds: (manga.chapters ?? []).map((chapter) => chapter.id)
    }));
    await refreshWith(window.mangaAPI.bulkSetReadStatus(entries, isRead));
  }

  async function handleBulkAddCollection(collectionId) {
    if (!collectionId || !selectedMangaIds.length) return;
    await refreshWith(window.mangaAPI.addManyToCollection(collectionId, selectedMangaIds));
    setBatchCollectionOpen(false);
  }

  async function handleBulkAddTag(tagId) {
    if (!tagId || !selectedMangaIds.length) return;
    await refreshWith(window.mangaAPI.addTagToMany(tagId, selectedMangaIds));
    setBatchTagOpen(false);
  }

  async function handleSetPrivateFlag(mangaId, isPrivate) {
    await refreshWith(window.mangaAPI.setPrivateFlag(mangaId, isPrivate));
  }

  async function handleSetPrivateCategoryFlag(categoryId, isPrivate) {
    await refreshWith(window.mangaAPI.setPrivateCategoryFlag(categoryId, isPrivate));
    if (isPrivate) {
      setActiveScreen('vault');
      setVaultCategoryFilterId(categoryId);
    } else if (vaultCategoryFilterId === categoryId) {
      setVaultCategoryFilterId(null);
    }
  }

  async function handleBulkVaultToggle() {
    if (!selectedMangaIds.length) return;
    const shouldArchive = !selectedMangas.every((manga) => manga.isPrivate);
    await refreshWith(window.mangaAPI.setPrivateFlagMany(selectedMangaIds, shouldArchive));
  }

  async function handleQueueWorkbench(mangaIds, mode = 'append') {
    if (!Array.isArray(mangaIds) || mangaIds.length === 0) return;
    await refreshWith(window.mangaAPI.queueMetadataWorkbench(mangaIds, mode));
    setActiveScreen('workbench');
  }

  async function handleReplaceWorkbenchQueue(mangaIds) {
    await refreshWith(window.mangaAPI.setMetadataWorkbenchQueue(mangaIds));
  }

  async function handleImportWorkbenchMatch(mangaId, result) {
    await refreshWith(window.mangaAPI.importOnlineMetadata(mangaId, result));
  }

  async function handleSaveSmartCollection(collection) {
    await refreshWith(window.mangaAPI.saveSmartCollection(collection));
  }

  async function handleDeleteSmartCollection(collectionId) {
    await refreshWith(window.mangaAPI.deleteSmartCollection(collectionId));
  }

  async function applyVaultResult(result) {
    if (!result?.ok) {
      throw new Error(result?.error || 'Operation impossible.');
    }
    if (result.payload) {
      setPayload(result.payload);
    }
  }

  async function handleSetVaultPin(pin) {
    const result = await window.mangaAPI.setVaultPin(pin);
    await applyVaultResult(result);
  }

  async function handleUnlockVault(pin) {
    const result = await window.mangaAPI.unlockVault(pin);
    await applyVaultResult(result);
    setPanicSession((prev) => (prev === 'panic' ? 'recovered' : prev));
  }

  async function handleLockVault() {
    const result = await window.mangaAPI.lockVault();
    await applyVaultResult(result);
  }

  async function handleToggleVaultBlur() {
    await refreshWith(window.mangaAPI.updateVaultPrefs({ blurCovers: !vaultState.blurCovers }));
  }

  async function handleToggleVaultStealth() {
    await refreshWith(window.mangaAPI.updateVaultPrefs({ stealthMode: !vaultState.stealthMode }));
  }

  async function handleUpdateMetadataLocks(mangaId, patch) {
    const nextPayload = await window.mangaAPI.updateMetadataFieldLocks(mangaId, patch);
    setPayload(nextPayload);
    setEditingMetadata(findManga(nextPayload?.library ?? library, mangaId) || findManga(nextPayload?.vaultLibrary ?? vaultLibrary, mangaId));
  }

  async function handleImportComicInfoForManga(mangaId, options = {}) {
    const result = await window.mangaAPI.importComicInfo(mangaId, options);
    if (result?.payload) {
      setPayload(result.payload);
      setEditingMetadata(findManga(result.payload?.library ?? library, mangaId) || findManga(result.payload?.vaultLibrary ?? vaultLibrary, mangaId));
    }
    return result;
  }

  async function handleUpsertQueueItem(draft) {
    if (!draft || panicSession === 'panic') return;
    const nextPayload = await window.mangaAPI.upsertReadingQueueItem(draft);
    setPayload(nextPayload);
  }

  async function handleRemoveQueueItem(item) {
    if (!item) return;
    const nextPayload = await window.mangaAPI.removeReadingQueueItem({
      mangaId: item.raw?.mangaId || item.mangaId,
      chapterId: item.raw?.chapterId || item.chapterId || null
    });
    setPayload(nextPayload);
  }

  async function handleReorderQueue(nextItems) {
    const nextPayload = await window.mangaAPI.saveReadingQueue(nextItems.map((item) => item.raw));
    setPayload(nextPayload);
  }

  async function handleToggleQueuePinned(item) {
    const raw = item?.raw;
    if (!raw) return;
    await handleUpsertQueueItem({
      mangaId: raw.mangaContentId || raw.mangaId,
      chapterId: raw.chapterContentId || raw.chapterId || null,
      source: item.displaySource || raw.displaySource || 'manual',
      pinned: !Boolean(raw.pinned),
      deferredUntil: raw.deferredUntil || null
    });
  }

  function openQueueItem(item) {
    if (!item?.mangaId) return;
    setReadingQueueOpen(false);
    if (item.chapterId) {
      const view = buildReaderViewForChapter(item.mangaId, item.chapterId, 0, true);
      if (activeView.screen === 'reader') {
        replaceActiveView(view);
      } else {
        pushViewToActive(view);
      }
      return;
    }
    if (activeView.screen === 'manga' && matchesEntityReference(currentManga || {}, item.mangaId)) {
      return;
    }
    pushViewToActive({ screen: 'manga', mangaId: item.mangaId, chapterId: null, pageIndex: 0 });
  }

  function toggleTabIncognito(tabId = activeTabId) {
    setTabs((prev) => prev.map((tab) => (
      tab.id === tabId ? { ...tab, incognito: !tab.incognito } : tab
    )));
  }

  async function triggerPanicLock() {
    if (panicSession === 'panic') return;
    setPanicSession('panic');
    setReadingQueueOpen(false);
    setContextMenu(null);
    setSettingsOpen(false);
    setMetadataSearchManga(null);
    setCollectionPickerManga(null);
    setEditingMetadata(null);
    setTagManagerManga(null);
    setActiveScreen('dashboard');
    setVaultCategoryFilterId(null);
    setWorkspaces((prev) => prev.map((workspace) => ({
      ...workspace,
      tabs: workspace.tabs.map((tab) => {
        const topView = getTabView(tab);
        return isViewPrivate(topView) ? { ...tab, stack: [normalizeView()] } : tab;
      }),
      activeTabId: workspace.tabs.some((tab) => !isViewPrivate(getTabView(tab)))
        ? workspace.tabs.find((tab) => !isViewPrivate(getTabView(tab)))?.id || workspace.activeTabId
        : workspace.tabs[0]?.id || workspace.activeTabId
    })));
    try {
      await handleLockVault();
    } catch (_error) {
      // Renderer panic should remain best-effort.
    }
  }

  async function handleAddAnnotation(input) {
    await refreshWith(window.mangaAPI.addAnnotation(input));
  }

  async function handleDeleteAnnotation(mangaId, annotationId) {
    await refreshWith(window.mangaAPI.deleteAnnotation(mangaId, annotationId));
  }

  async function handleToggleSidebarPin(pinDraft) {
    if (!pinDraft?.type || !pinDraft?.refId) return;
    const existing = sidebarPins.find((pin) => pin.type === pinDraft.type && pin.refId === pinDraft.refId);
    const nextPins = existing
      ? sidebarPins.filter((pin) => pin.id !== existing.id)
      : [
          ...sidebarPins,
          {
            id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            ...pinDraft
          }
        ];
    await handleUpdateSettings({ sidebarPins: nextPins });
  }

  function handleActivateSidebarPin(pin) {
    if (!pin) return;

    if (pin.type === 'collection' || pin.type === 'smart-collection') {
      setRequestedCollectionsTab(pin.type === 'smart-collection' ? 'smart' : 'manual');
      setRequestedCollectionId(pin.refId);
      setActiveScreen('collections');
      if (activeView.screen !== 'library') {
        replaceActiveView(normalizeView());
      }
      return;
    }

    if (pin.type === 'tag') {
      setSearch(pin.label || '');
      handleScreenChange('library');
      return;
    }

    if (pin.type === 'screen') {
      handleScreenChange(pin.refId || 'library');
    }
  }

  async function handleQueueMaintenanceIssue(kind, explicitIds = []) {
    const mangaIds = explicitIds.length > 0
      ? explicitIds
      : kind === 'missingCover'
        ? maintenanceIssues.missingCover.map((manga) => manga.id)
        : kind === 'missingMetadata'
          ? maintenanceIssues.missingMetadata.map((manga) => manga.id)
          : [];

    await handleQueueWorkbench(mangaIds, 'append');
  }

  function handleUpdateProgress(progressPayload) {
    const now = new Date().toISOString();

    if (activeTab?.incognito) {
      setTabs((prev) => prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        const stack = [...tab.stack];
        const topIndex = stack.length - 1;
        const topView = stack[topIndex];
        if (!topView || topView.screen !== 'reader' || !matchesEntityReference({ id: topView.chapterId }, progressPayload.chapterId)) return tab;
        stack[topIndex] = normalizeView({
          ...topView,
          pageIndex: progressPayload.pageIndex,
          readerState: sanitizeReaderState(progressPayload)
        });
        return { ...tab, stack };
      }));
      return;
    }

    setPayload((prev) => {
      if (!prev?.library) return prev;
      const nextLibrary = { ...prev.library };
      const nextProgress = { ...(prev.persisted?.progress || {}) };
      nextProgress[progressPayload.chapterId] = { ...progressPayload, lastReadAt: now };

      const nextRecents = [
        {
          mangaId: progressPayload.mangaId,
          chapterId: progressPayload.chapterId,
          pageIndex: progressPayload.pageIndex,
          lastReadAt: now
        },
        ...(prev.persisted?.recents || []).filter((entry) => entry.chapterId !== progressPayload.chapterId)
      ].slice(0, 30);

      const updateManga = (manga) => {
        if (manga.id !== progressPayload.mangaId) return manga;
        const chapters = manga.chapters.map((chapter) => {
          if (chapter.id !== progressPayload.chapterId) return chapter;
          const nextChapter = {
            ...chapter,
            progress: { ...progressPayload, lastReadAt: now },
            isRead: progressPayload.pageCount > 0 && progressPayload.pageIndex >= progressPayload.pageCount - 1
          };
          return nextChapter;
        });
        return buildMangaAggregate({
          ...manga,
          chapters,
          lastProgress: { ...progressPayload, lastReadAt: now },
          lastReadAt: now
        });
      };

      nextLibrary.allMangas = prev.library.allMangas.map(updateManga);
      nextLibrary.favorites = prev.library.favorites.map(updateManga);
      nextLibrary.categories = prev.library.categories.map((category) => ({
        ...category,
        mangas: category.mangas.map(updateManga)
      }));
      nextLibrary.recents = nextRecents.map((recent) => {
        const manga = nextLibrary.allMangas.find((item) => item.id === recent.mangaId);
        const chapter = manga?.chapters.find((item) => item.id === recent.chapterId);
        return manga && chapter ? {
          ...recent,
          mangaTitle: manga.displayTitle,
          mangaCoverSrc: manga.coverSrc,
          chapterName: chapter.name,
          categoryName: manga.categoryName
        } : null;
      }).filter(Boolean).slice(0, 20);

      return {
        ...prev,
        persisted: {
          ...prev.persisted,
          progress: nextProgress,
          recents: nextRecents,
          ui: {
            ...prev.persisted.ui,
            readerMode: progressPayload.mode,
            readerFit: progressPayload.fitMode ?? prev.persisted.ui.readerFit,
            readerZoom: Number.isFinite(Number(progressPayload.zoom))
              ? Number(progressPayload.zoom)
              : (prev.persisted.ui.readerZoom ?? 1)
          }
        },
        library: nextLibrary
      };
    });

    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== activeTabId) return tab;
      const stack = [...tab.stack];
      const topIndex = stack.length - 1;
      const topView = stack[topIndex];
      if (!topView || topView.screen !== 'reader' || topView.chapterId !== progressPayload.chapterId) return tab;
      stack[topIndex] = normalizeView({
        ...topView,
        pageIndex: progressPayload.pageIndex,
        readerState: sanitizeReaderState(progressPayload)
      });
      return { ...tab, stack };
    }));

    window.mangaAPI.updateProgressLight(progressPayload).catch(() => {
      // On garde l'UI fluide même si l'écriture disque rate.
    });
  }

  function handleReaderExit() {
    popActiveView();
    window.setTimeout(() => {
      refreshWith(window.mangaAPI.bootstrap()).catch(() => {});
    }, 0);
  }

  function actionItem(label, action, options = {}) {
    return {
      type: 'action',
      label,
      icon: options.icon,
      danger: options.danger,
      disabled: options.disabled,
      checked: options.checked,
      onSelect: async () => {
        closeContextMenu();
        await action();
      }
    };
  }

  function separatorItem() {
    return { type: 'separator' };
  }

  function openContextMenu(event, context = { type: 'app' }) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 280;
    const x = Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    let items = [];

    try {
      items = [];
    if (context.type === 'manga' && context.manga) {
      const mangaChapterIds = Array.isArray(context.manga.chapters)
        ? context.manga.chapters.map((chapter) => chapter.id).filter(Boolean)
        : [];
      const nextQueueDraft = buildNextQueueDraft(context.manga.id);
      items.push(
        actionItem('Ouvrir dans cet onglet', () => openMangaInCurrentTab(context.manga.id), { icon: <EyeIcon size={14} /> }),
        actionItem('Ouvrir dans un nouvel onglet', () => openMangaInNewTab(context.manga.id), { icon: <PlusIcon size={14} /> }),
        actionItem('Reprendre en incognito', () => resumeMangaInNewTab(context.manga.id, { incognito: true }), { icon: <EyeOffIcon size={14} /> }),
        separatorItem(),
        actionItem(context.manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', () => handleToggleFavorite(context.manga.id), {
          icon: <HeartIcon size={14} filled={context.manga.isFavorite} />
        }),
        actionItem(context.manga.isRead ? 'Marquer comme non lu' : 'Marquer comme lu', () => handleSetReadStatus(context.manga.id, !context.manga.isRead, mangaChapterIds), {
          icon: <BookIcon size={14} />
        }),
        separatorItem(),
        actionItem('Gérer les tags', () => setTagManagerManga(context.manga), { icon: <TagIcon size={14} /> }),
        actionItem('Éditer les métadonnées', () => setEditingMetadata(context.manga), { icon: <EditIcon size={14} /> }),
        actionItem('Rechercher les métadonnées en ligne', () => {
          setMetadataSearchManga(context.manga);
        }, { icon: <SearchIcon size={14} /> }),
        actionItem('Importer ComicInfo', () => handleImportComicInfoForManga(context.manga.id), { icon: <SparklesIcon size={14} /> }),
        actionItem('Choisir une couverture', () => handlePickCover(context.manga.id), { icon: <SparklesIcon size={14} /> }),
        actionItem('Envoyer à l’atelier metadata', () => handleQueueWorkbench([context.manga.id], 'append'), { icon: <EditIcon size={14} /> }),
        separatorItem(),
        actionItem('Gérer les collections', () => {
          setCollectionPickerManga(context.manga);
        }, { icon: <LayersIcon size={14} /> }),
        actionItem('Ajouter à la queue', () => handleUpsertQueueItem(buildQueueDraft(context.manga.id, null, 'manual')), { icon: <LayersIcon size={14} /> }),
        actionItem('Ajouter la suite détectée', () => nextQueueDraft ? handleUpsertQueueItem(nextQueueDraft) : null, {
          icon: <ChevronRightIcon size={14} />,
          disabled: !nextQueueDraft
        }),
        actionItem(context.manga.isPrivate ? 'Retirer du coffre' : 'Envoyer au coffre', () => handleSetPrivateFlag(context.manga.id, !context.manga.isPrivate), {
          icon: <ArchiveIcon size={14} />
        }),
        separatorItem(),
        actionItem('Réinitialiser la progression', () => handleResetProgress(context.manga.id, mangaChapterIds), {
          icon: <RefreshIcon size={14} />,
          danger: true
        }),
        actionItem('Supprimer le manga', () => handleTrashManga(context.manga.id), { icon: <TrashIcon size={14} />, danger: true })
      );
    }

    if (context.type === 'chapter' && context.manga && context.chapter) {
      const nextQueueDraft = buildNextQueueDraft(context.manga.id, context.chapter.id);
      items.push(
        actionItem('Ouvrir ce chapitre ici', () => openChapterInCurrentTab(context.manga.id, context.chapter.id, context.pageIndex ?? 0), { icon: <EyeIcon size={14} /> }),
        actionItem('Ouvrir ce chapitre dans un nouvel onglet', () => openChapterInNewTab(context.manga.id, context.chapter.id, context.pageIndex ?? 0), { icon: <PlusIcon size={14} /> }),
        actionItem('Ouvrir en incognito', () => openChapterInNewTab(context.manga.id, context.chapter.id, context.pageIndex ?? 0, { incognito: true }), { icon: <EyeOffIcon size={14} /> }),
        actionItem('Ouvrir le manga dans un nouvel onglet', () => openMangaInNewTab(context.manga.id), { icon: <LayoutGridIcon size={14} /> }),
        separatorItem(),
        actionItem(context.chapter.isRead ? 'Marquer ce chapitre comme non lu' : 'Marquer ce chapitre comme lu', () => handleSetChapterReadStatus(context.manga.id, context.chapter.id, !context.chapter.isRead, context.chapter.pageCount), {
          icon: <BookIcon size={14} />
        }),
        actionItem('Ajouter à la queue', () => handleUpsertQueueItem(buildQueueDraft(context.manga.id, context.chapter.id, 'manual')), { icon: <LayersIcon size={14} /> }),
        actionItem('Ajouter la suite détectée', () => nextQueueDraft ? handleUpsertQueueItem(nextQueueDraft) : null, {
          icon: <ChevronRightIcon size={14} />,
          disabled: !nextQueueDraft
        }),
        actionItem('Réinitialiser la progression de ce chapitre', () => handleResetChapterProgress(context.chapter.id), {
          icon: <RefreshIcon size={14} />,
          danger: true
        }),
        separatorItem()
      );
    }

    if (context.type === 'category' && context.category) {
      const isCategoryPrivate = Array.isArray(vaultState.privateCategoryIds) && vaultState.privateCategoryIds.includes(context.category.id);
      items.push(
        actionItem(
          context.scope === 'vault' ? 'Voir cette categorie dans le coffre' : 'Filtrer sur cette categorie',
          () => {
            if (context.scope === 'vault') {
              setActiveScreen('vault');
              setVaultCategoryFilterId(context.category.id);
              return;
            }
            handleSelectCategory(context.category.id);
          },
          { icon: <LibraryIcon size={14} /> }
        ),
        actionItem(
          isCategoryPrivate ? 'Retirer cette categorie du coffre' : 'Envoyer la categorie au coffre',
          () => handleSetPrivateCategoryFlag(context.category.id, !isCategoryPrivate),
          { icon: <ArchiveIcon size={14} /> }
        ),
        actionItem('Ouvrir le coffre', () => {
          setActiveScreen('vault');
          setVaultCategoryFilterId(isCategoryPrivate ? context.category.id : null);
        }, { icon: <ArchiveIcon size={14} /> }),
        actionItem(context.category.hidden ? 'Afficher la categorie' : 'Masquer la categorie', () => handleToggleCategoryHidden(context.category.id), {
          icon: context.category.hidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />,
          disabled: context.scope === 'vault'
        }),
        actionItem('Retirer cette categorie', () => handleRemoveCategory(context.category.id), {
          icon: <TrashIcon size={14} />,
          danger: true,
          disabled: context.scope === 'vault'
        }),
        separatorItem()
      );
    }

    if (context.type === 'collection' && context.collection) {
      const pinType = context.collection.isSmart ? 'smart-collection' : 'collection';
      const isPinned = sidebarPins.some((pin) => pin.type === pinType && pin.refId === context.collection.id);
      items.push(
        actionItem('Ouvrir cette collection', () => handleActivateSidebarPin({
          type: pinType,
          refId: context.collection.id,
          label: context.collection.name
        }), { icon: <LayersIcon size={14} /> }),
        actionItem(isPinned ? 'Retirer de la barre laterale' : 'Epingler a la barre laterale', () => handleToggleSidebarPin({
          type: pinType,
          refId: context.collection.id,
          label: context.collection.name
        }), { icon: <PinIcon size={14} /> }),
        separatorItem()
      );
    }

    if (context.type === 'sidebar-pin' && context.pin) {
      items.push(
        actionItem('Ouvrir ce raccourci', () => handleActivateSidebarPin(context.pin), { icon: <LayersIcon size={14} /> }),
        actionItem('Retirer de la barre laterale', () => handleToggleSidebarPin(context.pin), {
          icon: <TrashIcon size={14} />,
          danger: true
        }),
        separatorItem()
      );
    }

    if (context.type === 'workspace' && context.workspace) {
      items.push(
        actionItem('Basculer vers cet espace', () => switchWorkspace(context.workspace.id), { icon: <LayersIcon size={14} /> }),
        actionItem('Renommer cet espace', () => renameWorkspace(context.workspace.id), { icon: <EditIcon size={14} /> }),
        actionItem('Supprimer cet espace', () => deleteWorkspace(context.workspace.id), {
          icon: <TrashIcon size={14} />,
          danger: true,
          disabled: workspaces.length <= 1
        }),
        separatorItem()
      );
    }

    if (context.type === 'tab' && context.tab) {
      const tabInWorkspace = tabs.find((tab) => tab.id === context.tab.id) ?? null;
      const otherWorkspaces = workspaces.filter((workspace) => workspace.id !== activeWorkspaceId);
      const selectedIndex = tabs.findIndex((tab) => tab.id === context.tab.id);
      const hasTabsToRight = selectedIndex >= 0 && tabs.slice(selectedIndex + 1).some((tab) => !tab.pinned);
      const canCloseOthers = tabs.some((tab) => tab.id !== context.tab.id && !tab.pinned);

      items.push(
        actionItem(tabInWorkspace?.pinned ? 'Désépingler l’onglet' : 'Épingler l’onglet', () => toggleTabPin(context.tab.id), { icon: <PinIcon size={14} /> }),
        actionItem('Dupliquer l’onglet', () => duplicateTab(context.tab.id), { icon: <CopyIcon size={14} /> }),
        actionItem('Fermer les autres onglets', () => closeOtherTabs(context.tab.id), {
          icon: <TrashIcon size={14} />,
          danger: true,
          disabled: !canCloseOthers
        }),
        actionItem('Fermer les onglets à droite', () => closeTabsToRight(context.tab.id), {
          icon: <TrashIcon size={14} />,
          danger: true,
          disabled: !hasTabsToRight
        }),
        separatorItem(),
        actionItem('Nouvel onglet bibliothèque', () => openNewLibraryTab(), { icon: <PlusIcon size={14} /> }),
        actionItem('Fermer cet onglet', () => closeTab(context.tab.id), { icon: <TrashIcon size={14} />, danger: true, disabled: tabs.length === 1 }),
        separatorItem()
      );

      if (otherWorkspaces.length > 0) {
        otherWorkspaces.forEach((workspace) => {
          items.push(actionItem(`Déplacer vers ${workspace.name}`, () => moveTabToWorkspace(context.tab.id, workspace.id), { icon: <LayersIcon size={14} /> }));
        });
        items.push(separatorItem());
      }
    }

    if (context.type === 'reader') {
      const nextQueueDraft = buildNextQueueDraft(activeView.mangaId, activeView.chapterId, 'end-of-chapter');
      items.push(
        actionItem('Quitter la lecture', () => popActiveView(), { icon: <ChevronLeftIcon size={14} /> }),
        actionItem('Plein écran', () => window.mangaAPI.toggleFullScreen(), { icon: <FullscreenIcon size={14} /> }),
        actionItem(isCurrentTabIncognito ? 'Désactiver l incognito' : 'Activer l incognito', () => toggleTabIncognito(activeTabId), {
          icon: <EyeOffIcon size={14} />
        }),
        actionItem('Ajouter la suite à la queue', () => nextQueueDraft ? handleUpsertQueueItem(nextQueueDraft) : null, {
          icon: <LayersIcon size={14} />,
          disabled: !nextQueueDraft
        }),
        actionItem('Panic lock', () => triggerPanicLock(), { icon: <ArchiveIcon size={14} />, danger: true }),
        separatorItem()
      );
    }

    items.push(
      actionItem('Nouvel onglet bibliothèque', () => openNewLibraryTab(), { icon: <PlusIcon size={14} /> }),
      actionItem('Ajouter des catégories', () => handleOpenAddCategories(), { icon: <FolderPlusIcon size={14} /> }),
      actionItem('Actualiser la bibliothèque', () => refreshWith(window.mangaAPI.bootstrap()), { icon: <RefreshIcon size={14} /> }),
      actionItem('Ouvrir le coffre', () => {
        setActiveScreen('vault');
        setVaultCategoryFilterId(null);
      }, { icon: <ArchiveIcon size={14} /> }),
      separatorItem(),
      actionItem(theme === 'light-paper' ? 'Passer en thème dark night' : 'Passer en thème clair', () => handleUpdateSettings({ theme: theme === 'light-paper' ? 'dark-night' : 'light-paper' }), {
        icon: <SparklesIcon size={14} />
      }),
      actionItem('Ouvrir les paramètres', () => setSettingsOpen(true), { icon: <SettingsIcon size={14} /> })
    );

    if (activeView.screen !== 'library') {
      items.push(separatorItem());
      items.push(actionItem('Revenir à la bibliothèque dans cet onglet', () => replaceActiveView(normalizeView()), { icon: <LibraryIcon size={14} /> }));
    }

    items.push(separatorItem());
    items.push(actionItem('Fermer l’onglet actif', () => closeTab(activeTabId), {
      icon: <TrashIcon size={14} />,
      danger: true
    }));
    } catch (error) {
      console.error('Context menu failed to open:', error);
      items = [
        actionItem('Nouvel onglet bibliothèque', () => openNewLibraryTab(), { icon: <PlusIcon size={14} /> }),
        actionItem('Ouvrir les paramètres', () => setSettingsOpen(true), { icon: <SettingsIcon size={14} /> })
      ];
    }

    const menuHeight = Math.min(items.length * 38 + 18, window.innerHeight - 16);
    const y = Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight - 8));

    setContextMenu({ x, y, items });
  }

  if (bootError) {
    return (
      <div className="boot-screen">
        <div className="boot-screen-panel">
          <p>{bootError}</p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="boot-screen">
        <div className="boot-screen-panel">
          <div className="boot-spinner" aria-hidden="true" />
          <p>Chargement de la bibliothèque…</p>
        </div>
      </div>
    );
  }

  const bgImageUrl = ui.backgroundImage
    ? `manga://local/${encodeURIComponent(ui.backgroundImage)}`
    : null;
  const bgOpacity = ui.backgroundOpacity ?? 0.15;
  const visibleVaultCount = vaultState.locked ? 0 : (vaultState.privateCount || privateMangas.length);
  const vaultActionLabel = selectedMangas.length > 0 && selectedMangas.every((manga) => manga.isPrivate)
    ? 'Retirer du coffre'
    : 'Envoyer au coffre';
  const shouldShowTopBar = activeView.screen === 'library'
    && !['dashboard', 'collections', 'maintenance', 'workbench'].includes(activeScreen);
  const topBarCategory = activeScreen === 'vault' ? activeVaultCategory : selectedCategory;
  const clearTopBarCategory = activeScreen === 'vault'
    ? () => setVaultCategoryFilterId(null)
    : () => handleSelectCategory(null);

  return (
    <div
      className={`app-shell theme-${theme}`}
      style={{
        '--accent': ui.accent,
        '--accent-alt': ui.accentAlt || '#38bdf8',
        '--card-min': cardSizeMinWidth(ui.cardSize),
        '--manga-card-min-width': cardSizeMinWidth(ui.cardSize),
        '--manga-grid-gap': cardSizeGridGap(ui.cardSize)
      }}
      onContextMenu={(event) => openContextMenu(event)}
    >
      {bgImageUrl && (
        <div
          className="app-bg-image"
          style={{
            backgroundImage: `url("${bgImageUrl}")`,
            opacity: bgOpacity
          }}
        />
      )}
      <TitleBar
        sidebarCollapsed={ui.sidebarCollapsed}
        onToggleSidebar={toggleSidebarCollapsed}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={switchWorkspace}
        onCreateWorkspace={createWorkspaceFromUI}
        canCreateWorkspace={workspaces.length < MAX_WORKSPACES}
        tabs={tabsMeta}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={closeTab}
        onNewTab={openNewLibraryTab}
        onContextMenu={openContextMenu}
        onReorderTabs={reorderTabs}
        queueCount={readingQueueEntries.length}
        queueOpen={readingQueueOpen}
        onToggleQueue={() => setReadingQueueOpen((prev) => !prev)}
        queueDisabled={panicSession === 'panic'}
      />
      <ReadingQueueDrawer
        open={readingQueueOpen}
        items={readingQueueEntries}
        onClose={() => setReadingQueueOpen(false)}
        onOpenItem={openQueueItem}
        onRemoveItem={handleRemoveQueueItem}
        onTogglePinned={handleToggleQueuePinned}
        onReorderItems={handleReorderQueue}
        blocked={panicSession === 'panic'}
      />
      <div className={`layout-shell ${ui.sidebarCollapsed ? 'layout-shell-sidebar-collapsed' : ''}`}>
        <Sidebar
          collapsed={ui.sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          activeScreen={activeScreen}
          onScreenChange={handleScreenChange}
          categories={visibleCategories}
          allCategories={library.categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
          onAddCategories={handleOpenAddCategories}
          onToggleCategoryHidden={handleToggleCategoryHidden}
          onRemoveCategory={handleRemoveCategory}
          onOpenSettings={() => setSettingsOpen(true)}
          showHiddenCategories={ui.showHiddenCategories}
          onContextMenu={openContextMenu}
          favoritesCount={library.favorites?.length ?? 0}
          maintenanceCount={maintenanceCount}
          workbenchCount={workbenchQueueMangas.length}
          vaultCount={visibleVaultCount}
          sidebarPins={sidebarPins}
          onActivatePin={handleActivateSidebarPin}
        />

        <div className="content-shell">
          {shouldShowTopBar && (
            <TopBar
              sidebarCollapsed={ui.sidebarCollapsed}
              onToggleSidebar={toggleSidebarCollapsed}
              search={search}
              onSearchChange={setSearch}
              sort={ui.sort}
              onSortChange={(sort) => handleUpdateSettings({ sort })}
              selectedCategory={topBarCategory}
              onClearCategory={clearTopBarCategory}
              onOpenSettings={() => setSettingsOpen(true)}
              onAddCategories={handleOpenAddCategories}
              activeScreen={activeScreen}
              selectionMode={selectionMode}
              selectedCount={selectedMangaIds.length}
              onToggleSelectionMode={toggleSelectionMode}
              searchChips={searchChips}
              searchHelpOpen={searchHelpOpen}
              onToggleSearchHelp={() => setSearchHelpOpen((prev) => !prev)}
              onSaveSearch={handleSaveQueryAsSmartCollection}
            />
          )}

          {activeView.screen === 'library' && selectedMangaIds.length > 0 && (
            <BulkActionBar
              selectionCount={selectedMangaIds.length}
              onClear={clearSelection}
              onMarkRead={() => handleBulkRead(true)}
              onMarkUnread={() => handleBulkRead(false)}
              onFavorite={() => handleBulkFavorite(true)}
              onUnfavorite={() => handleBulkFavorite(false)}
              onOpenCollectionPicker={() => setBatchCollectionOpen(true)}
              onOpenTagPicker={() => setBatchTagOpen(true)}
              onQueueWorkbench={() => handleQueueWorkbench(selectedMangaIds, 'append')}
              onVaultToggle={handleBulkVaultToggle}
              vaultActionLabel={vaultActionLabel}
            />
          )}

          {activeView.screen === 'library' && activeScreen === 'dashboard' && (
            <Dashboard
              allMangas={dashboardMangas}
              favorites={dashboardFavorites}
              persisted={payload?.persisted ?? {}}
              ui={ui}
              onOpenManga={openMangaInCurrentTab}
              onResumeManga={resumeMangaInCurrentTab}
              onToggleFavorite={handleToggleFavorite}
              onNavigateTo={(target) => {
                if (target === 'library') {
                  setActiveScreen('library');
                } else if (target === 'collections') {
                  setActiveScreen('collections');
                } else if (target === 'favorites') {
                  setActiveScreen('favorites');
                } else {
                  setActiveScreen('library');
                }
              }}
              onContextMenu={openContextMenu}
              onOpenSettings={() => setSettingsOpen(true)}
              onUpdateSettings={handleUpdateSettings}
              onOpenMaintenance={() => handleScreenChange('maintenance')}
              maintenanceCount={maintenanceCount}
              selectionMode={selectionMode}
              selectedMangaIds={selectedMangaIdSet}
              onToggleSelect={toggleSelectedManga}
              onSelectionModeChange={toggleSelectionMode}
            />
          )}

          {activeView.screen === 'library' && activeScreen === 'collections' && (
            <CollectionsView
              allMangas={library.allMangas}
              persisted={payload?.persisted ?? {}}
              onOpenManga={openMangaInCurrentTab}
              onToggleFavorite={handleToggleFavorite}
              onCreateCollection={handleCreateCollection}
              onDeleteCollection={handleDeleteCollection}
              onUpdateCollection={handleUpdateCollection}
              onRemoveMangaFromCollection={handleRemoveMangaFromCollection}
              onSaveSmartCollection={handleSaveSmartCollection}
              onDeleteSmartCollection={handleDeleteSmartCollection}
              sidebarPins={sidebarPins}
              onToggleSidebarPin={handleToggleSidebarPin}
              requestedCollectionId={requestedCollectionId}
              requestedTab={requestedCollectionsTab}
              selectionMode={selectionMode}
              selectedMangaIds={selectedMangaIdSet}
              onToggleSelect={toggleSelectedManga}
              onSelectionModeChange={toggleSelectionMode}
              onContextMenu={openContextMenu}
            />
          )}

          {activeView.screen === 'library' && activeScreen === 'maintenance' && (
            <MaintenanceView
              issues={maintenanceIssues}
              stats={maintenanceStats}
              workbenchCount={workbenchQueueMangas.length}
              vaultCount={visibleVaultCount}
              onOpenManga={openMangaInCurrentTab}
              onForceRescan={handleForceRescan}
              onQueueIssue={handleQueueMaintenanceIssue}
              onPickCover={handlePickCover}
              onOpenWorkbench={() => handleScreenChange('workbench')}
              onOpenVault={() => handleScreenChange('vault')}
            />
          )}

          {activeView.screen === 'library' && activeScreen === 'workbench' && (
            <MetadataWorkbenchView
              queueMangas={workbenchQueueMangas}
              onReplaceQueue={handleReplaceWorkbenchQueue}
              onImportMatch={handleImportWorkbenchMatch}
              onPickCover={handlePickCover}
              onOpenManga={openMangaInCurrentTab}
            />
          )}

          {activeView.screen === 'library' && activeScreen === 'vault' && (
            <VaultView
              vault={vaultState}
              mangas={filteredPrivateMangas}
              categories={vaultCategories}
              activeCategoryId={vaultCategoryFilterId}
              selectionMode={selectionMode}
              selectedIds={selectedMangaIdSet}
              onToggleSelectionMode={toggleSelectionMode}
              onSelectCategory={setVaultCategoryFilterId}
              onToggleSelect={toggleSelectedManga}
              onOpenManga={openMangaInCurrentTab}
              onOpenMangaInBackgroundTab={(mangaId) => openMangaInNewTab(mangaId, { activate: false })}
              onToggleFavorite={handleToggleFavorite}
              onContextMenu={openContextMenu}
              onSetupPin={handleSetVaultPin}
              onUnlock={handleUnlockVault}
              onLock={handleLockVault}
              onToggleBlur={handleToggleVaultBlur}
              onToggleStealth={handleToggleVaultStealth}
              initialScrollTop={activeInitialScrollTop}
              scrollKey={activeScrollKey}
              onScrollPositionChange={handleViewScrollPositionChange}
            />
          )}

          {activeView.screen === 'library' && !['dashboard', 'collections', 'maintenance', 'workbench', 'vault'].includes(activeScreen) && (
            <LibraryView
              mangas={filteredMangas}
              activeScreen={activeScreen}
              categories={visibleCategories}
              cardSize={ui.cardSize}
              initialScrollTop={activeInitialScrollTop}
              onScrollPositionChange={handleViewScrollPositionChange}
              onOpenManga={openMangaInCurrentTab}
              onOpenMangaInCurrentTab={openMangaInCurrentTab}
              onOpenMangaInNewTab={openMangaInNewTab}
              onOpenMangaInBackgroundTab={(mangaId) => openMangaInNewTab(mangaId, { activate: false })}
              onToggleFavorite={handleToggleFavorite}
              onContextMenu={openContextMenu}
              selectionMode={selectionMode}
              selectedIds={selectedMangaIdSet}
              onToggleSelect={toggleSelectedManga}
            />
          )}

          {activeView.screen === 'manga' && currentManga && (
            <MangaDetailView
              manga={currentManga}
              allTags={payload?.persisted?.tags ?? {}}
              allCollections={allCollections}
              annotations={currentMangaAnnotations}
              initialScrollTop={activeInitialScrollTop}
              onScrollPositionChange={handleViewScrollPositionChange}
              onBack={popActiveView}
              onOpenChapter={(chapterId) => openChapterInCurrentTab(currentManga.id, chapterId, 0)}
              onOpenChapterInNewTab={(chapterId) => openChapterInNewTab(currentManga.id, chapterId, 0)}
              onOpenChapterInBackgroundTab={(chapterId) => openChapterInNewTab(currentManga.id, chapterId, 0, { activate: false })}
              onResumeReading={() => resumeMangaInCurrentTab(currentManga.id)}
              onToggleFavorite={handleToggleFavorite}
              onPickCover={handlePickCover}
              onOpenMetadataEditor={() => setEditingMetadata(currentManga)}
              onAddTag={() => setTagManagerManga(currentManga)}
              onAddToCollection={() => setCollectionPickerManga(currentManga)}
              onImportOnlineMetadata={handleImportOnlineMetadata}
              onOpenAnnotation={(annotation) => {
                if (!annotation?.chapterId) return;
                replaceActiveView(buildReaderViewForChapter(currentManga.id, annotation.chapterId, annotation.pageIndex ?? 0, true));
              }}
              onContextMenu={openContextMenu}
            />
          )}

          {activeView.screen === 'preview' && currentChapterData.manga && resolvedChapter && (
            <ChapterPreviewView
              manga={currentChapterData.manga}
              chapter={resolvedChapter}
              initialScrollTop={activeInitialScrollTop}
              onScrollPositionChange={handleViewScrollPositionChange}
              onBack={popActiveView}
              onReadFrom={(pageIndex) => pushViewToActive({
                screen: 'reader',
                mangaId: currentChapterData.manga.id,
                chapterId: resolvedChapter.id,
                pageIndex
              })}
              onReadFromNewTab={(pageIndex) => openNewTab({
                screen: 'reader',
                mangaId: currentChapterData.manga.id,
                chapterId: resolvedChapter.id,
                pageIndex
              }, [normalizeView(), { screen: 'manga', mangaId: currentChapterData.manga.id }, { screen: 'preview', mangaId: currentChapterData.manga.id, chapterId: resolvedChapter.id, pageIndex: 0 }])}
              onReadFromBackgroundTab={(pageIndex) => openNewTab({
                screen: 'reader',
                mangaId: currentChapterData.manga.id,
                chapterId: resolvedChapter.id,
                pageIndex
              }, [normalizeView(), { screen: 'manga', mangaId: currentChapterData.manga.id }, { screen: 'preview', mangaId: currentChapterData.manga.id, chapterId: resolvedChapter.id, pageIndex: 0 }], { activate: false })}
              onContextMenu={openContextMenu}
            />
          )}

          {activeView.screen === 'reader' && currentChapterData.manga && resolvedChapter && (
            <ReaderView
              manga={currentChapterData.manga}
              chapter={resolvedChapter}
              chapters={currentChapterData.manga.chapters ?? []}
              annotations={payload?.persisted?.annotations?.[currentChapterData.manga.id] ?? []}
              focusToken={activeTab.id}
              initialPageIndex={activeView.pageIndex}
              initialReaderState={sanitizeReaderState(activeView.readerState) || sanitizeReaderState(resolvedChapter.progress)}
              preferredMode={ui.readerMode}
              preferredFitMode={ui.readerFit}
              preferredZoom={ui.readerZoom ?? 1}
              autoHideUI={!!ui.autoHideReaderUI}
              onExit={handleReaderExit}
              onOpenChapter={(chapterId) => replaceActiveView(buildReaderViewForChapter(currentChapterData.manga.id, chapterId, 0, true))}
              onUpdateProgress={handleUpdateProgress}
              onAddAnnotation={handleAddAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              onContextMenu={openContextMenu}
            />
          )}

          {!currentManga && activeView.screen !== 'library' && (
            <section className="empty-card">
              <h3>Ce contenu n’est plus disponible</h3>
              <p>Le manga ou le chapitre lié à cet onglet n’existe plus dans la bibliothèque actuelle.</p>
              <div className="detail-actions-row" style={{ marginTop: 16 }}>
                <button className="ghost-button" onClick={popActiveView}>Retour</button>
                <button className="primary-button" onClick={() => replaceActiveView(normalizeView())}>Revenir à la bibliothèque</button>
              </div>
            </section>
          )}
        </div>
      </div>

      {batchCollectionOpen && (
        <BatchPickerModal
          title="Ajouter a une collection"
          subtitle="Choisis une collection pour tous les mangas selectionnes."
          items={allCollections}
          itemLabel={(item) => item.name}
          itemMeta={(item) => `${(item.mangaIds || []).length} manga(s)`}
          createLabel="Creer la collection"
          newItemPlaceholder="Nom de la collection"
          onCreate={async (name) => {
            await handleCreateCollection(name, '');
          }}
          onPick={(item) => handleBulkAddCollection(item.id)}
          onClose={() => setBatchCollectionOpen(false)}
        />
      )}

      {batchTagOpen && (
        <BatchPickerModal
          title="Ajouter un tag"
          subtitle="Applique un tag a toute la selection pour accelerer le tri."
          items={allTags}
          itemLabel={(item) => item.name}
          itemMeta={(item) => item.color || 'Tag'}
          createLabel="Creer le tag"
          newItemPlaceholder="Nom du tag"
          onCreate={async (name) => {
            await handleCreateTag(name, ui.accent || '#38bdf8');
          }}
          onPick={(item) => handleBulkAddTag(item.id)}
          onClose={() => setBatchTagOpen(false)}
        />
      )}

      <SettingsDrawer
        open={settingsOpen}
        ui={ui}
        vault={vaultState}
        onClose={() => setSettingsOpen(false)}
        onChange={handleUpdateSettings}
        onPickBackground={handlePickBackgroundImage}
        onRemoveBackground={handleRemoveBackgroundImage}
        onUpdateVaultPrefs={async (patch) => refreshWith(window.mangaAPI.updateVaultPrefs(patch))}
        onLockVault={handleLockVault}
        onPanicLock={triggerPanicLock}
      />

      {editingMetadata && (
        <MetadataEditorModal
          manga={editingMetadata}
          onClose={() => setEditingMetadata(null)}
          onSave={handleSaveMetadata}
          onUpdateLocks={handleUpdateMetadataLocks}
          onImportComicInfo={handleImportComicInfoForManga}
        />
      )}

      {tagManagerManga && (
        <TagManagerModal
          manga={tagManagerManga}
          allTags={payload?.persisted?.tags ?? {}}
          onToggleTag={handleToggleTag}
          onCreateTag={handleCreateTag}
          onDeleteTag={handleDeleteTag}
          onClose={() => setTagManagerManga(null)}
        />
      )}

      {collectionPickerManga && (
        <CollectionPickerModal
          manga={collectionPickerManga}
          collections={Object.values(payload?.persisted?.collections ?? {})}
          onToggleCollection={(colId) => {
            const col = (payload?.persisted?.collections ?? {})[colId];
            if (!col) return;
            const isIn = (col.mangaIds || []).includes(collectionPickerManga.id);
            if (isIn) {
              handleRemoveMangaFromCollection(colId, collectionPickerManga.id);
            } else {
              handleAddToCollection(collectionPickerManga.id, colId);
            }
          }}
          onCreateCollection={async (name) => {
            await handleCreateCollection(name, '');
            const updated = await window.mangaAPI.bootstrap();
            setPayload(updated);
            const newCols = Object.values(updated?.persisted?.collections ?? {});
            const newest = newCols.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
            if (newest) await handleAddToCollection(collectionPickerManga.id, newest.id);
          }}
          onClose={() => setCollectionPickerManga(null)}
        />
      )}

      {metadataSearchManga && (
        <OnlineMetadataSearchModal
          manga={metadataSearchManga}
          onImport={handleImportOnlineMetadata}
          onClose={() => setMetadataSearchManga(null)}
        />
      )}

      <ContextMenu menu={contextMenu} onClose={closeContextMenu} />
    </div>
  );
}

function CollectionPickerModal({ manga, collections, onToggleCollection, onCreateCollection, onClose }) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [collectionSearch, setCollectionSearch] = useState('');

  const filteredCollections = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((col) => {
      const name = (col?.name || '').toLowerCase();
      const description = (col?.description || '').toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [collections, collectionSearch]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel collection-picker-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Collections — {manga.displayTitle}</h3>
        <p className="muted-text" style={{ margin: '0 0 12px' }}>Coche les collections auxquelles ajouter ce manga.</p>
        {collections.length > 0 && (
          <div className="modal-search-row">
            <SearchIcon size={15} />
            <input
              className="modal-search-input"
              value={collectionSearch}
              onChange={(e) => setCollectionSearch(e.target.value)}
              placeholder="Rechercher une collection"
            />
          </div>
        )}
        <div className="collection-picker-list">
          {collections.length === 0 && <p className="muted-text">Aucune collection. Crée-en une ci-dessous.</p>}
          {collections.length > 0 && filteredCollections.length === 0 && (
            <p className="muted-text modal-empty-state">Aucune collection ne correspond à la recherche.</p>
          )}
          {filteredCollections.map((col) => {
            const isIn = (col.mangaIds || []).includes(manga.id);
            return (
              <label key={col.id} className="collection-picker-item">
                <input type="checkbox" checked={isIn} onChange={() => onToggleCollection(col.id)} />
                <span>{col.name}</span>
                <small className="muted-text">{(col.mangaIds || []).length} manga{(col.mangaIds || []).length > 1 ? 's' : ''}</small>
              </label>
            );
          })}
        </div>
        {creating ? (
          <form className="collection-picker-create" onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            await onCreateCollection(newName.trim());
            setNewName('');
            setCreating(false);
          }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom de la collection" autoFocus />
            <button type="submit" className="primary-button" disabled={!newName.trim()}>Créer</button>
            <button type="button" className="ghost-button" onClick={() => setCreating(false)}>Annuler</button>
          </form>
        ) : (
          <button className="ghost-button" onClick={() => setCreating(true)} style={{ marginTop: 8 }}>
            <PlusIcon size={14} /> Nouvelle collection
          </button>
        )}
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function OnlineMetadataSearchModal({ manga, onImport, onClose }) {
  const [query, setQuery] = useState(manga.displayTitle || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(null);

  async function handleSearch(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const response = await window.mangaAPI.searchOnlineMetadata(query.trim());
      setResults(response.results || []);
      if (response.error) setError(response.error);
    } catch (err) {
      setError(err?.message || 'Erreur réseau');
    }
    setLoading(false);
  }

  async function handleImport(item) {
    setImporting(item.malId);
    try {
      await onImport(manga.id, item);
      onClose();
    } catch (_) {
      setError("Erreur lors de l'import");
      setImporting(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-panel-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Rechercher des métadonnées — {manga.displayTitle}</h3>
        <p className="muted-text">Les données importées sont copiées localement et restent disponibles hors ligne.</p>
        <form onSubmit={handleSearch} className="online-search-form">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un manga…" autoFocus />
          <button type="submit" className="primary-button" disabled={loading || !query.trim()}>
            {loading ? 'Recherche…' : 'Rechercher'}
          </button>
        </form>
        {error && <p className="muted-text" style={{ color: '#ef4444' }}>{error}</p>}
        <div className="online-results-list">
          {results.map((item) => (
            <div key={item.malId} className="online-result-card">
              <div className="online-result-cover">
                {(item.coverPreviewSrc || item.coverUrl) ? <img src={item.coverPreviewSrc || item.coverUrl} alt={item.title} /> : <div className="cover-fallback">?</div>}
              </div>
              <div className="online-result-info">
                <strong>{item.title}</strong>
                {item.titleJapanese && <small>{item.titleJapanese}</small>}
                {item.authors && <span className="muted-text">{item.authors}</span>}
                {item.synopsis && <p className="manga-description-clamp">{item.synopsis.slice(0, 200)}…</p>}
                <div className="online-result-meta">
                  {item.score && <span className="badge-pill">Score: {item.score}</span>}
                  {item.genres?.slice(0, 3).map((g) => <span key={g} className="badge-pill">{g}</span>)}
                </div>
              </div>
              <button
                className="primary-button online-result-import"
                onClick={() => handleImport(item)}
                disabled={importing === item.malId}
              >
                {importing === item.malId ? 'Import…' : 'Importer'}
              </button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
