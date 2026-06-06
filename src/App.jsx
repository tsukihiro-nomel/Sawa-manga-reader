import { Suspense, lazy, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import LibraryView from './components/LibraryView.jsx';
import MangaDetailView from './components/MangaDetailView.jsx';
import ChapterPreviewView from './components/ChapterPreviewView.jsx';
import ReaderView from './components/ReaderView.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import Dashboard from './components/Dashboard.jsx';
import TagManagerModal from './components/TagManagerModal.jsx';
import BulkActionBar from './components/BulkActionBar.jsx';
import BatchPickerModal from './components/BatchPickerModal.jsx';
import MetadataEditorModal from './components/MetadataEditorModal.jsx';
import ReadingQueueDrawer from './components/ReadingQueueDrawer.jsx';
import AddEntryMenu from './components/AddEntryMenu.jsx';
import TextPromptModal from './components/TextPromptModal.jsx';
import ShellErrorBoundary from './components/ShellErrorBoundary.jsx';
import { resolveNumberedTabIndex } from './interfaces/kavita/tabInteractions.js';
import { createReaderSessionStore } from './interfaces/kavita/readerSessionStore.js';
import { createInterfaceTransitionCoordinator } from './interfaces/interfaceTransition.js';
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
import { mergePayloadForStability } from './utils/payloadMerge.js';

const SettingsDrawer = lazy(() => import('./components/SettingsDrawer.jsx'));
const CollectionsView = lazy(() => import('./components/CollectionsView.jsx'));
const MaintenanceView = lazy(() => import('./components/MaintenanceView.jsx'));
const MetadataWorkbenchView = lazy(() => import('./components/MetadataWorkbenchView.jsx'));
const VaultView = lazy(() => import('./components/VaultView.jsx'));
const CommandPalette = lazy(() => import('./components/CommandPalette.jsx'));
const SourcesView = lazy(() => import('./components/SourcesView.jsx'));
const KavitaShell = lazy(() => import('./interfaces/kavita/KavitaShell.jsx'));
const preloadKavitaShell = () => import('./interfaces/kavita/KavitaShell.jsx');

const DEFAULT_KEYBOARD_SHORTCUTS = {
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
  openCommandPalette: 'Ctrl+K',
  toggleReadingQueue: 'Ctrl+Shift+Q',
  newTab: 'Ctrl+T',
  closeTab: 'Ctrl+W',
  goBack: 'Alt+ArrowLeft',
  openSettings: 'Ctrl+,',
  openSources: 'Ctrl+Shift+S',
  toggleSidebar: 'Ctrl+B',
  panicLock: 'Ctrl+Shift+L',
  nextTab: 'Ctrl+Tab',
  prevTab: 'Ctrl+Shift+Tab'
};

function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
}

function normalizeShortcutToken(token = '') {
  const value = String(token || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  if (['control', 'ctrl', 'meta', 'cmd', 'command'].includes(lower)) return 'Ctrl';
  if (['shift'].includes(lower)) return 'Shift';
  if (['alt', 'option'].includes(lower)) return 'Alt';
  if (['esc', 'escape'].includes(lower)) return 'Escape';
  if (['arrowleft', 'left'].includes(lower)) return 'ArrowLeft';
  if (['arrowright', 'right'].includes(lower)) return 'ArrowRight';
  if (['arrowup', 'up'].includes(lower)) return 'ArrowUp';
  if (['arrowdown', 'down'].includes(lower)) return 'ArrowDown';
  if (lower === 'browserback') return 'BrowserBack';
  if (lower === 'tab') return 'Tab';
  if (lower === 'space' || lower === 'spacebar') return 'Space';
  if (lower === 'comma') return ',';
  if (lower === 'plus') return '+';
  if (lower === 'minus') return '-';
  if (value.length === 1) return value.toUpperCase();
  return value;
}

function splitShortcut(shortcut = '') {
  return String(shortcut || '')
    .split('+')
    .map((token) => normalizeShortcutToken(token))
    .filter(Boolean);
}

function getEventShortcutTokens(event) {
  const tokens = [];
  if (event.ctrlKey || event.metaKey) tokens.push('Ctrl');
  if (event.shiftKey) tokens.push('Shift');
  if (event.altKey) tokens.push('Alt');

  let key = event.key || event.code || '';
  if (key === '=' && event.shiftKey) key = '+';
  const normalizedKey = normalizeShortcutToken(key);
  if (normalizedKey && !['Ctrl', 'Shift', 'Alt'].includes(normalizedKey)) {
    tokens.push(normalizedKey);
  }
  return tokens;
}

function eventMatchesShortcut(event, shortcut = '') {
  const expected = splitShortcut(shortcut);
  if (expected.length === 0) return false;
  const actual = getEventShortcutTokens(event);
  if (expected.length !== actual.length) return false;
  return expected.every((token, index) => token === actual[index]);
}

function formatShortcutLabel(shortcut = '') {
  return splitShortcut(shortcut).join('+');
}

function LazyPanelPlaceholder({ label = 'Chargement de l interface...' }) {
  return (
    <div className="settings-note lazy-panel-placeholder">
      {label}
    </div>
  );
}

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

function choosePreferredOcrLanguages(info = {}) {
  const languageCodes = (Array.isArray(info?.languages) ? info.languages : [])
    .map((entry) => String(entry?.code || entry?.label || entry || '').trim())
    .filter(Boolean);

  if (languageCodes.length === 0) {
    if (info?.engineKind === 'windows-ocr') return ['fr-FR'];
    return ['eng'];
  }

  if (info?.engineKind === 'windows-ocr') {
    const preferred = languageCodes.find((code) => /^fr\b|^fr-/i.test(code))
      || languageCodes.find((code) => /^en\b|^en-/i.test(code))
      || languageCodes.find((code) => /^ja\b|^ja-/i.test(code))
      || languageCodes[0];
    return preferred ? [preferred] : [languageCodes[0]];
  }

  const preferred = [
    languageCodes.find((code) => /^eng$/i.test(code)),
    languageCodes.find((code) => /^jpn$/i.test(code)),
    languageCodes.find((code) => /^(fra|fre|fr)$/i.test(code))
  ].filter(Boolean);

  return preferred.length > 0 ? [...new Set(preferred)] : [languageCodes[0]];
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

function neutralizeLockedVaultTabs(meta, view, vault, manga) {
  if (!vault?.locked || !view?.mangaId) return meta;
  const mangaId = String(view.mangaId);
  const privateIds = Array.isArray(vault.privateMangaIds) ? vault.privateMangaIds : [];
  const knownPrivate = privateIds.some((entry) => String(entry) === mangaId);
  if (!knownPrivate && manga) return meta;
  return {
    ...meta,
    label: 'Contenu prive',
    subtitle: 'Coffre verrouille'
  };
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

function makeViewScrollKey(tabId, view, activeScreen = 'library', screenContextKey = 'all') {
  const screen = view?.screen || 'library';
  const mangaId = view?.mangaId || 'none';
  const chapterId = view?.chapterId || 'none';
  return `${tabId}:${screen}:${mangaId}:${chapterId}:${activeScreen}:${screenContextKey || 'all'}`;
}

function normalizeThemeName(theme) {
  if (theme === 'dark') return 'dark-night';
  if (theme === 'light') return 'light-paper';
  return theme || 'dark-night';
}

function normalizeInterfaceMode(ui = {}) {
  return ui.interfaceMode === 'kavita' || ui.interfaceMode === 'kavita-clean' || ui.theme === 'kavita-clean'
    ? 'kavita'
    : 'sawa';
}

function shouldShowKavitaUpgradeBanner(ui = {}) {
  return normalizeInterfaceMode(ui) !== 'kavita' && !ui.kavitaUpgradePromptSeen;
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

function toSortableNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractOrderFromText(value) {
  const text = String(value || '');
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)/g)];
  if (!matches.length) return null;
  return toSortableNumber(matches[matches.length - 1][1]);
}

function buildChapterOrderDescriptor(chapter, index = 0) {
  const metadataVolume = toSortableNumber(chapter?.volume);
  const metadataNumber = toSortableNumber(chapter?.number);
  if (metadataVolume !== null || metadataNumber !== null) {
    return {
      tier: 0,
      volume: metadataVolume ?? 0,
      number: metadataNumber ?? 0,
      fallback: String(chapter?.name || '').toLowerCase(),
      index
    };
  }

  const filenameNumber = extractOrderFromText(chapter?.name) ?? extractOrderFromText(chapter?.path);
  if (filenameNumber !== null) {
    return {
      tier: 1,
      volume: 0,
      number: filenameNumber,
      fallback: String(chapter?.name || '').toLowerCase(),
      index
    };
  }

  return {
    tier: 2,
    volume: 0,
    number: index,
    fallback: String(chapter?.name || '').toLowerCase(),
    index
  };
}

function sortChaptersForNextCandidate(chapters = []) {
  return [...chapters]
    .map((chapter, index) => ({ chapter, order: buildChapterOrderDescriptor(chapter, index) }))
    .sort((left, right) => (
      left.order.tier - right.order.tier
      || left.order.volume - right.order.volume
      || left.order.number - right.order.number
      || left.order.fallback.localeCompare(right.order.fallback, 'fr')
      || left.order.index - right.order.index
    ))
    .map((entry) => entry.chapter);
}

function buildMangaOrderDescriptor(manga, index = 0) {
  const metadataVolume = toSortableNumber(manga?.volume);
  const metadataNumber = toSortableNumber(manga?.number);
  if (metadataVolume !== null || metadataNumber !== null) {
    return {
      tier: 0,
      volume: metadataVolume ?? 0,
      number: metadataNumber ?? 0,
      fallback: String(manga?.displayTitle || manga?.name || '').toLowerCase(),
      index
    };
  }

  const filenameNumber = extractOrderFromText(manga?.displayTitle) ?? extractOrderFromText(manga?.path);
  if (filenameNumber !== null) {
    return {
      tier: 1,
      volume: 0,
      number: filenameNumber,
      fallback: String(manga?.displayTitle || manga?.name || '').toLowerCase(),
      index
    };
  }

  return {
    tier: 2,
    volume: 0,
    number: index,
    fallback: String(manga?.displayTitle || manga?.name || '').toLowerCase(),
    index
  };
}

function sortMangasForNextCandidate(mangas = []) {
  return [...mangas]
    .map((manga, index) => ({ manga, order: buildMangaOrderDescriptor(manga, index) }))
    .sort((left, right) => (
      left.order.tier - right.order.tier
      || left.order.volume - right.order.volume
      || left.order.number - right.order.number
      || left.order.fallback.localeCompare(right.order.fallback, 'fr')
      || left.order.index - right.order.index
    ))
    .map((entry) => entry.manga);
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
  const [syncStatus, setSyncStatus] = useState(null);
  const [batchCollectionOpen, setBatchCollectionOpen] = useState(false);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [requestedCollectionId, setRequestedCollectionId] = useState(null);
  const [requestedCollectionsTab, setRequestedCollectionsTab] = useState('manual');
  const [chapterPagesCache, setChapterPagesCache] = useState({});
  const [bootError, setBootError] = useState('');
  const [readingQueueOpen, setReadingQueueOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);
  const [advancedSearchState, setAdvancedSearchState] = useState({ query: '', results: [], busy: false, error: '' });
  const [duplicateCandidates, setDuplicateCandidates] = useState([]);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationFeedback, setMigrationFeedback] = useState('');
  const [plugins, setPlugins] = useState([]);
  const [pluginBusyId, setPluginBusyId] = useState(null);
  const [pluginFeedback, setPluginFeedback] = useState('');
  const [addEntryMenuAnchor, setAddEntryMenuAnchor] = useState(null);
  const [sourcesSection, setSourcesSection] = useState('explorer');
  const [sourceExplorerContext, setSourceExplorerContext] = useState(null);
  const [panicSession, setPanicSession] = useState('inactive');
  const [vaultCategoryFilterId, setVaultCategoryFilterId] = useState(null);
  const [renderedInterfaceMode, setRenderedInterfaceMode] = useState(null);
  const [interfaceTransitioning, setInterfaceTransitioning] = useState(false);
  const [interfaceTransitionError, setInterfaceTransitionError] = useState('');
  const [textPromptState, setTextPromptState] = useState({
    open: false,
    title: '',
    description: '',
    label: 'Nom',
    defaultValue: '',
    placeholder: '',
    confirmLabel: 'Valider',
    cancelLabel: 'Annuler',
    onConfirm: null
  });
  const scrollPositionsRef = useRef({});
  const screenHistoryRef = useRef([]);
  const legacyExperimentalPatchPendingRef = useRef(false);
  const readerSessionStoreRef = useRef(null);
  const interfaceTransitionLockRef = useRef(false);
  const previousInterfaceModeRef = useRef('sawa');
  if (!readerSessionStoreRef.current) {
    readerSessionStoreRef.current = createReaderSessionStore({
      persistProgress: (progress) => window.mangaAPI.updateProgressLight(progress),
      commitProgress: (progress, meta) => commitReaderProgress(progress, meta),
      persistSettings: (settings) => window.mangaAPI.updateSettingsLight({
        kavitaReaderSettings: settings
      }),
      commitSettings: (settings) => commitKavitaReaderSettings(settings)
    });
  }

  // Stable callback wrappers — prop-level handlers below are redeclared on every render (plain
  // `function` declarations), which breaks React.memo on LibraryView/Dashboard/VaultView/etc. and
  // cascades into re-rendering every visible MangaCard. We read the latest implementation through
  // a ref so the wrappers keep a stable identity for the whole component lifetime.
  const latestHandlersRef = useRef({});
  const stableOpenManga = useCallback((id) => latestHandlersRef.current.openMangaInCurrentTab?.(id), []);
  const stableOpenMangaInNewTab = useCallback((id, options) => latestHandlersRef.current.openMangaInNewTab?.(id, options), []);
  const stableOpenMangaInBackgroundTab = useCallback((id) => latestHandlersRef.current.openMangaInNewTab?.(id, { activate: false }), []);
  const stableToggleFavorite = useCallback((id) => latestHandlersRef.current.handleToggleFavorite?.(id), []);
  const stableToggleSelectedManga = useCallback((id) => latestHandlersRef.current.toggleSelectedManga?.(id), []);
  const stableToggleSelectionMode = useCallback(() => latestHandlersRef.current.toggleSelectionMode?.(), []);
  const stableOpenContextMenu = useCallback((event, context) => latestHandlersRef.current.openContextMenu?.(event, context), []);
  const stableResumeManga = useCallback((id) => latestHandlersRef.current.resumeMangaInCurrentTab?.(id), []);

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
    let unsubscribeSync = () => {};
    let disposed = false;
    let idleProbeId = null;
    let syncProbeTimer = null;
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
        setPlugins(Array.isArray(nextPayload?.plugins) ? nextPayload.plugins : []);
        const runSyncProbe = () => {
          window.mangaAPI.getSyncStatus().then((status) => {
            if (!disposed) setSyncStatus(status);
          }).catch(() => {
            if (!disposed) setSyncStatus(null);
          });
        };
        if (typeof window.requestIdleCallback === 'function') {
          idleProbeId = window.requestIdleCallback(runSyncProbe, { timeout: 1600 });
        } else {
          syncProbeTimer = window.setTimeout(runSyncProbe, 900);
        }
        const restoredSession = restoreSessionModel(nextPayload?.persisted?.session);
        setWorkspaces(restoredSession.workspaces);
        setActiveWorkspaceId(restoredSession.activeWorkspaceId);
        setPanicSession('inactive');
        unsubscribe = window.mangaAPI.onLibraryChanged((incoming) => {
          if (disposed) return;
          startTransition(() => {
            setPayload((previous) => mergePayloadForStability(previous, incoming));
            if (Array.isArray(incoming?.plugins)) {
              setPlugins(incoming.plugins);
            }
          });
        });
        unsubscribeSync = window.mangaAPI.onSyncStatusChanged((incoming) => {
          if (!disposed) setSyncStatus(incoming);
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
      if (idleProbeId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleProbeId);
      }
      if (syncProbeTimer != null) {
        window.clearTimeout(syncProbeTimer);
      }
      unsubscribe();
      unsubscribeSync();
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
    const addonSourcesWebActif = plugins.some(
      (plugin) => plugin.id === 'sources-web' && plugin.installed && plugin.enabled
    );
    if (addonSourcesWebActif) return;
    setAddEntryMenuAnchor(null);
    setSourcesSection('explorer');
    setSourceExplorerContext(null);
    setActiveScreen((current) => (current === 'sources' ? 'library' : current));
  }, [plugins]);

  useEffect(() => {
    if (panicSession !== 'recovered') return undefined;
    const timer = window.setTimeout(() => {
      setPanicSession('inactive');
    }, 120);
    return () => window.clearTimeout(timer);
  }, [panicSession]);

  const persistedUi = payload?.persisted?.ui ?? {};
  const theme = normalizeThemeName(persistedUi.theme);
  const persistedInterfaceMode = normalizeInterfaceMode(persistedUi);
  const interfaceMode = renderedInterfaceMode || persistedInterfaceMode;
  const interfaceClassName = 'interface-sawa';
  const ui = {
    ...persistedUi,
    theme,
    interfaceMode,
    experimental: {
      ...(persistedUi.experimental || {}),
      advancedSearch: true,
      archiveFormats: true,
      ocr: true,
      pluginPreview: true,
      visualReader: false,
      guidedView: false,
      visualDedupe: false
    }
  };

  useEffect(() => {
    if (!renderedInterfaceMode && payload) {
      setRenderedInterfaceMode(persistedInterfaceMode);
      previousInterfaceModeRef.current = persistedInterfaceMode;
    }
  }, [payload, persistedInterfaceMode, renderedInterfaceMode]);

  useEffect(() => {
    if (!payload || interfaceMode === 'kavita') return undefined;
    const preload = () => {
      void preloadKavitaShell().catch(() => {});
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(preload, 800);
    return () => window.clearTimeout(timer);
  }, [interfaceMode, payload]);

  useEffect(() => {
    if (!payload) return;
    const persistedExperimental = payload?.persisted?.ui?.experimental || {};
    if (!persistedExperimental.visualReader && !persistedExperimental.guidedView && !persistedExperimental.visualDedupe) {
      legacyExperimentalPatchPendingRef.current = false;
      return;
    }
    if (legacyExperimentalPatchPendingRef.current) {
      return;
    }
    legacyExperimentalPatchPendingRef.current = true;
    const patchedExperimental = {
      ...persistedExperimental,
      visualReader: false,
      guidedView: false,
      visualDedupe: false
    };
    const applyLegacyPatch = window.mangaAPI.updateSettingsLight
      ? window.mangaAPI.updateSettingsLight({ experimental: patchedExperimental })
      : window.mangaAPI.updateSettings({ experimental: patchedExperimental });
    applyLegacyPatch.then((nextPayload) => {
      legacyExperimentalPatchPendingRef.current = false;
      if (nextPayload?.persisted) {
        setPayload(nextPayload);
      } else {
        startTransition(() => {
          setPayload((previous) => mergeUiSettingsIntoPayload(previous, { experimental: patchedExperimental }));
        });
      }
    }).catch(() => {
      legacyExperimentalPatchPendingRef.current = false;
      // Garder l'UI stable meme si la migration de flags ne passe pas du premier coup.
    });
  }, [
    payload,
    payload?.persisted?.ui?.experimental?.visualReader,
    payload?.persisted?.ui?.experimental?.guidedView,
    payload?.persisted?.ui?.experimental?.visualDedupe
  ]);

  const keyboardShortcuts = useMemo(() => {
    const customShortcuts = ui.keyboardShortcuts || {};
    return Object.fromEntries(
      Object.entries(DEFAULT_KEYBOARD_SHORTCUTS).map(([id, shortcut]) => [
        id,
        typeof customShortcuts[id] === 'string' && customShortcuts[id].trim()
          ? customShortcuts[id]
          : shortcut
      ])
    );
  }, [ui.keyboardShortcuts]);
  const experimental = ui.experimental ?? {};
  const library = payload?.library ?? { categories: [], allMangas: [], favorites: [], recents: [] };
  const webSourcesPlugin = useMemo(
    () => (plugins.find((plugin) => plugin.id === 'sources-web') ?? payload?.plugins?.find?.((plugin) => plugin.id === 'sources-web') ?? null),
    [plugins, payload?.plugins]
  );
  const webSourcesEnabled = Boolean(webSourcesPlugin?.installed && webSourcesPlugin?.enabled);

  const selectedCategoryId = payload?.persisted.ui.selectedCategoryId ?? null;
  const selectedCategory = library.categories.find((category) => category.id === selectedCategoryId) ?? null;

  const visibleCategories = useMemo(() => {
    return library.categories.filter((category) => !category.hidden);
  }, [library.categories]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? INITIAL_TAB;
  const activeView = getTabView(activeTab);
  const activeScrollScope = activeScreen === 'vault'
    ? `vault:${vaultCategoryFilterId ?? 'all'}`
    : activeScreen === 'sources'
      ? `sources:${sourcesSection || 'explorer'}`
      : `category:${selectedCategoryId ?? 'all'}`;
  const activeScrollKey = useMemo(
    () => makeViewScrollKey(activeTab?.id || 'tab', activeView, activeScreen, activeScrollScope),
    [activeTab?.id, activeView, activeScreen, activeScrollScope]
  );
  const activeInitialScrollTop = scrollPositionsRef.current[activeScrollKey] ?? 0;

  useEffect(() => {
    window.mangaAPI?.setReaderActive?.(activeView.screen === 'reader');
    return () => {
      window.mangaAPI?.setReaderActive?.(false);
    };
  }, [activeView.screen]);

  useEffect(() => {
    const flushOnBlur = () => {
      void flushReaderSession().catch(() => {});
    };
    window.addEventListener('blur', flushOnBlur);
    return () => {
      window.removeEventListener('blur', flushOnBlur);
      void flushReaderSession().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let lastSignalAt = 0;
    const emitInteraction = () => {
      const now = Date.now();
      if ((now - lastSignalAt) < 1200) return;
      lastSignalAt = now;
      window.mangaAPI?.markInteraction?.();
    };

    window.addEventListener('pointerdown', emitInteraction, { passive: true });
    window.addEventListener('keydown', emitInteraction);
    window.addEventListener('wheel', emitInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', emitInteraction);
      window.removeEventListener('keydown', emitInteraction);
      window.removeEventListener('wheel', emitInteraction);
    };
  }, []);
  const captureCurrentViewScroll = useCallback(() => {
    const currentScrollable = document.querySelector(
      '.library-view, .detail-view, .preview-view, .dashboard-view, .collections-view, .vault-view, .maintenance-view, .workbench-view, .sources-view'
    );
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

  const deferredSearch = useDeferredValue(search);
  const parsedSearch = useMemo(() => parseSearchQuery(deferredSearch), [deferredSearch]);
  const advancedSearchQuery = useMemo(
    () => (parsedSearch.textTerms || []).join(' ').trim(),
    [parsedSearch]
  );

  useEffect(() => {
    if (!payload || !advancedSearchQuery) {
      setAdvancedSearchState({ query: '', results: [], busy: false, error: '' });
      return;
    }

    let disposed = false;
    setAdvancedSearchState((prev) => ({
      ...prev,
      query: advancedSearchQuery,
      busy: true,
      error: ''
    }));

    window.mangaAPI.searchAdvanced({ query: advancedSearchQuery, limit: 120 }).then((result) => {
      if (disposed) return;
      setAdvancedSearchState({
        query: result?.query || advancedSearchQuery,
        results: Array.isArray(result?.results) ? result.results : [],
        busy: false,
        error: ''
      });
    }).catch((error) => {
      if (disposed) return;
      setAdvancedSearchState({
        query: advancedSearchQuery,
        results: [],
        busy: false,
        error: error?.message || 'Recherche avancee indisponible.'
      });
    });

    return () => {
      disposed = true;
    };
  }, [payload, advancedSearchQuery]);

  const advancedSearchMangaIds = useMemo(() => {
    if (!advancedSearchQuery) return null;
    const matches = new Set();
    (advancedSearchState.results || []).forEach((result) => {
      const directManga = findManga(library, result?.itemContentId || result?.itemLocationId);
      if (directManga) {
        matches.add(directManga.id);
        return;
      }

      library.allMangas.forEach((manga) => {
        if ((manga.chapters || []).some((chapter) => matchesEntityReference(chapter, result?.itemContentId || result?.itemLocationId))) {
          matches.add(manga.id);
        }
      });
    });
    return matches;
  }, [advancedSearchQuery, advancedSearchState.results, library]);

  const filteredMangas = useMemo(() => {
    const byCategory = baseMangas.filter((manga) => {
      if (!ui.showHiddenCategories && manga.categoryHidden) return false;
      if (selectedCategory && manga.categoryId !== selectedCategory.id) return false;
      return true;
    });
    const indexedCandidates = advancedSearchMangaIds instanceof Set
      ? byCategory.filter((manga) => advancedSearchMangaIds.has(manga.id))
      : byCategory;
    const bySearch = applySearchQuery(indexedCandidates, parsedSearch, {
      collectionsById: payload?.persisted?.collections || {}
    });
    return sortMangas(bySearch, ui.sort);
  }, [advancedSearchMangaIds, baseMangas, parsedSearch, payload?.persisted?.collections, ui.showHiddenCategories, ui.sort, selectedCategory]);

  const searchStatus = useMemo(() => {
    if (!advancedSearchQuery) return null;
    if (advancedSearchState.busy) {
      return { label: 'index local...', tone: 'neutral' };
    }
    if (advancedSearchState.error) {
      return { label: 'index indisponible', tone: 'warning' };
    }
    return {
      label: `index local ${advancedSearchState.results.length}`,
      tone: 'success'
    };
  }, [advancedSearchQuery, advancedSearchState]);

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
  const sidebarSections = useMemo(
    () => (Array.isArray(ui.sidebarSections) ? ui.sidebarSections : []),
    [ui.sidebarSections]
  );
  const sidebarHiddenSections = useMemo(
    () => (ui.sidebarHiddenSections && typeof ui.sidebarHiddenSections === 'object' ? ui.sidebarHiddenSections : {}),
    [ui.sidebarHiddenSections]
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
    const collectDetails = activeScreen === 'maintenance';
    const missingCover = [];
    const missingMetadata = [];
    const sparseChapters = [];
    const duplicateMap = new Map();
    let missingCoverCount = 0;
    let missingMetadataCount = 0;
    let sparseChaptersCount = 0;

    library.allMangas.forEach((manga) => {
      const displayTitle = manga.displayTitle || manga.name || 'Manga';
      const normalizedTitle = displayTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

      if (normalizedTitle) {
        if (collectDetails) {
          const group = duplicateMap.get(normalizedTitle) ?? [];
          group.push(manga);
          duplicateMap.set(normalizedTitle, group);
        } else {
          duplicateMap.set(normalizedTitle, (duplicateMap.get(normalizedTitle) || 0) + 1);
        }
      }

      if (!manga.coverSrc || manga.coverType === 'default') {
        missingCoverCount += 1;
        if (collectDetails) missingCover.push(manga);
      }

      const hasAuthor = typeof manga.author === 'string' && manga.author.trim();
      const hasDescription = typeof manga.description === 'string' && manga.description.trim();
      if (!hasAuthor || !hasDescription) {
        missingMetadataCount += 1;
        if (collectDetails) missingMetadata.push(manga);
      }

      const chapters = Array.isArray(manga.chapters) ? manga.chapters : [];
      if (!chapters.length) {
        sparseChaptersCount += 1;
        if (collectDetails) {
          sparseChapters.push({ manga, reason: 'Aucun chapitre detecte dans ce dossier.' });
        }
        return;
      }

      const emptyChapter = chapters.find((chapter) => !chapter.pageCount || chapter.pageCount <= 0);
      if (emptyChapter) {
        sparseChaptersCount += 1;
        if (collectDetails) {
          sparseChapters.push({
            manga,
            reason: `${emptyChapter.name || 'Chapitre'} semble vide ou incomplet.`
          });
        }
      }
    });

    const duplicateGroups = collectDetails
      ? [...duplicateMap.entries()]
        .filter(([, mangas]) => mangas.length > 1)
        .map(([key, mangas]) => ({
          key,
          mangas,
          label: mangas[0]?.displayTitle || mangas[0]?.name || 'Titre proche'
        }))
      : [];
    const duplicateGroupCount = collectDetails
      ? duplicateGroups.length
      : [...duplicateMap.values()].filter((count) => count > 1).length;

    return {
      missingCover,
      missingMetadata,
      sparseChapters,
      duplicateGroups,
      missingCoverCount,
      missingMetadataCount,
      sparseChaptersCount,
      duplicateGroupCount,
      totalCount: missingCoverCount + missingMetadataCount + sparseChaptersCount + duplicateGroupCount
    };
  }, [activeScreen, library.allMangas]);

  const maintenanceCount = maintenanceIssues.totalCount || 0;

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
    window.mangaAPI.getStats({ includeOcr: activeScreen === 'maintenance' }).then((stats) => {
      if (!disposed) {
        setMaintenanceStats(stats);
        if (stats?.syncStatus) setSyncStatus(stats.syncStatus);
        if (stats?.ocr) setOcrStatus(stats.ocr);
      }
    }).catch(() => {
      if (!disposed) setMaintenanceStats(null);
    });
    window.mangaAPI.getMigrationStatus?.().then((status) => {
      if (!disposed) setMigrationStatus(status);
    }).catch(() => {
      if (!disposed) setMigrationStatus(null);
    });

    setDuplicateCandidates([]);
    return () => {
      disposed = true;
    };
  }, [!!payload, activeScreen]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    let disposed = false;
    setPluginFeedback('');
    window.mangaAPI.listPlugins().then((result) => {
      if (!disposed) setPlugins(Array.isArray(result?.plugins) ? result.plugins : []);
    }).catch(() => {
      if (!disposed) setPlugins([]);
    });
    return () => {
      disposed = true;
    };
  }, [settingsOpen]);

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
      const secureMeta = (meta) => neutralizeLockedVaultTabs(meta, view, vaultState, manga);
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
          sources: 'Sources web',
          vault: 'Coffre'
        };
        const screenSubtitles = {
          dashboard: 'Vue d ensemble',
          collections: 'Collections et vues intelligentes',
          favorites: 'Tes favoris',
          recents: 'Dernieres lectures',
          maintenance: 'Centre d entretien',
          workbench: 'Metadata et covers en lot',
          sources: sourcesSection === 'catalogue' ? 'Depots et extensions' : 'Recherche et import',
          vault: 'Zone privee'
        };
        return secureMeta({
          id: tab.id,
          kind: 'library',
          pinned: Boolean(tab.pinned),
          label: screenLabels[activeScreen] || 'Bibliotheque',
          subtitle: screenSubtitles[activeScreen] || selectedCategory?.name || 'Toute la bibliotheque'
        });
      }

      if (view.screen === 'manga') {
        return secureMeta({
          id: tab.id,
          kind: 'manga',
          pinned: Boolean(tab.pinned),
          label: manga?.displayTitle ?? 'Manga',
          subtitle: manga?.author || 'Détails du manga'
        });
      }

      if (view.screen === 'preview') {
        return secureMeta({
          id: tab.id,
          kind: 'preview',
          pinned: Boolean(tab.pinned),
          label: manga?.displayTitle ?? 'Aperçu',
          subtitle: chapter?.name ?? 'Aperçu du chapitre'
        });
      }

      return secureMeta({
        id: tab.id,
        kind: 'reader',
        pinned: Boolean(tab.pinned),
        label: manga?.displayTitle ?? 'Lecture',
        subtitle: chapter?.name ?? 'Mode lecture'
      });
    });
  }, [tabs, entityLibrary, activeScreen, selectedCategory, sourcesSection, vaultState]);

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
      if (commandPaletteOpen) {
        setCommandPaletteOpen(false);
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
  }, [readingQueueOpen, commandPaletteOpen, searchHelpOpen]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      const tagName = target?.tagName?.toLowerCase();
      return target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
    };

    const onKeyDown = (event) => {
      const lowerKey = String(event.key || '').toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || lowerKey !== 'k') return;
      if (isEditableTarget(event.target) && !commandPaletteOpen) return;
      event.preventDefault();
      setCommandPaletteOpen((prev) => !prev);
      setCommandPaletteQuery('');
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [commandPaletteOpen]);

  function mergeUiSettingsIntoPayload(previousPayload, patch = {}) {
    if (!previousPayload || !patch || typeof patch !== 'object') return previousPayload;
    const previousPersisted = previousPayload.persisted || {};
    const previousUi = previousPersisted.ui || {};
    const nextUi = {
      ...previousUi,
      ...patch,
      experimental: patch?.experimental
        ? {
            ...(previousUi.experimental || {}),
            ...patch.experimental
          }
        : (previousUi.experimental || {})
    };
    return {
      ...previousPayload,
      persisted: {
        ...previousPersisted,
        ui: nextUi
      }
    };
  }

  function mergeVaultPrefsIntoPayload(previousPayload, patch = {}) {
    if (!previousPayload || !patch || typeof patch !== 'object') return previousPayload;
    const previousPersisted = previousPayload.persisted || {};
    const previousVault = previousPersisted.vault || {};
    const nextVault = {
      ...previousVault,
      ...patch
    };
    return {
      ...previousPayload,
      persisted: {
        ...previousPersisted,
        vault: nextVault
      }
    };
  }

  async function refreshWith(promise) {
    const nextPayload = await promise;
    startTransition(() => {
      setPayload((previous) => mergePayloadForStability(previous, nextPayload));
    });
  }

  function scheduleBackgroundBootstrapRefresh(delay = 1200) {
    window.setTimeout(() => {
      const run = () => refreshWith(window.mangaAPI.bootstrap()).catch(() => {});
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 3500 });
      } else {
        run();
      }
    }, delay);
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

  async function popActiveView() {
    await flushReaderSession();
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

  async function openNewLibraryTab(options = {}) {
    await flushReaderSession();
    openNewTab(normalizeView(), [], options);
  }

  async function switchWorkspace(workspaceId) {
    if (!workspaceId || workspaceId === activeWorkspaceId) return;
    await flushReaderSession();
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
    requestTextPrompt({
      title: "Renommer l'espace",
      description: 'Choisis un nom simple pour retrouver cet espace rapidement.',
      label: "Nom de l'espace",
      defaultValue: workspace.name,
      placeholder: 'Espace lecture',
      confirmLabel: 'Renommer',
      onConfirm: async (value) => {
        const nextName = String(value || '').trim();
        if (!nextName) return;
        setWorkspaces((prev) => prev.map((item) => (item.id === workspaceId ? { ...item, name: nextName } : item)));
      }
    });
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

  async function closeTab(tabId) {
    await flushReaderSession();
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

  async function handleSelectTab(tabId) {
    if (tabId === activeTabId) return;
    await flushReaderSession();
    captureCurrentViewScroll();
    setActiveTabId(tabId);
  }

  function rememberScreenTransition(nextScreen) {
    if (!nextScreen || nextScreen === activeScreen) return;
    const history = screenHistoryRef.current;
    if (history[history.length - 1] !== activeScreen) {
      history.push(activeScreen);
      if (history.length > 24) {
        history.splice(0, history.length - 24);
      }
    }
  }

  function pullPreviousScreen(fallbackScreen = 'library') {
    const history = screenHistoryRef.current;
    while (history.length > 0) {
      const previous = history.pop();
      if (previous && previous !== activeScreen) return previous;
    }
    return fallbackScreen;
  }

  function navigateToScreen(screen, options = {}) {
    if (!screen || screen === activeScreen) return;
    if (options.captureScroll !== false) {
      captureCurrentViewScroll();
    }
    if (!options.replaceHistory) {
      rememberScreenTransition(screen);
    }
    setActiveScreen(screen);
  }

  function handleScreenChange(screen) {
    navigateToScreen(screen);
    if (screen !== 'collections') {
      setRequestedCollectionId(null);
      setRequestedCollectionsTab('manual');
    }
    if (activeView.screen !== 'library') {
      replaceActiveView(normalizeView());
    }
  }

  function requestTextPrompt(options = {}) {
    setTextPromptState({
      open: true,
      title: options.title || '',
      description: options.description || '',
      label: options.label || 'Nom',
      defaultValue: options.defaultValue || '',
      placeholder: options.placeholder || '',
      confirmLabel: options.confirmLabel || 'Valider',
      cancelLabel: options.cancelLabel || 'Annuler',
      onConfirm: typeof options.onConfirm === 'function' ? options.onConfirm : null
    });
  }

  function closeTextPrompt() {
    setTextPromptState((current) => ({
      ...current,
      open: false,
      onConfirm: null
    }));
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;

      const numberedTabIndex = resolveNumberedTabIndex(event, tabs.length);
      if (numberedTabIndex !== null) {
        event.preventDefault();
        void handleSelectTab(tabs[numberedTabIndex].id);
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.closeTab)) {
        event.preventDefault();
        closeTab(activeTabId);
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.newTab)) {
        event.preventDefault();
        openNewLibraryTab();
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.openCommandPalette)) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.toggleReadingQueue)) {
        event.preventDefault();
        if (panicSession !== 'panic') {
          setReadingQueueOpen((prev) => !prev);
        }
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.panicLock)) {
        event.preventDefault();
        triggerPanicLock();
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.nextTab)) {
        if (tabs.length <= 1) return;
        event.preventDefault();
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
        if (currentIndex === -1) return;
        const nextIndex = (currentIndex + 1 + tabs.length) % tabs.length;
        void handleSelectTab(tabs[nextIndex].id);
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.prevTab)) {
        if (tabs.length <= 1) return;
        event.preventDefault();
        const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
        if (currentIndex === -1) return;
        const nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        void handleSelectTab(tabs[nextIndex].id);
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.openSettings)) {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.openSources)) {
        event.preventDefault();
        handleOpenWebSources();
        return;
      }

      if (eventMatchesShortcut(event, keyboardShortcuts.toggleSidebar)) {
        event.preventDefault();
        void toggleSidebarCollapsed();
        return;
      }

      const lowerKey = String(event.key || '').toLowerCase();
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
  }, [activeTabId, keyboardShortcuts, panicSession, tabs, workspaces]);

  useEffect(() => {
    const goBack = () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (activeTab.stack.length > 1 || activeView.screen !== 'library') {
        captureCurrentViewScroll();
        popActiveView();
        return;
      }
      if (activeScreen !== 'library') {
        captureCurrentViewScroll();
        setActiveScreen(pullPreviousScreen('library'));
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
      if (eventMatchesShortcut(event, keyboardShortcuts.goBack)) {
        event.preventDefault();
        goBack();
        return;
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
  }, [activeScreen, activeTab.stack.length, activeView.screen, keyboardShortcuts.goBack, settingsOpen]);

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
    const chapters = sortChaptersForNextCandidate(Array.isArray(manga.chapters) ? manga.chapters : []);
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
    const sameCategory = sortMangasForNextCandidate(selectableMangas.filter((entry) => entry.categoryId === manga.categoryId));
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
    await handleUpdateSettings({ selectedCategoryId: categoryId });
  }

  async function handleOpenAddCategoriesDirect() {
    await refreshWith(window.mangaAPI.addCategories());
  }

  function closeAddEntryMenu() {
    setAddEntryMenuAnchor(null);
  }

  async function handleOpenAddCategories() {
    closeAddEntryMenu();
    await handleOpenAddCategoriesDirect();
  }

  function handleAddEntry(event) {
    if (!webSourcesEnabled) {
      void handleOpenAddCategoriesDirect();
      return;
    }

    const rect = event?.currentTarget?.getBoundingClientRect?.();
    setAddEntryMenuAnchor(rect ? { left: rect.left, bottom: rect.bottom } : { left: 24, bottom: 92 });
  }

  function handleOpenWebSources() {
    closeAddEntryMenu();
    setSourcesSection('explorer');
    setSourceExplorerContext(null);
    handleScreenChange('sources');
  }

  function handleOpenSourceSeriesForManga(manga) {
    if (!manga?.sourceWeb?.linked) return;
    if (!webSourcesEnabled) {
      setPluginFeedback('Active l addon Sources web pour reprendre cette serie.');
      setSettingsOpen(true);
      return;
    }
    closeAddEntryMenu();
    setSettingsOpen(false);
    setSourcesSection('explorer');
    setSourceExplorerContext({
      manga: {
        id: manga.id || '',
        contentId: manga.contentId || '',
        path: manga.path || '',
        displayTitle: manga.displayTitle || '',
        sourceWeb: manga.sourceWeb || null
      },
      requestedAt: Date.now()
    });
    navigateToScreen('sources');
    if (activeView.screen !== 'library') {
      replaceActiveView(normalizeView());
    }
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
    let normalizedPatch = patch && typeof patch === 'object' ? patch : {};
    if (!Object.keys(normalizedPatch).length) return;
    if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'interfaceMode')) {
      const { interfaceMode: requestedMode, ...remainingPatch } = normalizedPatch;
      const switched = await handleRequestInterfaceMode(requestedMode);
      if (!switched) return;
      normalizedPatch = remainingPatch;
      if (!Object.keys(normalizedPatch).length) return;
    }

    startTransition(() => {
      setPayload((previous) => mergeUiSettingsIntoPayload(previous, normalizedPatch));
    });

    try {
      if (window.mangaAPI.updateSettingsLight) {
        await window.mangaAPI.updateSettingsLight(normalizedPatch);
      } else {
        const nextPayload = await window.mangaAPI.updateSettings(normalizedPatch);
        if (nextPayload?.persisted) {
          startTransition(() => {
            setPayload(nextPayload);
          });
        }
      }
    } catch (_error) {
      try {
        const restored = await window.mangaAPI.bootstrap();
        if (restored?.persisted) {
          startTransition(() => {
            setPayload(restored);
          });
        }
      } catch (_) {
        // On garde l'optimistic UI locale si la persistence echoue temporairement.
      }
    }
  }

  async function handleRequestInterfaceMode(requestedMode) {
    if (interfaceTransitionLockRef.current) return false;
    const nextMode = requestedMode === 'kavita' ? 'kavita' : 'sawa';
    const currentMode = interfaceMode;
    const coordinator = createInterfaceTransitionCoordinator({
      flushReaderSession,
      closeTransientUi: () => {
        setContextMenu(null);
        setAddEntryMenuAnchor(null);
        setCommandPaletteOpen(false);
        setReadingQueueOpen(false);
        setSettingsOpen(false);
      },
      preloadKavita: preloadKavitaShell,
      persistMode: async (mode) => {
        if (!window.mangaAPI.updateSettingsLight) {
          throw new Error('La persistence legere de l interface est indisponible.');
        }
        await window.mangaAPI.updateSettingsLight({ interfaceMode: mode });
      },
      applyMode: (mode) => {
        previousInterfaceModeRef.current = currentMode;
        setRenderedInterfaceMode(mode);
        startTransition(() => {
          setPayload((previous) => mergeUiSettingsIntoPayload(previous, { interfaceMode: mode }));
        });
      },
      setTransition: setInterfaceTransitioning,
      reportError: setInterfaceTransitionError
    });
    setInterfaceTransitionError('');
    interfaceTransitionLockRef.current = true;
    try {
      return await coordinator.request(nextMode, currentMode);
    } finally {
      interfaceTransitionLockRef.current = false;
    }
  }

  function handleShellMountError(error) {
    const failedMode = interfaceMode;
    const fallbackMode = previousInterfaceModeRef.current === failedMode
      ? (failedMode === 'kavita' ? 'sawa' : 'kavita')
      : previousInterfaceModeRef.current;
    setInterfaceTransitionError(error?.message || 'Impossible de monter cette interface.');
    setRenderedInterfaceMode(fallbackMode);
    startTransition(() => {
      setPayload((previous) => mergeUiSettingsIntoPayload(previous, { interfaceMode: fallbackMode }));
    });
    void window.mangaAPI.updateSettingsLight?.({ interfaceMode: fallbackMode })?.catch(() => {});
  }

  async function handleActivateKavitaClean() {
    await handleUpdateSettings({
      interfaceMode: 'kavita',
      cardSize: 'compact',
      kavitaUpgradePromptSeen: true
    });
  }

  async function handleDismissKavitaCleanUpgrade() {
    await handleUpdateSettings({
      kavitaUpgradePromptSeen: true
    });
  }

  async function handleUpdateVaultPrefs(patch) {
    const normalizedPatch = patch && typeof patch === 'object' ? patch : {};
    if (!Object.keys(normalizedPatch).length) return;

    startTransition(() => {
      setPayload((previous) => mergeVaultPrefsIntoPayload(previous, normalizedPatch));
    });

    try {
      if (window.mangaAPI.updateVaultPrefsLight) {
        await window.mangaAPI.updateVaultPrefsLight(normalizedPatch);
      } else {
        const nextPayload = await window.mangaAPI.updateVaultPrefs(normalizedPatch);
        if (nextPayload?.persisted) {
          startTransition(() => {
            setPayload(nextPayload);
          });
        }
      }
    } catch (_error) {
      try {
        const restored = await window.mangaAPI.bootstrap();
        if (restored?.persisted) {
          startTransition(() => {
            setPayload(restored);
          });
        }
      } catch (_) {
        // Garder l'UI locale si la persistence est momentanement indisponible.
      }
    }
  }

  async function handleSetSidebarSectionVisible(sectionId, visible) {
    const normalizedId = String(sectionId || '').trim();
    if (!normalizedId || normalizedId === 'library') return;
    const nextHidden = { ...sidebarHiddenSections };
    if (visible) {
      delete nextHidden[normalizedId];
    } else {
      nextHidden[normalizedId] = true;
    }
    const nextSections = sidebarSections.includes(normalizedId)
      ? sidebarSections
      : [...sidebarSections, normalizedId];
    await handleUpdateSettings({
      sidebarSections: nextSections,
      sidebarHiddenSections: nextHidden
    });
  }

  async function handleReorderSidebarSections(nextVisibleOrder) {
    const safeVisibleOrder = Array.isArray(nextVisibleOrder)
      ? [...new Set(nextVisibleOrder.map((entry) => String(entry || '').trim()).filter(Boolean))]
      : [];
    if (!safeVisibleOrder.includes('library')) {
      safeVisibleOrder.unshift('library');
    }
    const remainder = sidebarSections.filter((sectionId) => !safeVisibleOrder.includes(sectionId));
    await handleUpdateSettings({
      sidebarSections: [...safeVisibleOrder, ...remainder]
    });
  }

  async function handleSaveQueryAsSmartCollection() {
    const trimmed = search.trim();
    if (!trimmed) return;
    requestTextPrompt({
      title: 'Sauver cette requete',
      description: 'Cette recherche sera convertie en smart collection locale avec tes filtres actuels.',
      label: 'Nom de la smart collection',
      defaultValue: 'Recherche sauvegardee',
      placeholder: 'Serie a suivre',
      confirmLabel: 'Sauver',
      onConfirm: async (value) => {
        const smartCollection = buildSmartCollectionFromSearch(parsedSearch, {
          name: String(value || '').trim() || 'Recherche sauvegardee',
          sort: ui.sort,
          collectionsById: payload?.persisted?.collections || {},
          tagsById: payload?.persisted?.tags || {}
        });
        await handleSaveSmartCollection(smartCollection);
        navigateToScreen('collections');
        setRequestedCollectionsTab('smart');
        setRequestedCollectionId(smartCollection.id);
      }
    });
  }

  async function handlePickBackgroundImage() {
    await refreshWith(window.mangaAPI.pickBackgroundImage());
  }

  async function handleRemoveBackgroundImage() {
    await refreshWith(window.mangaAPI.removeBackgroundImage());
  }

  async function handleClearCache() {
    await window.mangaAPI.clearCache();
    const status = await window.mangaAPI.getSyncStatus().catch(() => null);
    setSyncStatus(status);
  }

  async function handleForceRescan() {
    setMaintenanceStats(null);
    await refreshWith(window.mangaAPI.forceRescan());
    const status = await window.mangaAPI.getSyncStatus().catch(() => null);
    setSyncStatus(status);
  }

  async function handleRunDeepScan() {
    setMaintenanceStats(null);
    const result = await window.mangaAPI.runDeepScan();
    if (result?.payload) setPayload(result.payload);
    if (result?.syncStatus) setSyncStatus(result.syncStatus);
  }

  async function handleRebuildDerivedData() {
    setMaintenanceStats(null);
    const result = await window.mangaAPI.rebuildDerivedData();
    if (result?.payload) setPayload(result.payload);
    if (result?.syncStatus) setSyncStatus(result.syncStatus);
  }

  async function handleAnalyzeMigration() {
    setMigrationBusy(true);
    setMigrationFeedback('');
    try {
      const result = await window.mangaAPI.analyzeMigration?.();
      if (result?.report) {
        setMigrationStatus((prev) => ({ ...(prev || {}), pendingReport: result.report }));
        setMigrationFeedback('Analyse terminee: aucune ecriture effectuee.');
      }
    } catch (error) {
      setMigrationFeedback(error?.message || 'Analyse migration impossible.');
    } finally {
      setMigrationBusy(false);
    }
  }

  async function handleRunMigration() {
    setMigrationBusy(true);
    setMigrationFeedback('');
    try {
      const result = await window.mangaAPI.runMigration?.({ createBackup: true });
      if (result?.status) setMigrationStatus(result.status);
      setMigrationFeedback(result?.ok ? 'Migration Core v2 terminee avec backup prealable.' : (result?.error || 'Migration non terminee.'));
    } catch (error) {
      setMigrationFeedback(error?.message || 'Migration Core v2 impossible.');
    } finally {
      setMigrationBusy(false);
    }
  }

  async function handleCleanupLegacyStorage() {
    setMigrationBusy(true);
    setMigrationFeedback('');
    try {
      const result = await window.mangaAPI.cleanupLegacyStorage?.({ confirm: 'cleanup-legacy-json' });
      setMigrationFeedback(result?.message || (result?.ok ? 'Demande de nettoyage enregistree.' : 'Nettoyage refuse.'));
    } catch (error) {
      setMigrationFeedback(error?.message || 'Nettoyage legacy impossible.');
    } finally {
      setMigrationBusy(false);
    }
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
      navigateToScreen('vault');
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
    navigateToScreen('workbench');
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
    clearSelection();
    setVaultCategoryFilterId(null);
  }

  async function handleToggleVaultBlur() {
    await handleUpdateVaultPrefs({ blurCovers: !vaultState.blurCovers });
  }

  async function handleToggleVaultStealth() {
    await handleUpdateVaultPrefs({ stealthMode: !vaultState.stealthMode });
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

  async function handleExportComicInfoForManga(mangaId) {
    return window.mangaAPI.exportComicInfo({ mangaId, mode: 'sidecar' });
  }

  async function handleRefreshDuplicateCandidates() {
    const result = await window.mangaAPI.getDuplicateCandidates();
    setDuplicateCandidates(Array.isArray(result?.candidates) ? result.candidates : []);
  }

  async function handleEnqueueOcr() {
    const info = await window.mangaAPI.listOcrLanguages().catch(() => null);
    const languages = choosePreferredOcrLanguages(info || {});
    const result = await window.mangaAPI.enqueueOcr({ scope: 'all', languages });
    if (result?.ok === false && result?.error) {
      window.alert(result.error);
      return;
    }
    const status = await window.mangaAPI.listOcrLanguages().catch(() => null);
    if (status) setOcrStatus(status);
    const nextSync = await window.mangaAPI.getSyncStatus().catch(() => null);
    if (nextSync) setSyncStatus(nextSync);
  }

  async function handlePauseOcr() {
    const result = await window.mangaAPI.pauseOcr();
    setOcrStatus((prev) => ({ ...(prev || {}), paused: result?.paused !== false }));
  }

  async function handleResumeOcr() {
    const result = await window.mangaAPI.resumeOcr();
    setOcrStatus((prev) => ({ ...(prev || {}), paused: !!result?.paused }));
  }

  async function handlePurgeOcr() {
    await window.mangaAPI.purgeOcr();
    const status = await window.mangaAPI.listOcrLanguages().catch(() => null);
    if (status) setOcrStatus(status);
  }

  async function handleSetPluginEnabled(pluginId, enabled) {
    setPluginBusyId(pluginId);
    try {
      const result = await window.mangaAPI.setPluginEnabled(pluginId, enabled);
      setPlugins(Array.isArray(result?.plugins) ? result.plugins : []);
      if (!result?.ok) {
        setPluginFeedback(result?.error || 'Impossible de modifier ce plugin.');
        return;
      }
      setPluginFeedback(
        pluginId === 'sources-web'
          ? (enabled ? 'Addon Sources web actif.' : 'Addon Sources web desactive.')
          : (enabled ? 'Plugin actif.' : 'Plugin desactive.')
      );
    } catch (error) {
      setPluginFeedback(error?.message || 'Impossible de modifier ce plugin.');
    } finally {
      setPluginBusyId(null);
    }
  }

  async function handleInstallPlugin(pluginId) {
    setPluginBusyId(pluginId);
    try {
      const result = await window.mangaAPI.installPlugin(pluginId);
      setPlugins(Array.isArray(result?.plugins) ? result.plugins : []);
      if (!result?.ok) {
        setPluginFeedback(result?.error || 'Installation du plugin impossible.');
        return;
      }
      setPluginFeedback(pluginId === 'sources-web' ? 'Addon Sources web installe.' : 'Plugin installe avec succes.');
    } catch (error) {
      setPluginFeedback(error?.message || 'Installation du plugin impossible.');
    } finally {
      setPluginBusyId(null);
    }
  }

  async function handleUninstallPlugin(pluginId) {
    setPluginBusyId(pluginId);
    try {
      const result = await window.mangaAPI.uninstallPlugin(pluginId);
      setPlugins(Array.isArray(result?.plugins) ? result.plugins : []);
      if (!result?.ok) {
        setPluginFeedback(result?.error || 'Desinstallation du plugin impossible.');
        return;
      }
      if (pluginId === 'sources-web') {
        setSourcesSection('explorer');
        setAddEntryMenuAnchor(null);
      }
      setPluginFeedback(pluginId === 'sources-web' ? 'Addon Sources web retire.' : 'Plugin retire.');
    } catch (error) {
      setPluginFeedback(error?.message || 'Desinstallation du plugin impossible.');
    } finally {
      setPluginBusyId(null);
    }
  }

  async function handleOpenPlugin(pluginId) {
    if (pluginId === 'sources-web') {
      setPluginFeedback('');
      setSourcesSection('catalogue');
      setSettingsOpen(false);
      handleScreenChange('sources');
      return;
    }
    setPluginBusyId(pluginId);
    try {
      const result = await window.mangaAPI.openPlugin(pluginId);
      setPlugins(Array.isArray(result?.plugins) ? result.plugins : []);
      if (!result?.ok) {
        setPluginFeedback(result?.error || 'Lancement du plugin impossible.');
        return;
      }
      setPluginFeedback('Plugin lance.');
    } catch (error) {
      setPluginFeedback(error?.message || 'Lancement du plugin impossible.');
    } finally {
      setPluginBusyId(null);
    }
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
    navigateToScreen('dashboard', { replaceHistory: true, captureScroll: false });
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
      navigateToScreen('collections');
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

  function commitReaderProgress(progressPayload, meta = {}) {
    const now = new Date().toISOString();
    const targetTabId = meta.tabId || activeTabId;
    const incognito = meta.incognito ?? activeTab?.incognito;

    if (incognito) {
      setTabs((prev) => prev.map((tab) => {
        if (tab.id !== targetTabId) return tab;
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
          ui: meta.profile === 'kavita'
            ? prev.persisted.ui
            : {
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
      if (tab.id !== targetTabId) return tab;
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

  }

  function handleUpdateProgress(progressPayload) {
    commitReaderProgress(progressPayload, {
      tabId: activeTabId,
      incognito: Boolean(activeTab?.incognito)
    });
    if (!activeTab?.incognito) {
      window.mangaAPI.updateProgressLight(progressPayload).catch(() => {
        // On garde l'UI fluide meme si l'ecriture disque rate.
      });
    }
  }

  function handleKavitaProgress(progressPayload) {
    readerSessionStoreRef.current.stageProgress(progressPayload, {
      tabId: activeTabId,
      incognito: Boolean(activeTab?.incognito),
      profile: 'kavita'
    });
  }

  function handleKavitaReaderSettings(nextSettings) {
    readerSessionStoreRef.current.stageSettings(nextSettings);
  }

  function commitKavitaReaderSettings(nextSettings) {
    startTransition(() => {
      setPayload((previous) => mergeUiSettingsIntoPayload(previous, {
        kavitaReaderSettings: {
          ...(previous?.persisted?.ui?.kavitaReaderSettings || {}),
          ...nextSettings
        }
      }));
    });
  }

  async function flushReaderSession() {
    await readerSessionStoreRef.current.flush({ commit: true });
  }

  async function handleReaderExit() {
    await popActiveView();
    scheduleBackgroundBootstrapRefresh(1400);
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
        ...(context.manga.sourceWeb?.linked ? [
          actionItem('Voir les chapitres web', () => handleOpenSourceSeriesForManga(context.manga), { icon: <LayersIcon size={14} /> })
        ] : []),
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
        ...(context.manga.sourceWeb?.linked ? [
          actionItem('Voir les chapitres web', () => handleOpenSourceSeriesForManga(context.manga), { icon: <LayersIcon size={14} /> })
        ] : []),
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
              navigateToScreen('vault');
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
          navigateToScreen('vault');
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
      actionItem('Ajouter des catégories', () => handleOpenAddCategoriesDirect(), { icon: <FolderPlusIcon size={14} /> }),
      actionItem('Actualiser la bibliothèque', () => refreshWith(window.mangaAPI.bootstrap()), { icon: <RefreshIcon size={14} /> }),
      actionItem('Ouvrir le coffre', () => {
        navigateToScreen('vault');
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

  const commandPaletteCommands = useMemo(() => {
    const commands = [
      {
        id: 'go-library',
        label: 'Ouvrir la bibliotheque',
        description: 'Revenir a la vue principale.',
        keywords: 'bibliotheque accueil home',
        action: () => handleScreenChange('library')
      },
      {
        id: 'go-favorites',
        label: 'Ouvrir les favoris',
        description: 'Retrouver les titres epingles en coeur.',
        keywords: 'favoris coeur',
        action: () => handleScreenChange('favorites')
      },
      {
        id: 'go-recents',
        label: 'Ouvrir les recents',
        description: 'Reprendre les dernieres lectures.',
        keywords: 'recents historique reprise',
        action: () => handleScreenChange('recents')
      },
      {
        id: 'go-collections',
        label: 'Ouvrir les collections',
        description: 'Parcourir les collections manuelles et smart.',
        keywords: 'collections smart',
        action: () => handleScreenChange('collections')
      },
      {
        id: 'go-maintenance',
        label: 'Ouvrir la maintenance',
        description: 'Voir sync et OCR local.',
        keywords: 'maintenance ocr sync',
        action: () => handleScreenChange('maintenance')
      },
      {
        id: 'go-workbench',
        label: 'Ouvrir l atelier metadata',
        description: 'Traiter la file metadata en lot.',
        keywords: 'atelier metadata queue',
        action: () => handleScreenChange('workbench')
      },
      {
        id: 'go-vault',
        label: 'Ouvrir le coffre',
        description: 'Basculer vers les titres proteges.',
        keywords: 'coffre prive vault',
        action: () => handleScreenChange('vault')
      },
      {
        id: 'open-settings',
        label: 'Ouvrir les parametres',
        description: 'Acceder aux reglages avances et aux preferences.',
        keywords: 'parametres reglages avances preferences',
        action: () => setSettingsOpen(true)
      },
      {
        id: 'open-queue',
        label: 'Ouvrir la queue de lecture',
        description: 'Voir ce qui vient ensuite.',
        keywords: 'queue lecture ensuite',
        action: () => setReadingQueueOpen(true)
      },
      {
        id: 'run-deep-scan',
        label: 'Lancer un scan profond',
        description: 'Reconstruit l analyse locale de la bibliotheque.',
        keywords: 'scan profond analyse',
        action: () => handleRunDeepScan()
      },
      {
        id: 'rebuild-derived',
        label: 'Reconstruire les donnees derivees',
        description: 'Regenerer la base derivee et le cache.',
        keywords: 'derivees cache sqlite reconstruction',
        action: () => handleRebuildDerivedData()
      }
    ];

    if (webSourcesEnabled) {
      commands.splice(9, 0, {
        id: 'open-web-sources',
        label: 'Ouvrir Sources web',
        description: 'Rechercher puis importer dans une categorie locale.',
        keywords: 'sources web import mangadex addon',
        action: () => {
          setSourcesSection('explorer');
          handleScreenChange('sources');
        }
      });
    }

    filteredMangas.slice(0, 6).forEach((manga) => {
      commands.push({
        id: `open-manga-${manga.id}`,
        label: `Ouvrir ${manga.displayTitle || manga.name}`,
        description: manga.author || manga.categoryName || 'Manga',
        keywords: `${manga.displayTitle || manga.name} manga lecture`,
        action: () => openMangaInCurrentTab(manga.id)
      });
    });

    return commands;
  }, [filteredMangas, handleRebuildDerivedData, handleRunDeepScan, webSourcesEnabled]);

  function handleRunCommand(command) {
    if (!command?.action) return;
    setCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    command.action();
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
  const showKavitaUpgradeBanner = shouldShowKavitaUpgradeBanner(ui);
  const visibleVaultCount = vaultState.locked ? 0 : (vaultState.privateCount || privateMangas.length);
  const vaultActionLabel = selectedMangas.length > 0 && selectedMangas.every((manga) => manga.isPrivate)
    ? 'Retirer du coffre'
    : 'Envoyer au coffre';
  const shouldShowTopBar = activeView.screen === 'library'
    && !['dashboard', 'collections', 'maintenance', 'workbench', 'sources'].includes(activeScreen);
  const topBarCategory = activeScreen === 'vault' ? activeVaultCategory : selectedCategory;
  const clearTopBarCategory = activeScreen === 'vault'
    ? () => setVaultCategoryFilterId(null)
    : () => handleSelectCategory(null);

  latestHandlersRef.current.openMangaInCurrentTab = openMangaInCurrentTab;
  latestHandlersRef.current.openMangaInNewTab = openMangaInNewTab;
  latestHandlersRef.current.handleToggleFavorite = handleToggleFavorite;
  latestHandlersRef.current.toggleSelectedManga = toggleSelectedManga;
  latestHandlersRef.current.toggleSelectionMode = toggleSelectionMode;
  latestHandlersRef.current.openContextMenu = openContextMenu;
  latestHandlersRef.current.resumeMangaInCurrentTab = resumeMangaInCurrentTab;

  if (interfaceMode === 'kavita') {
    const kavitaModel = {
      ui,
      activeView,
      activeScreen,
      library,
      mangas: filteredMangas,
      categories: visibleCategories,
      selectedCategoryId,
      currentManga,
      currentChapter: resolvedChapter,
      annotations: currentMangaAnnotations,
      collections: allCollections,
      tags: allTags,
      maintenanceIssues,
      maintenanceStats,
      workbenchMangas: workbenchQueueMangas,
      vault: vaultState,
      vaultMangas: filteredPrivateMangas,
      vaultCategories,
      activeVaultCategoryId: vaultCategoryFilterId,
      plugins,
      migrationStatus,
      syncStatus,
      tabs: tabsMeta,
      activeTabId,
      workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
      activeWorkspaceId,
      search,
      settingsOpen,
      selectionMode,
      selectedIds: selectedMangaIdSet,
      webSourcesEnabled,
      actions: {
        onSearchChange: setSearch,
        onScreenChange: handleScreenChange,
        onSelectCategory: handleSelectCategory,
        onOpenManga: stableOpenManga,
        onOpenMangaInNewTab: openMangaInNewTab,
        onResumeMangaIncognito: (mangaId) => resumeMangaInNewTab(mangaId, { incognito: true }),
        onOpenSourceSeries: handleOpenSourceSeriesForManga,
        onResumeManga: resumeMangaInCurrentTab,
        onOpenChapter: openChapterInCurrentTab,
        onOpenChapterInNewTab: openChapterInNewTab,
        onOpenChapterIncognito: (mangaId, chapterId, pageIndex = 0) => openChapterInNewTab(
          mangaId,
          chapterId,
          pageIndex,
          { incognito: true }
        ),
        onReadFrom: (mangaId, chapterId, pageIndex) => pushViewToActive({
          screen: 'reader',
          mangaId,
          chapterId,
          pageIndex
        }),
        onReadFromInNewTab: (mangaId, chapterId, pageIndex, options = {}) => openNewTab(
          { screen: 'reader', mangaId, chapterId, pageIndex },
          [normalizeView(), { screen: 'manga', mangaId }, { screen: 'preview', mangaId, chapterId }],
          options
        ),
        onReaderExit: handleReaderExit,
        onOpenReaderChapter: async (chapterId) => {
          await flushReaderSession();
          replaceActiveView(buildReaderViewForChapter(currentChapterData.manga?.id, chapterId, 0, true));
        },
        onUpdateProgress: handleKavitaProgress,
        onReaderSettingsChange: handleKavitaReaderSettings,
        onAddAnnotation: handleAddAnnotation,
        onDeleteAnnotation: handleDeleteAnnotation,
        onToggleFavorite: stableToggleFavorite,
        onSetMangaReadStatus: handleSetReadStatus,
        onSearchOnlineMetadata: (query) => window.mangaAPI.searchOnlineMetadata(query),
        onImportOnlineMetadata: handleImportOnlineMetadata,
        onImportComicInfo: handleImportComicInfoForManga,
        onPickCover: handlePickCover,
        onQueueWorkbench: (mangaId) => handleQueueWorkbench([mangaId], 'append'),
        onAddMangaToQueue: (mangaId) => handleUpsertQueueItem(buildQueueDraft(mangaId, null, 'manual')),
        onAddNextToQueue: (mangaId, chapterId = null) => {
          const draft = buildNextQueueDraft(mangaId, chapterId);
          return draft ? handleUpsertQueueItem(draft) : null;
        },
        onSetPrivateFlag: handleSetPrivateFlag,
        onResetMangaProgress: handleResetProgress,
        onTrashManga: handleTrashManga,
        onToggleSelect: stableToggleSelectedManga,
        onClearSelection: clearSelection,
        onBack: popActiveView,
        onSaveMetadata: handleSaveMetadata,
        onToggleTag: handleToggleTag,
        onCreateTag: handleCreateTag,
        onDeleteTag: handleDeleteTag,
        onAddToCollection: handleAddToCollection,
        onRemoveFromCollection: handleRemoveMangaFromCollection,
        onCreateCollection: handleCreateCollection,
        onSetChapterReadStatus: handleSetChapterReadStatus,
        onAddChapterToQueue: (mangaId, chapterId) => handleUpsertQueueItem(
          buildQueueDraft(mangaId, chapterId, 'manual')
        ),
        onAddNextChapterToQueue: (mangaId, chapterId) => {
          const draft = buildNextQueueDraft(mangaId, chapterId);
          return draft ? handleUpsertQueueItem(draft) : null;
        },
        onResetChapterProgress: handleResetChapterProgress,
        onToggleCategoryHidden: handleToggleCategoryHidden,
        onRemoveCategory: handleRemoveCategory,
        onOpenCollection: (collection) => handleActivateSidebarPin({
          type: collection.isSmart ? 'smart-collection' : 'collection',
          refId: collection.id,
          label: collection.name
        }),
        onToggleCollectionPin: (collection) => handleToggleSidebarPin({
          type: collection.isSmart ? 'smart-collection' : 'collection',
          refId: collection.id,
          label: collection.name
        }),
        onUpdateSettings: handleUpdateSettings,
        onRequestInterfaceMode: handleRequestInterfaceMode,
        onSettingsOpenChange: setSettingsOpen,
        onSelectTab: handleSelectTab,
        onCloseTab: closeTab,
        onNewTab: openNewLibraryTab,
        onReorderTabs: reorderTabs,
        onToggleTabPin: toggleTabPin,
        onDuplicateTab: duplicateTab,
        onCloseOtherTabs: closeOtherTabs,
        onCloseTabsToRight: closeTabsToRight,
        onMoveTabToWorkspace: moveTabToWorkspace,
        onForceRescan: handleForceRescan,
        onRunDeepScan: handleRunDeepScan,
        onRebuildDerivedData: handleRebuildDerivedData,
        onAnalyzeMigration: handleAnalyzeMigration,
        onRunMigration: handleRunMigration,
        onSetupVault: handleSetVaultPin,
        onUnlockVault: handleUnlockVault,
        onLockVault: handleLockVault,
        onSelectVaultCategory: setVaultCategoryFilterId,
        onToggleSelectionMode: stableToggleSelectionMode,
        onToggleVaultBlur: handleToggleVaultBlur,
        onToggleVaultStealth: handleToggleVaultStealth
      }
    };

    return (
      <ShellErrorBoundary key={`shell-${interfaceMode}`} onError={handleShellMountError}>
        <>
          <Suspense fallback={<LazyPanelPlaceholder label="Chargement de l interface Kavita..." />}>
            <KavitaShell model={kavitaModel} />
          </Suspense>
          {interfaceTransitioning ? <div className="interface-transition-veil" aria-hidden="true" /> : null}
          {interfaceTransitionError ? <div className="interface-transition-error" role="alert">{interfaceTransitionError}</div> : null}
        </>
      </ShellErrorBoundary>
    );
  }

  return (
    <ShellErrorBoundary key={`shell-${interfaceMode}`} onError={handleShellMountError}>
      <>
      <div
      className={`app-shell theme-${theme} ${interfaceClassName}`}
      style={{
        '--accent': ui.accent,
        '--accent-alt': ui.accentAlt || '#38bdf8',
        '--card-min': cardSizeMinWidth(ui.cardSize),
        '--manga-card-min-width': cardSizeMinWidth(ui.cardSize),
        '--manga-grid-gap': cardSizeGridGap(ui.cardSize)
      }}
      onContextMenu={stableOpenContextMenu}
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
        onContextMenu={stableOpenContextMenu}
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
      {showKavitaUpgradeBanner ? (
        <div className="v2-upgrade-banner" role="region" aria-label="Sawa v2 interface Kavita">
          <div className="v2-upgrade-banner-copy">
            <span>Sawa v2</span>
            <strong>La nouvelle interface Kavita est disponible</strong>
            <p>Active une interface independante, plus plate, dense et classique.</p>
          </div>
          <div className="v2-upgrade-banner-actions">
            <button type="button" className="primary-button" onClick={handleActivateKavitaClean}>
              Activer l interface Kavita
            </button>
            <button type="button" className="ghost-button" onClick={handleDismissKavitaCleanUpgrade}>
              Garder Sawa actuel
            </button>
          </div>
        </div>
      ) : null}
      {commandPaletteOpen ? (
        <Suspense fallback={<LazyPanelPlaceholder label="Chargement de la palette locale..." />}>
          <CommandPalette
            open={commandPaletteOpen}
            query={commandPaletteQuery}
            commands={commandPaletteCommands}
            onQueryChange={setCommandPaletteQuery}
            onClose={() => {
              setCommandPaletteOpen(false);
              setCommandPaletteQuery('');
            }}
            onRun={handleRunCommand}
          />
        </Suspense>
      ) : null}
      <AddEntryMenu
        open={!!addEntryMenuAnchor}
        anchor={addEntryMenuAnchor}
        showWebSources={webSourcesEnabled}
        onClose={closeAddEntryMenu}
        onAddCategories={handleOpenAddCategories}
        onOpenWebSources={handleOpenWebSources}
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
          onAddCategories={handleAddEntry}
          onToggleCategoryHidden={handleToggleCategoryHidden}
          onRemoveCategory={handleRemoveCategory}
          onOpenSettings={() => setSettingsOpen(true)}
          showHiddenCategories={ui.showHiddenCategories}
          onContextMenu={stableOpenContextMenu}
          favoritesCount={library.favorites?.length ?? 0}
          maintenanceCount={maintenanceCount}
          workbenchCount={workbenchQueueMangas.length}
          vaultCount={visibleVaultCount}
          showSources={webSourcesEnabled}
          sidebarSections={sidebarSections}
          sidebarHiddenSections={sidebarHiddenSections}
          sidebarPins={sidebarPins}
          onActivatePin={handleActivateSidebarPin}
          onSetSectionVisible={handleSetSidebarSectionVisible}
          onReorderSections={handleReorderSidebarSections}
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
              onAddCategories={handleAddEntry}
              activeScreen={activeScreen}
              selectionMode={selectionMode}
              selectedCount={selectedMangaIds.length}
              onToggleSelectionMode={stableToggleSelectionMode}
              searchChips={searchChips}
              searchStatus={searchStatus}
              searchHelpOpen={searchHelpOpen}
              onToggleSearchHelp={() => setSearchHelpOpen((prev) => !prev)}
              onSaveSearch={handleSaveQueryAsSmartCollection}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
              commandPaletteLabel={formatShortcutLabel(keyboardShortcuts.openCommandPalette)}
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
              onOpenManga={stableOpenManga}
              onResumeManga={stableResumeManga}
              onToggleFavorite={stableToggleFavorite}
              onNavigateTo={(target) => {
                if (target === 'library') {
                  handleScreenChange('library');
                } else if (target === 'collections') {
                  handleScreenChange('collections');
                } else if (target === 'favorites') {
                  handleScreenChange('favorites');
                } else {
                  handleScreenChange('library');
                }
              }}
              onContextMenu={stableOpenContextMenu}
              onOpenSettings={() => setSettingsOpen(true)}
              onUpdateSettings={handleUpdateSettings}
              onOpenMaintenance={() => handleScreenChange('maintenance')}
              maintenanceCount={maintenanceCount}
              selectionMode={selectionMode}
              selectedMangaIds={selectedMangaIdSet}
              onToggleSelect={stableToggleSelectedManga}
              onSelectionModeChange={stableToggleSelectionMode}
            />
          )}

            {activeView.screen === 'library' && activeScreen === 'collections' && (
              <Suspense fallback={<LazyPanelPlaceholder label="Chargement des collections..." />}>
                <CollectionsView
                  allMangas={library.allMangas}
                  persisted={payload?.persisted ?? {}}
                  onOpenManga={stableOpenManga}
                  onToggleFavorite={stableToggleFavorite}
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
                  onToggleSelect={stableToggleSelectedManga}
                  onSelectionModeChange={stableToggleSelectionMode}
                  onContextMenu={stableOpenContextMenu}
                />
              </Suspense>
            )}

            {activeView.screen === 'library' && activeScreen === 'maintenance' && (
              <Suspense fallback={<LazyPanelPlaceholder label="Chargement de l entretien..." />}>
                <MaintenanceView
                  initialScrollTop={activeInitialScrollTop}
                  scrollKey={activeScrollKey}
                  onScrollPositionChange={handleViewScrollPositionChange}
                  issues={maintenanceIssues}
                  stats={maintenanceStats}
                  syncStatus={syncStatus}
                  ocrStatus={ocrStatus}
                  migrationStatus={migrationStatus}
                  migrationBusy={migrationBusy}
                  migrationFeedback={migrationFeedback}
                  duplicateCandidates={duplicateCandidates}
                  showOcrSection={true}
                  showVisualDedupeSection={false}
                  workbenchCount={workbenchQueueMangas.length}
                  vaultCount={visibleVaultCount}
                  onOpenManga={stableOpenManga}
                  onForceRescan={handleForceRescan}
                  onRunDeepScan={handleRunDeepScan}
                  onRebuildDerivedData={handleRebuildDerivedData}
                  onAnalyzeMigration={handleAnalyzeMigration}
                  onRunMigration={handleRunMigration}
                  onCleanupLegacyStorage={handleCleanupLegacyStorage}
                  onRefreshDuplicateCandidates={handleRefreshDuplicateCandidates}
                  onEnqueueOcr={handleEnqueueOcr}
                  onPauseOcr={handlePauseOcr}
                  onResumeOcr={handleResumeOcr}
                  onPurgeOcr={handlePurgeOcr}
                  onQueueIssue={handleQueueMaintenanceIssue}
                  onPickCover={handlePickCover}
                  onOpenWorkbench={() => handleScreenChange('workbench')}
                  onOpenVault={() => handleScreenChange('vault')}
                />
              </Suspense>
            )}

            {activeView.screen === 'library' && activeScreen === 'workbench' && (
              <Suspense fallback={<LazyPanelPlaceholder label="Chargement de l atelier..." />}>
                <MetadataWorkbenchView
                  initialScrollTop={activeInitialScrollTop}
                  scrollKey={activeScrollKey}
                  onScrollPositionChange={handleViewScrollPositionChange}
                  queueMangas={workbenchQueueMangas}
                  onReplaceQueue={handleReplaceWorkbenchQueue}
                  onImportMatch={handleImportWorkbenchMatch}
                  onPickCover={handlePickCover}
                  onOpenManga={stableOpenManga}
                />
              </Suspense>
            )}

            {activeView.screen === 'library' && activeScreen === 'sources' && webSourcesEnabled && (
              <Suspense fallback={<LazyPanelPlaceholder label="Chargement du centre Sources web..." />}>
                <SourcesView
                  plugin={webSourcesPlugin}
                  section={sourcesSection}
                  categories={visibleCategories}
                  defaultCategoryId={payload?.persisted?.plugins?.lastSourceImportCategoryId || selectedCategoryId || visibleCategories[0]?.id || ''}
                  context={sourceExplorerContext}
                  recentSeries={payload?.sources?.recentSeries ?? []}
                  linkedSeries={payload?.sources?.linkedSeries ?? []}
                  initialScrollTop={activeInitialScrollTop}
                  onSectionChange={setSourcesSection}
                  onImported={async () => {
                    try {
                      await refreshWith(window.mangaAPI.bootstrap());
                    } finally {
                      window.mangaAPI.getSyncStatus().then((status) => setSyncStatus(status)).catch(() => {});
                    }
                  }}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onScrollPositionChange={handleViewScrollPositionChange}
                />
              </Suspense>
            )}

            {activeView.screen === 'library' && activeScreen === 'vault' && (
              <Suspense fallback={<LazyPanelPlaceholder label="Chargement du coffre..." />}>
                <VaultView
                  initialScrollTop={activeInitialScrollTop}
                  scrollKey={activeScrollKey}
                  onScrollPositionChange={handleViewScrollPositionChange}
                  vault={vaultState}
                  mangas={filteredPrivateMangas}
                  categories={vaultCategories}
                  activeCategoryId={vaultCategoryFilterId}
                  selectionMode={selectionMode}
                  selectedIds={selectedMangaIdSet}
                  onToggleSelectionMode={stableToggleSelectionMode}
                  onSelectCategory={setVaultCategoryFilterId}
                  onToggleSelect={stableToggleSelectedManga}
                  onOpenManga={stableOpenManga}
                  onOpenMangaInBackgroundTab={stableOpenMangaInBackgroundTab}
                  onToggleFavorite={stableToggleFavorite}
                  onContextMenu={stableOpenContextMenu}
                  onSetupPin={handleSetVaultPin}
                  onUnlock={handleUnlockVault}
                  onLock={handleLockVault}
                  onToggleBlur={handleToggleVaultBlur}
                  onToggleStealth={handleToggleVaultStealth}
                />
              </Suspense>
            )}

          {activeView.screen === 'library' && !['dashboard', 'collections', 'maintenance', 'workbench', 'vault', 'sources'].includes(activeScreen) && (
            <LibraryView
              mangas={filteredMangas}
              activeScreen={activeScreen}
              categories={visibleCategories}
              cardSize={ui.cardSize}
              initialScrollTop={activeInitialScrollTop}
              onScrollPositionChange={handleViewScrollPositionChange}
              onOpenManga={stableOpenManga}
              onOpenSourceSeries={handleOpenSourceSeriesForManga}
              onOpenMangaInCurrentTab={stableOpenManga}
              onOpenMangaInNewTab={stableOpenMangaInNewTab}
              onOpenMangaInBackgroundTab={stableOpenMangaInBackgroundTab}
              onToggleFavorite={stableToggleFavorite}
              onContextMenu={stableOpenContextMenu}
              selectionMode={selectionMode}
              selectedIds={selectedMangaIdSet}
              onToggleSelect={stableToggleSelectedManga}
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
              onOpenSourceSeries={handleOpenSourceSeriesForManga}
              onToggleFavorite={stableToggleFavorite}
              onPickCover={handlePickCover}
              onOpenMetadataEditor={() => setEditingMetadata(currentManga)}
              onAddTag={() => setTagManagerManga(currentManga)}
              onAddToCollection={() => setCollectionPickerManga(currentManga)}
              onImportOnlineMetadata={handleImportOnlineMetadata}
              onOpenAnnotation={(annotation) => {
                if (!annotation?.chapterId) return;
                replaceActiveView(buildReaderViewForChapter(currentManga.id, annotation.chapterId, annotation.pageIndex ?? 0, true));
              }}
              onContextMenu={stableOpenContextMenu}
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
              onOpenSourceSeries={handleOpenSourceSeriesForManga}
              onContextMenu={stableOpenContextMenu}
            />
          )}

          {activeView.screen === 'reader' && currentChapterData.manga && resolvedChapter && (
            <ReaderView
              manga={currentChapterData.manga}
              chapter={resolvedChapter}
              chapters={currentChapterData.manga.chapters ?? []}
              annotations={payload?.persisted?.annotations?.[currentChapterData.manga.id] ?? []}
              experimentalFeatures={ui.experimental ?? {}}
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
              onContextMenu={stableOpenContextMenu}
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

      {settingsOpen ? (
        <Suspense fallback={<LazyPanelPlaceholder label="Chargement des reglages..." />}>
          <SettingsDrawer
            open={settingsOpen}
            ui={ui}
            vault={vaultState}
            syncStatus={syncStatus}
            onClose={() => setSettingsOpen(false)}
            onChange={handleUpdateSettings}
            onRequestInterfaceMode={handleRequestInterfaceMode}
            onPickBackground={handlePickBackgroundImage}
            onRemoveBackground={handleRemoveBackgroundImage}
            onClearCache={handleClearCache}
            onForceRescan={handleForceRescan}
            onRunDeepScan={handleRunDeepScan}
            onRebuildDerivedData={handleRebuildDerivedData}
            onUpdateVaultPrefs={handleUpdateVaultPrefs}
            onLockVault={handleLockVault}
            onPanicLock={triggerPanicLock}
            plugins={plugins}
            pluginBusyId={pluginBusyId}
            pluginFeedback={pluginFeedback}
            sidebarSections={sidebarSections}
            sidebarHiddenSections={sidebarHiddenSections}
            showSources={webSourcesEnabled}
            onSetPluginEnabled={handleSetPluginEnabled}
            onInstallPlugin={handleInstallPlugin}
            onUninstallPlugin={handleUninstallPlugin}
            onOpenPlugin={handleOpenPlugin}
          />
        </Suspense>
      ) : null}

      <TextPromptModal
        open={textPromptState.open}
        title={textPromptState.title}
        description={textPromptState.description}
        label={textPromptState.label}
        defaultValue={textPromptState.defaultValue}
        placeholder={textPromptState.placeholder}
        confirmLabel={textPromptState.confirmLabel}
        cancelLabel={textPromptState.cancelLabel}
        onCancel={closeTextPrompt}
        onConfirm={async (value) => {
          await textPromptState.onConfirm?.(value);
          closeTextPrompt();
        }}
      />

      {editingMetadata && (
        <MetadataEditorModal
          manga={editingMetadata}
          onClose={() => setEditingMetadata(null)}
          onSave={handleSaveMetadata}
          onUpdateLocks={handleUpdateMetadataLocks}
          onImportComicInfo={handleImportComicInfoForManga}
          onExportComicInfo={handleExportComicInfoForManga}
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
      {interfaceTransitioning ? <div className="interface-transition-veil" aria-hidden="true" /> : null}
      {interfaceTransitionError ? <div className="interface-transition-error" role="alert">{interfaceTransitionError}</div> : null}
      </>
    </ShellErrorBoundary>
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
