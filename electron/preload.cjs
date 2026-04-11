// Sawa Manga Library v3.0.0 â€“ Electron Preload Script
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (...args) => ipcRenderer.invoke(...args);

contextBridge.exposeInMainWorld('mangaAPI', {
  // â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  bootstrap:              ()                              => invoke('app:bootstrap'),
  getCompactIndex:        ()                              => invoke('app:getCompactIndex'),
  signalBootReady:        ()                              => ipcRenderer.send('app:boot-ready'),

  // â”€â”€ Library â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  addCategories:          ()                              => invoke('library:addCategories'),
  removeCategory:         (categoryId)                    => invoke('library:removeCategory', categoryId),
  trashManga:             (mangaId)                       => invoke('library:trashManga', mangaId),
  toggleCategoryHidden:   (categoryId)                    => invoke('library:toggleCategoryHidden', categoryId),
  getChapterPages:        (chapterPath)                   => invoke('library:getChapterPages', chapterPath),
  readPdfData:           (filePath)                      => invoke('library:readPdfData', filePath),
  pickCover:              (mangaId)                       => invoke('library:pickCover', mangaId),
  updateMetadata:         (mangaId, patch)                => invoke('library:updateMetadata', mangaId, patch),
  toggleFavorite:         (mangaId)                       => invoke('library:toggleFavorite', mangaId),
  bulkFavorite:           (mangaIds, nextValue)           => invoke('library:bulkFavorite', mangaIds, nextValue),
  setPrivateFlag:         (mangaId, isPrivate)            => invoke('library:setPrivateFlag', mangaId, isPrivate),
  setPrivateFlagMany:     (mangaIds, isPrivate)           => invoke('library:setPrivateFlagMany', mangaIds, isPrivate),
  setPrivateCategoryFlag: (categoryId, isPrivate)         => invoke('library:setPrivateCategoryFlag', categoryId, isPrivate),
  forceRescan:            ()                              => invoke('library:forceRescan'),

  // â”€â”€ Reading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  updateProgress:         (payload)                       => invoke('reading:updateProgress', payload),
  updateProgressLight:    (payload)                       => invoke('reading:updateProgressLight', payload),
  setReadStatus:          (mangaId, isRead, chapterIds)   => invoke('reading:setReadStatus', mangaId, isRead, chapterIds),
  setChapterReadStatus:   (mangaId, chapterId, isRead, pageCount) => invoke('reading:setChapterReadStatus', mangaId, chapterId, isRead, pageCount),
  resetProgress:          (mangaId, chapterIds)           => invoke('reading:resetProgress', mangaId, chapterIds),
  resetChapterProgress:   (chapterId)                     => invoke('reading:resetChapterProgress', chapterId),
  bulkSetReadStatus:      (entries, isRead)               => invoke('reading:bulkSetReadStatus', entries, isRead),

  // â”€â”€ Tags â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createTag:              (name, color)                   => invoke('tags:create', name, color),
  deleteTag:              (tagId)                         => invoke('tags:delete', tagId),
  addTagToManga:          (mangaId, tagId)                => invoke('tags:addToManga', mangaId, tagId),
  removeTagFromManga:     (mangaId, tagId)                => invoke('tags:removeFromManga', mangaId, tagId),
  setMangaTags:           (mangaId, tagIds)               => invoke('tags:setForManga', mangaId, tagIds),
  toggleMangaTag:         (mangaId, tagId)                => invoke('tags:toggleForManga', mangaId, tagId),
  addTagToMany:           (tagId, mangaIds)               => invoke('tags:addMany', tagId, mangaIds),

  // â”€â”€ Collections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createCollection:       (name, description, color)      => invoke('collections:create', name, description, color),
  deleteCollection:       (collectionId)                  => invoke('collections:delete', collectionId),
  updateCollection:       (collectionId, patch)           => invoke('collections:update', collectionId, patch),
  addMangaToCollection:   (collectionId, mangaId)         => invoke('collections:addManga', collectionId, mangaId),
  removeMangaFromCollection: (collectionId, mangaId)      => invoke('collections:removeManga', collectionId, mangaId),
  addManyToCollection:    (collectionId, mangaIds)        => invoke('collections:addMany', collectionId, mangaIds),
  saveSmartCollection:    (collection)                    => invoke('smartCollections:save', collection),
  deleteSmartCollection:  (collectionId)                  => invoke('smartCollections:delete', collectionId),

  // â”€â”€ Online Metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  searchOnlineMetadata:   (query)                        => invoke('metadata:searchOnline', query),
  importOnlineMetadata:   (mangaId, onlineData)          => invoke('metadata:importOnline', mangaId, onlineData),
  queueMetadataWorkbench: (mangaIds, mode)               => invoke('metadata:queueWorkbench', mangaIds, mode),
  setMetadataWorkbenchQueue: (mangaIds)                  => invoke('metadata:setWorkbenchQueue', mangaIds),
  updateMetadataFieldLocks: (mangaId, patch)             => invoke('metadata:updateFieldLocks', mangaId, patch),
  importComicInfo:        (mangaId, options)             => invoke('metadata:importComicInfo', mangaId, options),

  // Queue
  upsertReadingQueueItem: (item)                         => invoke('queue:upsert', item),
  removeReadingQueueItem: (item)                         => invoke('queue:remove', item),
  saveReadingQueue:       (items)                        => invoke('queue:save', items),

  // â€”â€” Annotations / Notes â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”â€”
  addAnnotation:          (input)                         => invoke('annotations:add', input),
  deleteAnnotation:       (mangaId, annotationId)         => invoke('annotations:delete', mangaId, annotationId),

  // â”€â”€ Backup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createBackup:           (label)                         => invoke('backup:create', label),
  importBackup:           ()                              => invoke('backup:import'),
  listBackups:            ()                              => invoke('backup:list'),
  exportBackup:           ()                              => invoke('backup:export'),

  // â”€â”€ UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  updateSettings:         (patch)                         => invoke('ui:updateSettings', patch),
  pickBackgroundImage:    ()                              => invoke('ui:pickBackgroundImage'),
  removeBackgroundImage:  ()                              => invoke('ui:removeBackgroundImage'),
  saveTabsSession:        (payload)                       => invoke('session:saveTabs', payload),
  setVaultPin:            (pin)                           => invoke('vault:setPin', pin),
  unlockVault:            (pin)                           => invoke('vault:unlock', pin),
  lockVault:              ()                              => invoke('vault:lock'),
  updateVaultPrefs:       (patch)                         => invoke('vault:updatePrefs', patch),

  // â”€â”€ Window â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  minimizeWindow:         ()                              => invoke('window:minimize'),
  toggleMaximizeWindow:   ()                              => invoke('window:toggleMaximize'),
  closeWindow:            ()                              => invoke('window:close'),
  toggleFullScreen:       ()                              => invoke('window:toggleFullScreen'),

  // â”€â”€ Maintenance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  clearCache:             ()                              => invoke('maintenance:clearCache'),
  rebuildIndex:           ()                              => invoke('maintenance:rebuildIndex'),
  getStats:               ()                              => invoke('maintenance:getStats'),

  // â”€â”€ Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  onLibraryChanged: (callback) => {
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on('library:changed', handler);
    return () => ipcRenderer.removeListener('library:changed', handler);
  },
});

