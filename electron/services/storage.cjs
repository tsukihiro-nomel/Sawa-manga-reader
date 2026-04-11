const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const STORAGE_VERSION = 3;
const STATE_VERSION = 3;
const SCAN_INDEX_VERSION = 1;
const QUEUE_VERSION = 1;
const METADATA_VERSION = 1;
const MAX_WORKSPACES = 8;
const WORKSPACE_ICON_KEYS = ['home', 'library', 'layout', 'scroll', 'heart', 'sparkles', 'layers', 'book'];

const DEFAULT_STATE = {
  version: STORAGE_VERSION,
  stateVersion: STATE_VERSION,
  scanIndexVersion: SCAN_INDEX_VERSION,
  queueVersion: QUEUE_VERSION,
  metadataVersion: METADATA_VERSION,
  categories: [],
  scanIndex: {
    updatedAt: null,
    entries: {}
  },
  session: { version: 2, activeWorkspaceId: null, workspaces: [] },
  ui: {
    theme: 'dark-night',
    selectedCategoryId: null,
    showHiddenCategories: false,
    sidebarCollapsed: false,
    sort: 'title-asc',
    cardSize: 'comfortable',
    accent: '#8b5cf6',
    accentAlt: '#38bdf8',
    showPagePreviewBeforeReading: true,
    readerMode: 'single',
    readerFit: 'fit-width',
    readerZoom: 1,
    readerDoublePageMode: 'manga-jp',
    autoMarkReadThreshold: 95,
    continuousReading: true,
    allowNsfwSources: false,
    activeScreen: 'dashboard',
    dashboardLayout: [],
    dashboardHiddenSections: {},
    sidebarPins: [],
    maintenancePrefs: {
      mutedIssueTypes: [],
      lastOpenedAt: null
    },
    filters: { readStatus: 'all', favoriteOnly: false, hasDescription: null, hasCustomCover: null, tags: [], collections: [] },
    keyboardShortcuts: {
      nextPage: 'ArrowRight', prevPage: 'ArrowLeft',
      nextChapter: 'Ctrl+ArrowRight', prevChapter: 'Ctrl+ArrowLeft',
      toggleFullscreen: 'f', toggleUI: 'h',
      zoomIn: '+', zoomOut: '-', zoomReset: '0', exitReader: 'Escape'
    }
  },
  metadata: {},
  metadataLocks: {},
  metadataFieldSource: {},
  favorites: {},
  tags: {},
  mangaTags: {},
  mangaTagMeta: {},
  collections: {},
  smartCollections: {
    'smart-continue': { id: 'smart-continue', name: 'Continuer', icon: 'play', rules: { type: 'in-progress' } },
    'smart-unread': { id: 'smart-unread', name: 'Non lus', icon: 'book', rules: { type: 'unread' } },
    'smart-in-progress': { id: 'smart-in-progress', name: 'En cours', icon: 'clock', rules: { type: 'started' } },
    'smart-completed': { id: 'smart-completed', name: 'Termines', icon: 'check', rules: { type: 'completed' } },
    'smart-favorites': { id: 'smart-favorites', name: 'Favoris', icon: 'heart', rules: { type: 'favorites' } },
    'smart-recent-added': { id: 'smart-recent-added', name: 'Ajoutes recemment', icon: 'plus', rules: { type: 'recent-added', days: 30 } },
    'smart-recent-read': { id: 'smart-recent-read', name: 'Derniere lecture', icon: 'eye', rules: { type: 'recent-read', days: 14 } },
    'smart-new-chapters': { id: 'smart-new-chapters', name: 'Nouveaux chapitres', icon: 'sparkles', rules: { type: 'new-chapters' } },
    'smart-no-cover': { id: 'smart-no-cover', name: 'Sans couverture', icon: 'image', rules: { type: 'no-cover' } },
    'smart-no-metadata': { id: 'smart-no-metadata', name: 'Sans metadonnees', icon: 'alert', rules: { type: 'no-metadata' } }
  },
  annotations: {},
  metadataWorkbenchQueue: [],
  readingQueue: [],
  vault: {
    pinHash: null,
    pinProtectedBlob: null,
    securityMode: 'none',
    locked: false,
    blurCovers: true,
    autoLockOnClose: true,
    stealthMode: false,
    privateMangaIds: [],
    privateCategoryIds: []
  },
  readingStates: {},
  chapterStates: {},
  readStatus: {},
  chapterReadStatus: {},
  progress: {},
  pdfMeta: {},
  recents: [],
  knownChapterCounts: {},
  readerPrefs: {},
  backupHistory: [],
  migrationLog: []
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

let cachedState = null;

function getUserDataPath() {
  return app.getPath('userData');
}

function getStatePath() {
  const udp = getUserDataPath();
  ensureDir(udp);
  return path.join(udp, 'sawa-manga-state-v2.json');
}

function getLegacyStatePath() {
  return path.join(getUserDataPath(), 'sawa-manga-state.json');
}

function getBackupDir() {
  const dirPath = path.join(getUserDataPath(), 'backups');
  ensureDir(dirPath);
  return dirPath;
}

function getThumbnailDir() {
  const dirPath = path.join(getUserDataPath(), 'thumbnails');
  ensureDir(dirPath);
  return dirPath;
}

function getCbzCacheDir() {
  const dirPath = path.join(getUserDataPath(), 'cbz-cache');
  ensureDir(dirPath);
  return dirPath;
}

function deepMerge(base, incoming) {
  if (Array.isArray(base) || Array.isArray(incoming)) return incoming ?? base;
  const result = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && base[key]
      && typeof base[key] === 'object'
      && !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function makeRuntimeId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultWorkspaceName(index) {
  return `Espace ${index + 1}`;
}

function normalizeReaderState(state) {
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
  return {
    screen: typeof view?.screen === 'string' ? view.screen : 'library',
    mangaId: typeof view?.mangaId === 'string' && view.mangaId.trim() ? view.mangaId : null,
    chapterId: typeof view?.chapterId === 'string' && view.chapterId.trim() ? view.chapterId : null,
    pageIndex: Number.isFinite(Number(view?.pageIndex)) ? Math.max(0, Math.floor(Number(view.pageIndex))) : 0,
    readerState: normalizeReaderState(view?.readerState)
  };
}

function normalizeTab(candidate, fallbackIdPrefix = 'restored') {
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

function normalizeWorkspace(candidate, index = 0) {
  const id = typeof candidate?.id === 'string' && candidate.id.trim()
    ? candidate.id
    : makeRuntimeId('workspace');

  const name = typeof candidate?.name === 'string' && candidate.name.trim()
    ? candidate.name.trim()
    : defaultWorkspaceName(index);

  const iconKey = WORKSPACE_ICON_KEYS.includes(candidate?.iconKey)
    ? candidate.iconKey
    : WORKSPACE_ICON_KEYS[index % WORKSPACE_ICON_KEYS.length];

  const tabs = Array.isArray(candidate?.tabs) && candidate.tabs.length > 0
    ? candidate.tabs.slice(0, 80).map((tab, tabIndex) => normalizeTab(tab, `${id}-${tabIndex}`))
    : [normalizeTab(null, `${id}-tab-0`)];

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

function normalizeSessionState(session) {
  if (session?.version === 2 && Array.isArray(session?.workspaces) && session.workspaces.length > 0) {
    const workspaces = session.workspaces
      .slice(0, MAX_WORKSPACES)
      .map((workspace, index) => normalizeWorkspace(workspace, index));

    return {
      version: 2,
      workspaces,
      activeWorkspaceId: workspaces.some((workspace) => workspace.id === session?.activeWorkspaceId)
        ? session.activeWorkspaceId
        : workspaces[0].id
    };
  }

  const legacyTabs = Array.isArray(session?.tabs) && session.tabs.length > 0
    ? session.tabs.map((tab, index) => normalizeTab(tab, `legacy-${index}`))
    : [normalizeTab(null, 'legacy-0')];

  const legacyActiveTabId = legacyTabs.some((tab) => tab.id === session?.activeTabId)
    ? session.activeTabId
    : legacyTabs[0].id;

  const defaultWorkspace = normalizeWorkspace({
    id: makeRuntimeId('workspace'),
    name: defaultWorkspaceName(0),
    iconKey: WORKSPACE_ICON_KEYS[0],
    tabs: legacyTabs,
    activeTabId: legacyActiveTabId
  }, 0);

  return {
    version: 2,
    workspaces: [defaultWorkspace],
    activeWorkspaceId: defaultWorkspace.id
  };
}

function normalizeQueueItem(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;
  const mangaId = String(entry.mangaId || '').trim();
  const chapterId = String(entry.chapterId || '').trim() || null;
  if (!mangaId) return null;

  const candidateSources = Array.isArray(entry.sources) && entry.sources.length > 0
    ? entry.sources
    : [entry.source || entry.displaySource || 'manual'];
  const sources = uniqueStrings(candidateSources);
  const priority = ['manual', 'quick-add', 'end-of-chapter', 'next-engine'];
  const displaySource = priority.find((source) => sources.includes(source)) || sources[0] || 'manual';
  const deferredAt = entry.deferredUntil == null ? null : Number(entry.deferredUntil);

  return {
    id: String(entry.id || `queue-${mangaId}-${chapterId || 'manga'}-${index}`),
    mangaId,
    chapterId,
    sources,
    displaySource,
    pinned: Boolean(entry.pinned),
    deferredUntil: Number.isFinite(deferredAt) ? deferredAt : null,
    updatedAt: String(entry.updatedAt || entry.createdAt || new Date().toISOString())
  };
}

function normalizeQueue(queue) {
  const dedup = new Map();
  (Array.isArray(queue) ? queue : []).forEach((entry, index) => {
    const normalized = normalizeQueueItem(entry, index);
    if (!normalized) return;
    const identity = normalized.chapterId ? `${normalized.mangaId}::${normalized.chapterId}` : `${normalized.mangaId}::manga`;
    const previous = dedup.get(identity);
    if (!previous) {
      dedup.set(identity, normalized);
      return;
    }
    const mergedSources = uniqueStrings([...(previous.sources || []), ...(normalized.sources || [])]);
    const priority = ['manual', 'quick-add', 'end-of-chapter', 'next-engine'];
    dedup.set(identity, {
      ...previous,
      ...normalized,
      id: previous.id,
      sources: mergedSources,
      displaySource: priority.find((source) => mergedSources.includes(source)) || mergedSources[0] || 'manual',
      pinned: Boolean(previous.pinned || normalized.pinned),
      updatedAt: new Date(Math.max(new Date(previous.updatedAt || 0).getTime(), new Date(normalized.updatedAt || 0).getTime())).toISOString()
    });
  });
  return [...dedup.values()].sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });
}

function normalizeMetadataFieldMap(map) {
  const next = {};
  for (const [mangaId, fields] of Object.entries(map && typeof map === 'object' ? map : {})) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
    const fieldEntries = Object.entries(fields)
      .map(([field, value]) => [String(field || '').trim(), value])
      .filter(([field]) => Boolean(field));
    if (fieldEntries.length === 0) continue;
    next[mangaId] = Object.fromEntries(fieldEntries);
  }
  return next;
}

function normalizeScanIndex(scanIndex) {
  const entries = {};
  const sourceEntries = scanIndex?.entries && typeof scanIndex.entries === 'object' ? scanIndex.entries : {};
  for (const [entryId, value] of Object.entries(sourceEntries)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const pathValue = String(value.path || '').trim();
    const locationId = String(value.locationId || entryId || '').trim();
    if (!pathValue || !locationId) continue;
    entries[locationId] = {
      locationId,
      path: pathValue,
      kind: String(value.kind || '').trim() || 'item',
      contentId: String(value.contentId || '').trim() || null,
      containerType: String(value.containerType || '').trim() || null,
      sourceType: String(value.sourceType || '').trim() || null,
      healthStatus: String(value.healthStatus || '').trim() || 'ok',
      size: Number.isFinite(Number(value.size)) ? Number(value.size) : 0,
      mtimeMs: Number.isFinite(Number(value.mtimeMs)) ? Number(value.mtimeMs) : 0,
      pageCount: Number.isFinite(Number(value.pageCount)) ? Number(value.pageCount) : null,
      chapterCount: Number.isFinite(Number(value.chapterCount)) ? Number(value.chapterCount) : null,
      categoryId: value.categoryId ? String(value.categoryId) : null,
      mangaContentId: value.mangaContentId ? String(value.mangaContentId) : null,
      lastError: value.lastError ? String(value.lastError) : null,
      updatedAt: value.updatedAt ? String(value.updatedAt) : null
    };
  }
  return {
    updatedAt: scanIndex?.updatedAt ? String(scanIndex.updatedAt) : null,
    entries
  };
}

function getImportedNsfwGenreSet(state, mangaId) {
  const metadata = state?.metadata?.[mangaId] || {};
  const isNhentaiImport = metadata.onlineSource === 'nhentai' || Boolean(metadata.nhentaiId);
  if (!isNhentaiImport) return new Set();
  return new Set(uniqueStrings(metadata.onlineGenres).map((value) => value.toLowerCase()));
}

function normalizeState(state) {
  const normalized = deepMerge(DEFAULT_STATE, state || {});
  normalized.version = STORAGE_VERSION;
  normalized.stateVersion = STATE_VERSION;
  normalized.scanIndexVersion = SCAN_INDEX_VERSION;
  normalized.queueVersion = QUEUE_VERSION;
  normalized.metadataVersion = METADATA_VERSION;

  normalized.categories = Array.isArray(normalized.categories)
    ? normalized.categories.map((category, index) => ({
        id: String(category?.id || `category-${index}`),
        path: String(category?.path || '').trim(),
        name: String(category?.name || path.basename(String(category?.path || 'Categorie'))).trim(),
        hidden: Boolean(category?.hidden)
      })).filter((category) => category.path)
    : [];

  normalized.session = normalizeSessionState(normalized.session);
  normalized.scanIndex = normalizeScanIndex(normalized.scanIndex);
  normalized.readingQueue = normalizeQueue(normalized.readingQueue);
  normalized.metadataLocks = normalizeMetadataFieldMap(normalized.metadataLocks);
  normalized.metadataFieldSource = normalizeMetadataFieldMap(normalized.metadataFieldSource);

  normalized.mangaTags = normalized.mangaTags && typeof normalized.mangaTags === 'object' ? normalized.mangaTags : {};
  normalized.mangaTagMeta = normalized.mangaTagMeta && typeof normalized.mangaTagMeta === 'object' ? normalized.mangaTagMeta : {};
  normalized.annotations = normalized.annotations && typeof normalized.annotations === 'object' ? normalized.annotations : {};
  normalized.metadataWorkbenchQueue = uniqueStrings(normalized.metadataWorkbenchQueue);
  normalized.ui = normalized.ui && typeof normalized.ui === 'object' ? normalized.ui : {};
  normalized.ui.sidebarPins = Array.isArray(normalized.ui.sidebarPins)
    ? normalized.ui.sidebarPins
      .map((pin, index) => {
        const type = String(pin?.type || '').trim();
        const refId = String(pin?.refId || '').trim();
        if (!type || !refId) return null;
        return {
          id: String(pin?.id || `${type}-${refId}-${index}`),
          type,
          refId,
          label: String(pin?.label || '').trim() || null,
          icon: String(pin?.icon || '').trim() || null
        };
      })
      .filter(Boolean)
    : [];
  normalized.ui.maintenancePrefs = normalized.ui.maintenancePrefs && typeof normalized.ui.maintenancePrefs === 'object'
    ? {
        ...DEFAULT_STATE.ui.maintenancePrefs,
        ...normalized.ui.maintenancePrefs,
        mutedIssueTypes: uniqueStrings(normalized.ui.maintenancePrefs.mutedIssueTypes)
      }
    : structuredClone(DEFAULT_STATE.ui.maintenancePrefs);
  normalized.vault = normalized.vault && typeof normalized.vault === 'object'
    ? { ...DEFAULT_STATE.vault, ...normalized.vault }
    : structuredClone(DEFAULT_STATE.vault);
  normalized.vault.privateMangaIds = uniqueStrings(normalized.vault.privateMangaIds);
  normalized.vault.privateCategoryIds = uniqueStrings(normalized.vault.privateCategoryIds);
  normalized.vault.pinHash = normalized.vault.pinHash ? String(normalized.vault.pinHash) : null;
  normalized.vault.pinProtectedBlob = normalized.vault.pinProtectedBlob ? String(normalized.vault.pinProtectedBlob) : null;
  normalized.vault.blurCovers = Boolean(normalized.vault.blurCovers);
  normalized.vault.autoLockOnClose = true;
  normalized.vault.stealthMode = Boolean(normalized.vault.stealthMode);
  normalized.vault.securityMode = normalized.vault.pinProtectedBlob
    ? 'system'
    : (normalized.vault.pinHash ? 'basic' : 'none');
  normalized.vault.locked = (normalized.vault.pinHash || normalized.vault.pinProtectedBlob)
    ? Boolean(normalized.vault.locked)
    : false;
  normalized.smartCollections = Object.fromEntries(
    Object.entries({
      ...DEFAULT_STATE.smartCollections,
      ...(normalized.smartCollections && typeof normalized.smartCollections === 'object' ? normalized.smartCollections : {})
    })
      .map(([collectionId, collection]) => {
        if (!collection || typeof collection !== 'object') return null;
        return [
          collectionId,
          {
            id: collectionId,
            builtIn: Boolean(DEFAULT_STATE.smartCollections[collectionId]?.builtIn || collection.builtIn || collectionId.startsWith('smart-')),
            name: String(collection.name || DEFAULT_STATE.smartCollections[collectionId]?.name || collectionId).trim(),
            icon: String(collection.icon || DEFAULT_STATE.smartCollections[collectionId]?.icon || 'layers').trim(),
            color: String(collection.color || DEFAULT_STATE.smartCollections[collectionId]?.color || '#64748b').trim(),
            description: String(collection.description || DEFAULT_STATE.smartCollections[collectionId]?.description || '').trim(),
            rules: collection.rules && typeof collection.rules === 'object'
              ? collection.rules
              : (DEFAULT_STATE.smartCollections[collectionId]?.rules || { type: 'unread' })
          }
        ];
      })
      .filter(Boolean)
  );

  const now = new Date().toISOString();
  const validTagIds = new Set(Object.keys(normalized.tags || {}));

  for (const mangaId of Object.keys(normalized.mangaTags)) {
    const nextTagIds = uniqueStrings(normalized.mangaTags[mangaId]).filter((tagId) => validTagIds.has(tagId));
    if (nextTagIds.length === 0) {
      delete normalized.mangaTags[mangaId];
      delete normalized.mangaTagMeta[mangaId];
      continue;
    }

    normalized.mangaTags[mangaId] = nextTagIds;
    const existingMeta = normalized.mangaTagMeta[mangaId] && typeof normalized.mangaTagMeta[mangaId] === 'object'
      ? normalized.mangaTagMeta[mangaId]
      : {};
    const nsfwGenreNames = getImportedNsfwGenreSet(normalized, mangaId);
    const nextMeta = {};

    for (const tagId of nextTagIds) {
      const currentMeta = existingMeta[tagId] && typeof existingMeta[tagId] === 'object'
        ? { ...existingMeta[tagId] }
        : {};
      const tagName = String(normalized.tags?.[tagId]?.name || '').trim().toLowerCase();
      if (tagName && nsfwGenreNames.has(tagName)) {
        currentMeta.nsfw = true;
        currentMeta.source = currentMeta.source || 'nhentai';
        if (currentMeta.autoImported === undefined) currentMeta.autoImported = true;
        if (!currentMeta.markedAt) currentMeta.markedAt = now;
      }
      if (Object.keys(currentMeta).length > 0) nextMeta[tagId] = currentMeta;
    }

    if (Object.keys(nextMeta).length > 0) normalized.mangaTagMeta[mangaId] = nextMeta;
    else delete normalized.mangaTagMeta[mangaId];
  }

  for (const mangaId of Object.keys(normalized.mangaTagMeta)) {
    if (!normalized.mangaTags[mangaId]) delete normalized.mangaTagMeta[mangaId];
  }

  for (const mangaId of Object.keys(normalized.annotations)) {
    const items = Array.isArray(normalized.annotations[mangaId]) ? normalized.annotations[mangaId] : [];
    const nextItems = items
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const chapterId = String(item.chapterId || '').trim();
        if (!chapterId) return null;
        const pageIndex = Number(item.pageIndex);
        return {
          id: String(item.id || makeRuntimeId('annotation')),
          mangaId,
          chapterId,
          pageIndex: Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0,
          label: String(item.label || '').trim() || 'Repere',
          note: String(item.note || '').trim(),
          createdAt: item.createdAt || now,
          updatedAt: item.updatedAt || item.createdAt || now
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());

    if (nextItems.length > 0) normalized.annotations[mangaId] = nextItems;
    else delete normalized.annotations[mangaId];
  }

  return normalized;
}

function migrateLegacyState(rawState, sourceLabel = 'legacy') {
  const migrated = normalizeState(rawState || {});
  migrated.migrationLog = Array.isArray(migrated.migrationLog) ? migrated.migrationLog : [];
  migrated.migrationLog.push({
    from: Number(rawState?.stateVersion || rawState?.version || 1),
    to: STATE_VERSION,
    source: sourceLabel,
    date: new Date().toISOString()
  });
  return migrated;
}

function migrateFromV1(v1State) {
  return migrateLegacyState(v1State, 'v1');
}

function loadState() {
  if (cachedState) return cachedState;
  const statePath = getStatePath();
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed?.stateVersion === STATE_VERSION) {
        cachedState = normalizeState(parsed);
        return cachedState;
      }
      const migrated = migrateLegacyState(parsed, 'state-file');
      saveState(migrated);
      return migrated;
    } catch (_error) {
      // continue to legacy fallback below
    }
  }

  const legacyPath = getLegacyStatePath();
  if (fs.existsSync(legacyPath)) {
    try {
      const raw = fs.readFileSync(legacyPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const backupPath = path.join(getBackupDir(), `v1-auto-backup-${Date.now()}.json`);
      fs.writeFileSync(backupPath, raw, 'utf-8');
      const migrated = migrateLegacyState(parsed, 'legacy-path');
      saveState(migrated);
      return migrated;
    } catch (_error) {
      // continue to fresh state below
    }
  }

  const fresh = normalizeState(structuredClone(DEFAULT_STATE));
  saveState(fresh);
  return fresh;
}

function saveState(nextState) {
  const statePath = getStatePath();
  ensureDir(path.dirname(statePath));
  const normalizedState = normalizeState(nextState);
  cachedState = normalizedState;
  fs.writeFileSync(statePath, JSON.stringify(normalizedState), 'utf-8');
  return normalizedState;
}

function updateState(updater) {
  const current = loadState();
  const next = updater(structuredClone(current));
  return saveState(next);
}

function createBackup(label = '') {
  const state = loadState();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const fileName = `sawa-backup-${stamp}${label ? `-${label.replace(/[^a-zA-Z0-9]/g, '_')}` : ''}.json`;
  const backupPath = path.join(getBackupDir(), fileName);
  const manifest = {
    app: 'sawa-manga-library',
    version: '3.0.0',
    storageVersion: STORAGE_VERSION,
    stateVersion: STATE_VERSION,
    scanIndexVersion: SCAN_INDEX_VERSION,
    queueVersion: QUEUE_VERSION,
    metadataVersion: METADATA_VERSION,
    createdAt: now.toISOString(),
    label: label || 'Manual backup',
    stats: {
      categories: state.categories.length,
      favorites: Object.keys(state.favorites).length,
      tags: Object.keys(state.tags).length,
      collections: Object.keys(state.collections).length,
      progress: Object.keys(state.progress).length,
      metadata: Object.keys(state.metadata).length,
      readingQueue: state.readingQueue.length
    }
  };
  fs.writeFileSync(backupPath, JSON.stringify({ manifest, state }, null, 2), 'utf-8');
  updateState((nextState) => {
    nextState.backupHistory.push({ path: backupPath, createdAt: now.toISOString(), label: manifest.label, stats: manifest.stats });
    if (nextState.backupHistory.length > 20) nextState.backupHistory = nextState.backupHistory.slice(-20);
    return nextState;
  });
  return { path: backupPath, manifest };
}

function importBackup(backupFilePath) {
  const raw = fs.readFileSync(backupFilePath, 'utf-8');
  const backup = JSON.parse(raw);
  if (!backup.manifest || !backup.state) throw new Error('Invalid backup file format');
  createBackup('pre-import-auto');
  const imported = normalizeState(backup.state);
  saveState(imported);
  return { manifest: backup.manifest, restored: true };
}

function listBackups() {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((fileName) => fileName.endsWith('.json')).map((fileName) => {
    const fullPath = path.join(dir, fileName);
    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { path: fullPath, fileName, manifest: parsed.manifest || null, size: fs.statSync(fullPath).size };
    } catch (_error) {
      return { path: fullPath, fileName, manifest: null, size: 0 };
    }
  }).sort((a, b) => (b.manifest?.createdAt || '').localeCompare(a.manifest?.createdAt || ''));
}

function createTag(name, color = '#8b5cf6') {
  return updateState((state) => {
    const id = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.tags[id] = { id, name: name.trim(), color, createdAt: new Date().toISOString() };
    return state;
  });
}

function deleteTag(tagId) {
  return updateState((state) => {
    delete state.tags[tagId];
    for (const mangaId of Object.keys(state.mangaTags)) {
      state.mangaTags[mangaId] = (state.mangaTags[mangaId] || []).filter((id) => id !== tagId);
      if (state.mangaTags[mangaId].length === 0) {
        delete state.mangaTags[mangaId];
        delete state.mangaTagMeta[mangaId];
        continue;
      }
      if (state.mangaTagMeta?.[mangaId]) {
        delete state.mangaTagMeta[mangaId][tagId];
        if (Object.keys(state.mangaTagMeta[mangaId]).length === 0) delete state.mangaTagMeta[mangaId];
      }
    }
    return state;
  });
}

function setMangaTags(mangaId, tagIds, tagMeta = null) {
  return updateState((state) => {
    const nextTagIds = uniqueStrings(tagIds).filter((tagId) => state.tags[tagId]);
    if (nextTagIds.length === 0) {
      delete state.mangaTags[mangaId];
      delete state.mangaTagMeta[mangaId];
      return state;
    }

    state.mangaTags[mangaId] = nextTagIds;
    const prevMeta = state.mangaTagMeta?.[mangaId] && typeof state.mangaTagMeta[mangaId] === 'object' ? state.mangaTagMeta[mangaId] : {};
    const nextMeta = {};

    for (const tagId of nextTagIds) {
      const metaPatch = tagMeta?.[tagId] && typeof tagMeta[tagId] === 'object' ? tagMeta[tagId] : null;
      const mergedMeta = { ...(prevMeta[tagId] || {}), ...(metaPatch || {}) };
      if (Object.keys(mergedMeta).length > 0) nextMeta[tagId] = mergedMeta;
    }

    if (Object.keys(nextMeta).length > 0) state.mangaTagMeta[mangaId] = nextMeta;
    else delete state.mangaTagMeta[mangaId];
    return state;
  });
}

function addTagToManga(mangaId, tagId, meta = null) {
  return updateState((state) => {
    const current = state.mangaTags[mangaId] || [];
    if (!current.includes(tagId)) state.mangaTags[mangaId] = [...current, tagId];
    if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
      state.mangaTagMeta[mangaId] = state.mangaTagMeta[mangaId] && typeof state.mangaTagMeta[mangaId] === 'object' ? state.mangaTagMeta[mangaId] : {};
      state.mangaTagMeta[mangaId][tagId] = { ...(state.mangaTagMeta[mangaId][tagId] || {}), ...meta };
    }
    return state;
  });
}

function removeTagFromManga(mangaId, tagId) {
  return updateState((state) => {
    state.mangaTags[mangaId] = (state.mangaTags[mangaId] || []).filter((id) => id !== tagId);
    if (state.mangaTags[mangaId].length === 0) {
      delete state.mangaTags[mangaId];
      delete state.mangaTagMeta[mangaId];
      return state;
    }
    if (state.mangaTagMeta?.[mangaId]) {
      delete state.mangaTagMeta[mangaId][tagId];
      if (Object.keys(state.mangaTagMeta[mangaId]).length === 0) delete state.mangaTagMeta[mangaId];
    }
    return state;
  });
}

function createCollection(name, description = '', color = '#8b5cf6') {
  return updateState((state) => {
    const id = `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.collections[id] = { id, name: name.trim(), description, color, mangaIds: [], createdAt: new Date().toISOString() };
    return state;
  });
}

function deleteCollection(collectionId) {
  return updateState((state) => {
    delete state.collections[collectionId];
    return state;
  });
}

function updateCollection(collectionId, patch) {
  return updateState((state) => {
    if (state.collections[collectionId]) state.collections[collectionId] = { ...state.collections[collectionId], ...patch };
    return state;
  });
}

function addMangaToCollection(collectionId, mangaId) {
  return updateState((state) => {
    const collection = state.collections[collectionId];
    if (collection && !collection.mangaIds.includes(mangaId)) collection.mangaIds.push(mangaId);
    return state;
  });
}

function removeMangaFromCollection(collectionId, mangaId) {
  return updateState((state) => {
    const collection = state.collections[collectionId];
    if (collection) collection.mangaIds = collection.mangaIds.filter((id) => id !== mangaId);
    return state;
  });
}

module.exports = {
  STORAGE_VERSION,
  STATE_VERSION,
  SCAN_INDEX_VERSION,
  QUEUE_VERSION,
  METADATA_VERSION,
  DEFAULT_STATE,
  loadState,
  saveState,
  updateState,
  getUserDataPath,
  getBackupDir,
  getThumbnailDir,
  getCbzCacheDir,
  createBackup,
  importBackup,
  listBackups,
  migrateFromV1,
  createTag,
  deleteTag,
  setMangaTags,
  addTagToManga,
  removeTagFromManga,
  createCollection,
  deleteCollection,
  updateCollection,
  addMangaToCollection,
  removeMangaFromCollection
};
