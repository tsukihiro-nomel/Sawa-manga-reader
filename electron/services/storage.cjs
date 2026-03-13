/**
 * Sawa Manga Library v2.0.0 — Storage Layer
 *
 * Structured local storage for enriched metadata, tags, collections,
 * reading progress, sessions, and migration from v1.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const STORAGE_VERSION = 2;

const DEFAULT_STATE = {
  version: STORAGE_VERSION,
  categories: [],
  session: { tabs: [], activeTabId: null },
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
    readerDoublePageMode: 'manga-jp',
    autoMarkReadThreshold: 95,
    continuousReading: true,
    activeScreen: 'dashboard',
    filters: { readStatus: 'all', favoriteOnly: false, hasDescription: null, hasCustomCover: null, tags: [], collections: [] },
    keyboardShortcuts: {
      nextPage: 'ArrowRight', prevPage: 'ArrowLeft',
      nextChapter: 'Ctrl+ArrowRight', prevChapter: 'Ctrl+ArrowLeft',
      toggleFullscreen: 'f', toggleUI: 'h',
      zoomIn: '+', zoomOut: '-', zoomReset: '0', exitReader: 'Escape'
    }
  },
  metadata: {},
  favorites: {},
  tags: {},
  mangaTags: {},
  collections: {},
  smartCollections: {
    'smart-continue': { id: 'smart-continue', name: 'Continuer', icon: 'play', rules: { type: 'in-progress' } },
    'smart-unread': { id: 'smart-unread', name: 'Non lus', icon: 'book', rules: { type: 'unread' } },
    'smart-in-progress': { id: 'smart-in-progress', name: 'En cours', icon: 'clock', rules: { type: 'started' } },
    'smart-completed': { id: 'smart-completed', name: 'Terminés', icon: 'check', rules: { type: 'completed' } },
    'smart-favorites': { id: 'smart-favorites', name: 'Favoris', icon: 'heart', rules: { type: 'favorites' } },
    'smart-recent-added': { id: 'smart-recent-added', name: 'Ajoutés récemment', icon: 'plus', rules: { type: 'recent-added', days: 30 } },
    'smart-recent-read': { id: 'smart-recent-read', name: 'Dernière lecture', icon: 'eye', rules: { type: 'recent-read', days: 14 } },
    'smart-new-chapters': { id: 'smart-new-chapters', name: 'Nouveaux chapitres', icon: 'sparkles', rules: { type: 'new-chapters' } },
    'smart-no-cover': { id: 'smart-no-cover', name: 'Sans couverture', icon: 'image', rules: { type: 'no-cover' } },
    'smart-no-metadata': { id: 'smart-no-metadata', name: 'Sans métadonnées', icon: 'alert', rules: { type: 'no-metadata' } }
  },
  readingStates: {},
  chapterStates: {},
  readStatus: {},
  chapterReadStatus: {},
  progress: {},
  recents: [],
  knownChapterCounts: {},
  readerPrefs: {},
  backupHistory: [],
  migrationLog: []
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getUserDataPath() { return app.getPath('userData'); }

function getStatePath() {
  const udp = getUserDataPath();
  ensureDir(udp);
  return path.join(udp, 'sawa-manga-state-v2.json');
}

function getLegacyStatePath() {
  return path.join(getUserDataPath(), 'sawa-manga-state.json');
}

function getBackupDir() {
  const d = path.join(getUserDataPath(), 'backups');
  ensureDir(d);
  return d;
}

function getThumbnailDir() {
  const d = path.join(getUserDataPath(), 'thumbnails');
  ensureDir(d);
  return d;
}

function deepMerge(base, incoming) {
  if (Array.isArray(base) || Array.isArray(incoming)) return incoming ?? base;
  const result = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function migrateFromV1(v1State) {
  const migrated = structuredClone(DEFAULT_STATE);
  const now = new Date().toISOString();
  migrated.migrationLog.push({ from: 1, to: STORAGE_VERSION, date: now, itemsMigrated: {} });
  const log = migrated.migrationLog[0].itemsMigrated;

  if (Array.isArray(v1State.categories)) {
    migrated.categories = v1State.categories.map((c) => ({ id: c.id, path: c.path, name: c.name, hidden: Boolean(c.hidden) }));
    log.categories = migrated.categories.length;
  }
  if (v1State.session) {
    migrated.session = { tabs: Array.isArray(v1State.session.tabs) ? v1State.session.tabs : [], activeTabId: v1State.session.activeTabId ?? null };
  }
  if (v1State.ui) {
    for (const k of ['theme','selectedCategoryId','showHiddenCategories','sidebarCollapsed','sort','cardSize','accent','accentAlt','showPagePreviewBeforeReading','readerMode']) {
      if (v1State.ui[k] !== undefined) migrated.ui[k] = v1State.ui[k];
    }
  }
  if (v1State.metadata && typeof v1State.metadata === 'object') { migrated.metadata = { ...v1State.metadata }; log.metadata = Object.keys(migrated.metadata).length; }
  if (v1State.favorites && typeof v1State.favorites === 'object') { migrated.favorites = { ...v1State.favorites }; log.favorites = Object.keys(migrated.favorites).length; }
  if (v1State.readStatus) migrated.readStatus = { ...v1State.readStatus };
  if (v1State.chapterReadStatus) migrated.chapterReadStatus = { ...v1State.chapterReadStatus };
  for (const [mid, isRead] of Object.entries(v1State.readStatus || {})) migrated.readingStates[mid] = isRead ? 'read' : 'in-progress';
  for (const [cid, isRead] of Object.entries(v1State.chapterReadStatus || {})) migrated.chapterStates[cid] = isRead ? 'read' : 'in-progress';
  if (v1State.progress) { migrated.progress = { ...v1State.progress }; log.progress = Object.keys(migrated.progress).length; }
  if (Array.isArray(v1State.recents)) { migrated.recents = v1State.recents.slice(0, 50); log.recents = migrated.recents.length; }

  return migrated;
}

function loadState() {
  const v2Path = getStatePath();
  if (fs.existsSync(v2Path)) {
    try {
      const raw = fs.readFileSync(v2Path, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.version === STORAGE_VERSION) return deepMerge(DEFAULT_STATE, parsed);
    } catch (_) {}
  }
  const v1Path = getLegacyStatePath();
  if (fs.existsSync(v1Path)) {
    try {
      const raw = fs.readFileSync(v1Path, 'utf-8');
      const v1State = JSON.parse(raw);
      const backupPath = path.join(getBackupDir(), 'v1-auto-backup-' + Date.now() + '.json');
      fs.writeFileSync(backupPath, raw, 'utf-8');
      const migrated = migrateFromV1(v1State);
      saveState(migrated);
      return migrated;
    } catch (_) {}
  }
  const fresh = structuredClone(DEFAULT_STATE);
  saveState(fresh);
  return fresh;
}

function saveState(nextState) {
  const statePath = getStatePath();
  ensureDir(path.dirname(statePath));
  nextState.version = STORAGE_VERSION;
  fs.writeFileSync(statePath, JSON.stringify(nextState, null, 2), 'utf-8');
  return nextState;
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
  const fileName = 'sawa-backup-' + stamp + (label ? '-' + label.replace(/[^a-zA-Z0-9]/g, '_') : '') + '.json';
  const backupPath = path.join(getBackupDir(), fileName);
  const manifest = {
    app: 'sawa-manga-library', version: '2.0.0', storageVersion: STORAGE_VERSION,
    createdAt: now.toISOString(), label: label || 'Manual backup',
    stats: {
      categories: state.categories.length,
      favorites: Object.keys(state.favorites).length,
      tags: Object.keys(state.tags).length,
      collections: Object.keys(state.collections).length,
      progress: Object.keys(state.progress).length,
      metadata: Object.keys(state.metadata).length
    }
  };
  fs.writeFileSync(backupPath, JSON.stringify({ manifest, state }, null, 2), 'utf-8');
  updateState((s) => {
    s.backupHistory.push({ path: backupPath, createdAt: now.toISOString(), label: manifest.label, stats: manifest.stats });
    if (s.backupHistory.length > 20) s.backupHistory = s.backupHistory.slice(-20);
    return s;
  });
  return { path: backupPath, manifest };
}

function importBackup(backupFilePath) {
  const raw = fs.readFileSync(backupFilePath, 'utf-8');
  const backup = JSON.parse(raw);
  if (!backup.manifest || !backup.state) throw new Error('Invalid backup file format');
  createBackup('pre-import-auto');
  const imported = deepMerge(DEFAULT_STATE, backup.state);
  imported.version = STORAGE_VERSION;
  saveState(imported);
  return { manifest: backup.manifest, restored: true };
}

function listBackups() {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const fp = path.join(dir, f);
    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      const parsed = JSON.parse(raw);
      return { path: fp, fileName: f, manifest: parsed.manifest || null, size: fs.statSync(fp).size };
    } catch (_) { return { path: fp, fileName: f, manifest: null, size: 0 }; }
  }).sort((a, b) => (b.manifest?.createdAt || '').localeCompare(a.manifest?.createdAt || ''));
}

function createTag(name, color = '#8b5cf6') {
  return updateState((s) => {
    const id = 'tag-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    s.tags[id] = { id, name: name.trim(), color, createdAt: new Date().toISOString() };
    return s;
  });
}

function deleteTag(tagId) {
  return updateState((s) => {
    delete s.tags[tagId];
    for (const mid of Object.keys(s.mangaTags)) {
      s.mangaTags[mid] = (s.mangaTags[mid] || []).filter((id) => id !== tagId);
      if (s.mangaTags[mid].length === 0) delete s.mangaTags[mid];
    }
    return s;
  });
}

function setMangaTags(mangaId, tagIds) {
  return updateState((s) => { s.mangaTags[mangaId] = [...new Set(tagIds)]; return s; });
}

function addTagToManga(mangaId, tagId) {
  return updateState((s) => {
    const cur = s.mangaTags[mangaId] || [];
    if (!cur.includes(tagId)) s.mangaTags[mangaId] = [...cur, tagId];
    return s;
  });
}

function removeTagFromManga(mangaId, tagId) {
  return updateState((s) => {
    s.mangaTags[mangaId] = (s.mangaTags[mangaId] || []).filter((id) => id !== tagId);
    if (s.mangaTags[mangaId].length === 0) delete s.mangaTags[mangaId];
    return s;
  });
}

function createCollection(name, description = '', color = '#8b5cf6') {
  return updateState((s) => {
    const id = 'col-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    s.collections[id] = { id, name: name.trim(), description, color, mangaIds: [], createdAt: new Date().toISOString() };
    return s;
  });
}

function deleteCollection(collectionId) {
  return updateState((s) => { delete s.collections[collectionId]; return s; });
}

function updateCollection(collectionId, patch) {
  return updateState((s) => {
    if (s.collections[collectionId]) s.collections[collectionId] = { ...s.collections[collectionId], ...patch };
    return s;
  });
}

function addMangaToCollection(collectionId, mangaId) {
  return updateState((s) => {
    const col = s.collections[collectionId];
    if (col && !col.mangaIds.includes(mangaId)) col.mangaIds.push(mangaId);
    return s;
  });
}

function removeMangaFromCollection(collectionId, mangaId) {
  return updateState((s) => {
    const col = s.collections[collectionId];
    if (col) col.mangaIds = col.mangaIds.filter((id) => id !== mangaId);
    return s;
  });
}

module.exports = {
  STORAGE_VERSION, DEFAULT_STATE,
  loadState, saveState, updateState,
  getUserDataPath, getBackupDir, getThumbnailDir,
  createBackup, importBackup, listBackups, migrateFromV1,
  createTag, deleteTag, setMangaTags, addTagToManga, removeTagFromManga,
  createCollection, deleteCollection, updateCollection, addMangaToCollection, removeMangaFromCollection
};
