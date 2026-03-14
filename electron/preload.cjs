// Sawa Manga Library v2.0.0 – Electron Preload Script
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (...args) => ipcRenderer.invoke(...args);

contextBridge.exposeInMainWorld('mangaAPI', {
  // ── App ──────────────────────────────────────────────
  bootstrap:              ()                              => invoke('app:bootstrap'),
  getCompactIndex:        ()                              => invoke('app:getCompactIndex'),

  // ── Library ──────────────────────────────────────────
  addCategories:          ()                              => invoke('library:addCategories'),
  removeCategory:         (categoryId)                    => invoke('library:removeCategory', categoryId),
  trashManga:             (mangaId)                       => invoke('library:trashManga', mangaId),
  toggleCategoryHidden:   (categoryId)                    => invoke('library:toggleCategoryHidden', categoryId),
  getChapterPages:        (chapterPath)                   => invoke('library:getChapterPages', chapterPath),
  pickCover:              (mangaId)                       => invoke('library:pickCover', mangaId),
  updateMetadata:         (mangaId, patch)                => invoke('library:updateMetadata', mangaId, patch),
  toggleFavorite:         (mangaId)                       => invoke('library:toggleFavorite', mangaId),
  forceRescan:            ()                              => invoke('library:forceRescan'),

  // ── Reading ──────────────────────────────────────────
  updateProgress:         (payload)                       => invoke('reading:updateProgress', payload),
  updateProgressLight:    (payload)                       => invoke('reading:updateProgressLight', payload),
  setReadStatus:          (mangaId, isRead, chapterIds)   => invoke('reading:setReadStatus', mangaId, isRead, chapterIds),
  setChapterReadStatus:   (mangaId, chapterId, isRead, pageCount) => invoke('reading:setChapterReadStatus', mangaId, chapterId, isRead, pageCount),
  resetProgress:          (mangaId, chapterIds)           => invoke('reading:resetProgress', mangaId, chapterIds),
  resetChapterProgress:   (chapterId)                     => invoke('reading:resetChapterProgress', chapterId),

  // ── Tags ─────────────────────────────────────────────
  createTag:              (name, color)                   => invoke('tags:create', name, color),
  deleteTag:              (tagId)                         => invoke('tags:delete', tagId),
  addTagToManga:          (mangaId, tagId)                => invoke('tags:addToManga', mangaId, tagId),
  removeTagFromManga:     (mangaId, tagId)                => invoke('tags:removeFromManga', mangaId, tagId),
  setMangaTags:           (mangaId, tagIds)               => invoke('tags:setForManga', mangaId, tagIds),
  toggleMangaTag:         (mangaId, tagId)                => invoke('tags:toggleForManga', mangaId, tagId),

  // ── Collections ──────────────────────────────────────
  createCollection:       (name, description, color)      => invoke('collections:create', name, description, color),
  deleteCollection:       (collectionId)                  => invoke('collections:delete', collectionId),
  updateCollection:       (collectionId, patch)           => invoke('collections:update', collectionId, patch),
  addMangaToCollection:   (collectionId, mangaId)         => invoke('collections:addManga', collectionId, mangaId),
  removeMangaFromCollection: (collectionId, mangaId)      => invoke('collections:removeManga', collectionId, mangaId),

  // ── Online Metadata ─────────────────────────────────
  searchOnlineMetadata:   (query)                        => invoke('metadata:searchOnline', query),
  importOnlineMetadata:   (mangaId, onlineData)          => invoke('metadata:importOnline', mangaId, onlineData),

  // ── Backup ───────────────────────────────────────────
  createBackup:           (label)                         => invoke('backup:create', label),
  importBackup:           ()                              => invoke('backup:import'),
  listBackups:            ()                              => invoke('backup:list'),
  exportBackup:           ()                              => invoke('backup:export'),

  // ── UI ───────────────────────────────────────────────
  updateSettings:         (patch)                         => invoke('ui:updateSettings', patch),
  pickBackgroundImage:    ()                              => invoke('ui:pickBackgroundImage'),
  removeBackgroundImage:  ()                              => invoke('ui:removeBackgroundImage'),
  saveTabsSession:        (payload)                       => invoke('session:saveTabs', payload),

  // ── Window ───────────────────────────────────────────
  minimizeWindow:         ()                              => invoke('window:minimize'),
  toggleMaximizeWindow:   ()                              => invoke('window:toggleMaximize'),
  closeWindow:            ()                              => invoke('window:close'),
  toggleFullScreen:       ()                              => invoke('window:toggleFullScreen'),

  // ── Maintenance ──────────────────────────────────────
  clearCache:             ()                              => invoke('maintenance:clearCache'),
  rebuildIndex:           ()                              => invoke('maintenance:rebuildIndex'),
  getStats:               ()                              => invoke('maintenance:getStats'),

  // ── Events ───────────────────────────────────────────
  onLibraryChanged: (callback) => {
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on('library:changed', handler);
    return () => ipcRenderer.removeListener('library:changed', handler);
  },
});
