/**
 * Sawa Manga Library v2.0.0 — Electron Main Process
 */

const fs = require('fs');
const path = require('path');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  shell
} = require('electron');
const { pathToFileURL } = require('url');

const {
  loadState,
  saveState,
  updateState,
  createBackup,
  importBackup,
  listBackups,
  createTag,
  deleteTag,
  setMangaTags,
  addTagToManga,
  removeTagFromManga,
  createCollection,
  deleteCollection,
  updateCollection,
  addMangaToCollection,
  removeMangaFromCollection,
  getThumbnailDir,
  getUserDataPath
} = require('./services/storage.cjs');

const {
  scanLibrary,
  getChapterPages,
  makeId,
  buildCompactIndex
} = require('./services/libraryScanner.cjs');

const { LibraryWatcher } = require('./services/watcher.cjs');

/* ------------------------------------------------------------------ */
/*  Color extraction from image buffer                                 */
/* ------------------------------------------------------------------ */

function extractDominantColors(imgBuffer) {
  try {
    const img = nativeImage.createFromBuffer(imgBuffer);
    if (img.isEmpty()) return null;
    // Resize to small for fast sampling
    const small = img.resize({ width: 64, height: 64, quality: 'low' });
    const bmp = small.toBitmap();
    const w = small.getSize().width;
    const h = small.getSize().height;

    // Sample pixels, group by hue buckets
    const buckets = new Array(12).fill(null).map(() => ({ r: 0, g: 0, b: 0, count: 0, satSum: 0 }));
    for (let i = 0; i < bmp.length; i += 4) {
      const r = bmp[i], g = bmp[i + 1], b = bmp[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const delta = max - min;
      const lightness = (max + min) / 510;
      if (delta < 20 || lightness < 0.08 || lightness > 0.92) continue; // skip grays
      const sat = delta / (max || 1);
      let hue = 0;
      if (delta > 0) {
        if (max === r) hue = ((g - b) / delta) % 6;
        else if (max === g) hue = (b - r) / delta + 2;
        else hue = (r - g) / delta + 4;
        hue = ((hue * 60) + 360) % 360;
      }
      const bucket = Math.floor(hue / 30) % 12;
      buckets[bucket].r += r;
      buckets[bucket].g += g;
      buckets[bucket].b += b;
      buckets[bucket].count += 1;
      buckets[bucket].satSum += sat;
    }

    // Sort by weighted score (count * avg saturation)
    const scored = buckets
      .filter(b => b.count > 0)
      .map(b => ({
        r: Math.round(b.r / b.count),
        g: Math.round(b.g / b.count),
        b: Math.round(b.b / b.count),
        score: b.count * (b.satSum / b.count)
      }))
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;

    const toHex = (c) => `#${c.r.toString(16).padStart(2, '0')}${c.g.toString(16).padStart(2, '0')}${c.b.toString(16).padStart(2, '0')}`;
    const accent = toHex(scored[0]);
    const accentAlt = scored.length > 1 ? toHex(scored[1]) : accent;
    return { accent, accentAlt };
  } catch (_) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Globals                                                           */
/* ------------------------------------------------------------------ */

let mainWindow = null;
const watcher = new LibraryWatcher();
let lastScanTime = 0;

/* ------------------------------------------------------------------ */
/*  Protocol — manga://local/<encoded-path>                           */
/* ------------------------------------------------------------------ */

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'manga',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

function registerLocalAssetProtocol() {
  protocol.handle('manga', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'local') {
        return new Response('Not found', { status: 404 });
      }

      const encodedPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
      const filePath = decodeURIComponent(encodedPath);

      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      return new Response('Unable to load local asset', { status: 500 });
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Window                                                            */
/* ------------------------------------------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Sawa',
    width: 1500,
    height: 960,
    minWidth: 1160,
    minHeight: 720,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ------------------------------------------------------------------ */
/*  State helpers                                                     */
/* ------------------------------------------------------------------ */

function buildStatePayload() {
  const persisted = loadState();
  const library = scanLibrary(persisted);
  const compactIndex = buildCompactIndex(library);
  lastScanTime = Date.now();
  return {
    persisted,
    library,
    compactIndex,
    systemTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  };
}

function detectNewChapters(library) {
  const state = loadState();
  const known = state.knownChapterCounts || {};
  const updates = {};
  let hasNew = false;

  for (const manga of library.allMangas || []) {
    const prev = known[manga.id];
    if (typeof prev === 'number' && manga.chapterCount > prev) {
      hasNew = true;
    }
    updates[manga.id] = manga.chapterCount;
  }

  if (Object.keys(updates).length > 0) {
    updateState((s) => {
      s.knownChapterCounts = { ...s.knownChapterCounts, ...updates };
      return s;
    });
  }

  return hasNew;
}

/* ------------------------------------------------------------------ */
/*  Library watcher                                                   */
/* ------------------------------------------------------------------ */

function emitLibraryChanged() {
  if (!mainWindow) return;
  const payload = buildStatePayload();
  detectNewChapters(payload.library);
  mainWindow.webContents.send('library:changed', payload);
  mainWindow.webContents.send('library:compactIndexChanged', payload.compactIndex);
}

function restartWatchers() {
  const state = loadState();
  const paths = state.categories.map((category) => category.path);
  watcher.restart(paths, emitLibraryChanged);
}

/* ------------------------------------------------------------------ */
/*  App lifecycle                                                     */
/* ------------------------------------------------------------------ */

app.whenReady().then(() => {
  registerLocalAssetProtocol();
  createWindow();
  restartWatchers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    watcher.close();
    app.quit();
  }
});

/* ------------------------------------------------------------------ */
/*  Reading progress helper                                           */
/* ------------------------------------------------------------------ */

function persistReadingProgress(payload) {
  updateState((state) => {
    const { mangaId, chapterId, pageIndex, pageCount, mode } = payload;
    const now = new Date().toISOString();

    state.progress[chapterId] = {
      mangaId,
      chapterId,
      pageIndex,
      pageCount,
      mode,
      lastReadAt: now
    };

    // Auto-mark chapter as read based on threshold from UI settings
    const threshold = state.ui?.autoMarkReadThreshold ?? 95;
    if (typeof pageCount === 'number' && typeof pageIndex === 'number' && pageCount > 0) {
      const percent = ((pageIndex + 1) / pageCount) * 100;
      if (percent >= threshold) {
        state.chapterReadStatus[chapterId] = true;
      } else {
        delete state.chapterReadStatus[chapterId];
      }
    }

    state.recents = state.recents.filter((entry) => entry.chapterId !== chapterId);
    state.recents.unshift({
      mangaId,
      chapterId,
      pageIndex,
      lastReadAt: now
    });
    state.recents = state.recents.slice(0, 50);

    state.ui.readerMode = mode;
    return state;
  });
}

/* ================================================================== */
/*  IPC Handlers                                                      */
/* ================================================================== */

/* ---------- App ---------- */

ipcMain.handle('app:bootstrap', async () => {
  const payload = buildStatePayload();
  detectNewChapters(payload.library);
  return payload;
});

ipcMain.handle('app:getCompactIndex', async () => {
  const persisted = loadState();
  const library = scanLibrary(persisted);
  return buildCompactIndex(library);
});

/* ---------- Library management ---------- */

ipcMain.handle('library:addCategories', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir un ou plusieurs dossiers de catégories',
    properties: ['openDirectory', 'multiSelections']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return buildStatePayload();
  }

  updateState((state) => {
    for (const folderPath of result.filePaths) {
      const exists = state.categories.some((entry) => entry.path === folderPath);
      if (exists) continue;
      state.categories.push({
        id: makeId('category', folderPath),
        path: folderPath,
        name: path.basename(folderPath),
        hidden: false
      });
    }
    return state;
  });

  restartWatchers();
  return buildStatePayload();
});

ipcMain.handle('library:removeCategory', async (_event, categoryId) => {
  updateState((state) => {
    state.categories = state.categories.filter((entry) => entry.id !== categoryId);
    if (state.ui.selectedCategoryId === categoryId) {
      state.ui.selectedCategoryId = null;
    }
    return state;
  });
  restartWatchers();
  return buildStatePayload();
});

ipcMain.handle('library:trashManga', async (_event, mangaId) => {
  const payload = buildStatePayload();
  const manga = payload.library?.allMangas?.find((entry) => entry.id === mangaId);

  if (!manga?.path || !fs.existsSync(manga.path)) {
    return buildStatePayload();
  }

  try {
    if (typeof shell.trashItem === 'function') {
      await shell.trashItem(manga.path);
    } else if (typeof shell.moveItemToTrash === 'function') {
      shell.moveItemToTrash(manga.path);
    }
  } catch (error) {
    return { ...buildStatePayload(), error: error?.message || 'Unable to move manga to trash.' };
  }

  updateState((state) => {
    delete state.metadata[mangaId];
    delete state.favorites[mangaId];
    delete state.readStatus[mangaId];
    delete state.knownChapterCounts[mangaId];
    delete state.mangaTags[mangaId];

    // Remove from all collections
    for (const col of Object.values(state.collections)) {
      col.mangaIds = (col.mangaIds || []).filter((id) => id !== mangaId);
    }

    for (const chapter of manga.chapters || []) {
      delete state.progress[chapter.id];
      delete state.chapterReadStatus[chapter.id];
    }

    state.recents = state.recents.filter((entry) => entry.mangaId !== mangaId);
    return state;
  });

  restartWatchers();
  return buildStatePayload();
});

ipcMain.handle('library:toggleCategoryHidden', async (_event, categoryId) => {
  updateState((state) => {
    state.categories = state.categories.map((entry) =>
      entry.id === categoryId ? { ...entry, hidden: !entry.hidden } : entry
    );
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('library:getChapterPages', async (_event, chapterPath) => {
  try {
    return getChapterPages(chapterPath);
  } catch (error) {
    return [];
  }
});

ipcMain.handle('library:pickCover', async (_event, mangaId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir une couverture personnalisée',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return buildStatePayload();
  }

  const sourcePath = result.filePaths[0];
  const payload = buildStatePayload();
  const manga = payload.library?.allMangas?.find((entry) => entry.id === mangaId);
  let finalCoverPath = sourcePath;

  if (manga?.path && fs.existsSync(manga.path)) {
    const ext = (path.extname(sourcePath) || '.png').toLowerCase();
    const copiedCoverPath = path.join(manga.path, `.sawa-custom-cover${ext}`);

    try {
      for (const fileName of fs.readdirSync(manga.path)) {
        if (fileName.startsWith('.sawa-custom-cover')) {
          const stalePath = path.join(manga.path, fileName);
          if (stalePath !== copiedCoverPath) {
            try { fs.unlinkSync(stalePath); } catch (_) {}
          }
        }
      }
      fs.copyFileSync(sourcePath, copiedCoverPath);
      finalCoverPath = copiedCoverPath;
    } catch (error) {
      finalCoverPath = sourcePath;
    }
  }

  updateState((state) => {
    state.metadata[mangaId] = {
      ...(state.metadata[mangaId] || {}),
      coverPath: finalCoverPath
    };
    return state;
  });

  return buildStatePayload();
});

ipcMain.handle('library:updateMetadata', async (_event, mangaId, patch) => {
  updateState((state) => {
    state.metadata[mangaId] = {
      ...(state.metadata[mangaId] || {}),
      ...patch
    };
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('library:toggleFavorite', async (_event, mangaId) => {
  updateState((state) => {
    state.favorites[mangaId] = !state.favorites[mangaId];
    if (!state.favorites[mangaId]) {
      delete state.favorites[mangaId];
    }
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('library:forceRescan', async () => {
  restartWatchers();
  return buildStatePayload();
});

/* ---------- Reading ---------- */

ipcMain.handle('reading:updateProgress', async (_event, payload) => {
  persistReadingProgress(payload);
  return buildStatePayload();
});

ipcMain.handle('reading:updateProgressLight', async (_event, payload) => {
  persistReadingProgress(payload);
  return { ok: true };
});

ipcMain.handle('reading:setReadStatus', async (_event, mangaId, isRead, chapterIds = []) => {
  updateState((state) => {
    const ids = Array.isArray(chapterIds) ? chapterIds : [];
    if (ids.length > 0) {
      ids.forEach((chapterId) => {
        if (isRead) {
          state.chapterReadStatus[chapterId] = true;
        } else {
          delete state.chapterReadStatus[chapterId];
          if (state.progress[chapterId]) {
            state.progress[chapterId] = { ...state.progress[chapterId], pageIndex: 0 };
          }
        }
      });
    }
    if (isRead) {
      state.readStatus[mangaId] = true;
    } else {
      delete state.readStatus[mangaId];
    }
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('reading:setChapterReadStatus', async (_event, mangaId, chapterId, isRead, pageCount = 0) => {
  updateState((state) => {
    if (isRead) {
      state.chapterReadStatus[chapterId] = true;
      state.progress[chapterId] = {
        ...(state.progress[chapterId] || {}),
        mangaId,
        chapterId,
        pageIndex: Math.max(0, pageCount - 1),
        pageCount,
        lastReadAt: new Date().toISOString()
      };
    } else {
      delete state.chapterReadStatus[chapterId];
      if (state.progress[chapterId]) {
        state.progress[chapterId] = { ...state.progress[chapterId], pageIndex: 0, pageCount };
      }
    }
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('reading:resetProgress', async (_event, mangaId, chapterIds = []) => {
  updateState((state) => {
    const ids = Array.isArray(chapterIds) ? chapterIds : [];
    if (ids.length > 0) {
      ids.forEach((chapterId) => {
        delete state.progress[chapterId];
        delete state.chapterReadStatus[chapterId];
      });
    } else {
      for (const [chapterId, entry] of Object.entries(state.progress)) {
        if (entry?.mangaId === mangaId) {
          delete state.progress[chapterId];
          delete state.chapterReadStatus[chapterId];
        }
      }
    }
    state.recents = state.recents.filter((entry) => entry.mangaId !== mangaId);
    delete state.readStatus[mangaId];
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('reading:resetChapterProgress', async (_event, chapterId) => {
  updateState((state) => {
    delete state.progress[chapterId];
    delete state.chapterReadStatus[chapterId];
    state.recents = state.recents.filter((entry) => entry.chapterId !== chapterId);
    return state;
  });
  return buildStatePayload();
});

/* ---------- Tags ---------- */

ipcMain.handle('tags:create', async (_event, name, color) => {
  createTag(name, color);
  return buildStatePayload();
});

ipcMain.handle('tags:delete', async (_event, tagId) => {
  deleteTag(tagId);
  return buildStatePayload();
});

ipcMain.handle('tags:addToManga', async (_event, mangaId, tagId) => {
  addTagToManga(mangaId, tagId);
  return buildStatePayload();
});

ipcMain.handle('tags:removeFromManga', async (_event, mangaId, tagId) => {
  removeTagFromManga(mangaId, tagId);
  return buildStatePayload();
});

ipcMain.handle('tags:setForManga', async (_event, mangaId, tagIds) => {
  setMangaTags(mangaId, Array.isArray(tagIds) ? tagIds : []);
  return buildStatePayload();
});

ipcMain.handle('tags:toggleForManga', async (_event, mangaId, tagId) => {
  const state = loadState();
  const current = state.mangaTags?.[mangaId] || [];
  if (current.includes(tagId)) {
    removeTagFromManga(mangaId, tagId);
  } else {
    addTagToManga(mangaId, tagId);
  }
  return buildStatePayload();
});

/* ---------- Collections ---------- */

ipcMain.handle('collections:create', async (_event, name, description, color) => {
  createCollection(name, description, color);
  return buildStatePayload();
});

ipcMain.handle('collections:delete', async (_event, collectionId) => {
  deleteCollection(collectionId);
  return buildStatePayload();
});

ipcMain.handle('collections:update', async (_event, collectionId, patch) => {
  updateCollection(collectionId, patch);
  return buildStatePayload();
});

ipcMain.handle('collections:addManga', async (_event, collectionId, mangaId) => {
  addMangaToCollection(collectionId, mangaId);
  return buildStatePayload();
});

ipcMain.handle('collections:removeManga', async (_event, collectionId, mangaId) => {
  removeMangaFromCollection(collectionId, mangaId);
  return buildStatePayload();
});

/* ---------- Online Metadata ---------- */

async function remoteImageToDataUrl(url) {
  if (!url) return null;
  try {
    const response = await net.fetch(url, {
      headers: {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'Sawa Manga Library/2.0.0'
      }
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (_error) {
    return null;
  }
}

ipcMain.handle('metadata:searchOnline', async (_event, query) => {
  if (!query || !query.trim()) return { results: [] };
  try {
    const encoded = encodeURIComponent(query.trim());
    // Use MangaDex API (free, no auth required, comprehensive manga database)
    const response = await net.fetch(
      `https://api.mangadex.org/manga?title=${encoded}&limit=10&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&order[relevance]=desc`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return { results: [], error: `HTTP ${response.status}` };
    const json = await response.json();
    const rawResults = (json.data || []).map((item) => {
      const attr = item.attributes || {};
      const titleMap = attr.title || {};
      const title = titleMap.en || titleMap['ja-ro'] || titleMap.ja || Object.values(titleMap)[0] || 'Sans titre';

      const rawAltTitles = [
        ...Object.values(titleMap || {}),
        ...(attr.altTitles || []).flatMap((entry) => Object.values(entry || {}))
      ].filter(Boolean);

      const altTitles = [...new Map(
        rawAltTitles
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .filter((value) => value.toLowerCase() !== String(title || '').trim().toLowerCase())
          .map((value) => [value.toLowerCase(), value])
      ).values()];

      const titleJapanese = altTitles.find((value) => /[　-鿿豈-﫿]/.test(value)) || null;
      const descMap = attr.description || {};
      const synopsis = descMap.fr || descMap.en || Object.values(descMap)[0] || null;
      const authors = (item.relationships || [])
        .filter((r) => r.type === 'author' || r.type === 'artist')
        .map((r) => r.attributes?.name)
        .filter(Boolean);
      const uniqueAuthors = [...new Set(authors)].join(', ');
      const genres = (attr.tags || [])
        .filter((t) => t.attributes?.group === 'genre')
        .map((t) => t.attributes?.name?.en || Object.values(t.attributes?.name || {})[0])
        .filter(Boolean);
      const coverRel = (item.relationships || []).find((r) => r.type === 'cover_art');
      const coverFileName = coverRel?.attributes?.fileName || null;
      const coverDownloadUrl = coverFileName ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}` : null;
      const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.512.jpg` : null;
      const coverPreviewUrl = coverFileName ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.256.jpg` : coverUrl;
      return {
        malId: item.id,
        mangaDexId: item.id,
        title,
        titleJapanese,
        titleEnglish: titleMap.en || null,
        altTitles,
        synopsis,
        authors: uniqueAuthors,
        genres,
        coverUrl,
        coverDownloadUrl,
        coverPreviewUrl,
        score: attr.rating?.bayesian ? Math.round(attr.rating.bayesian * 10) / 10 : null,
        status: attr.status,
        chapters: attr.lastChapter ? parseInt(attr.lastChapter, 10) : null,
        volumes: attr.lastVolume ? parseInt(attr.lastVolume, 10) : null,
        year: attr.year,
        contentRating: attr.contentRating
      };
    });

    const results = await Promise.all(rawResults.map(async (item) => ({
      ...item,
      coverPreviewSrc: await remoteImageToDataUrl(item.coverPreviewUrl || item.coverUrl || item.coverDownloadUrl)
    })));

    return { results };
  } catch (error) {
    return { results: [], error: error?.message || 'Network error' };
  }
});

ipcMain.handle('metadata:importOnline', async (_event, mangaId, onlineData) => {
  const patch = {};
  if (onlineData.title) patch.onlineTitle = onlineData.title;
  if (onlineData.titleJapanese) patch.titleJapanese = onlineData.titleJapanese;
  if (onlineData.synopsis) patch.onlineDescription = onlineData.synopsis;
  if (onlineData.authors) patch.onlineAuthor = onlineData.authors;
  if (onlineData.genres) patch.onlineGenres = onlineData.genres;
  if (Array.isArray(onlineData.altTitles)) {
    patch.onlineAltTitles = [...new Map(
      onlineData.altTitles
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value])
    ).values()];
  }
  if (onlineData.malId) patch.malId = onlineData.malId;

  if (onlineData.coverDownloadUrl || onlineData.coverUrl) {
    try {
      const payload = buildStatePayload();
      const manga = payload.library?.allMangas?.find((m) => m.id === mangaId);
      if (manga?.path && fs.existsSync(manga.path)) {
        const remoteUrl = onlineData.coverDownloadUrl || onlineData.coverUrl;
        const response = await net.fetch(remoteUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const ext = (path.extname(remoteUrl) || '.jpg').toLowerCase() || '.jpg';
          const coverPath = path.join(manga.path, `.sawa-online-cover${ext}`);
          fs.writeFileSync(coverPath, buffer);
          patch.onlineCoverPath = coverPath;
        }
      }
    } catch (_) {
      // Cover download failed silently
    }
  }

  updateState((state) => {
    state.metadata[mangaId] = {
      ...(state.metadata[mangaId] || {}),
      ...patch,
      onlineImportedAt: new Date().toISOString()
    };
    return state;
  });

  // Auto-import MangaDex genres as tags and assign them to the manga
  if (Array.isArray(onlineData.genres) && onlineData.genres.length > 0) {
    const GENRE_COLORS = [
      '#ef4444', '#f97316', '#eab308', '#22c55e',
      '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
      '#6366f1', '#f43f5e', '#0ea5e9', '#84cc16',
    ];
    const state = loadState();
    const existingTags = Object.values(state.tags || {});

    for (const genre of onlineData.genres) {
      const genreName = genre.trim();
      if (!genreName) continue;

      // Check if a tag with the same name already exists (case-insensitive)
      let existingTag = existingTags.find((t) => t.name.toLowerCase() === genreName.toLowerCase());

      if (!existingTag) {
        // Create the tag with a deterministic color based on the genre name
        let hash = 0;
        for (let i = 0; i < genreName.length; i++) { hash = ((hash << 5) - hash) + genreName.charCodeAt(i); hash |= 0; }
        const color = GENRE_COLORS[Math.abs(hash) % GENRE_COLORS.length];
        createTag(genreName, color);
        // Re-read state to get the newly created tag
        const updated = loadState();
        existingTag = Object.values(updated.tags || {}).find((t) => t.name.toLowerCase() === genreName.toLowerCase());
      }

      if (existingTag) {
        addTagToManga(mangaId, existingTag.id);
      }
    }
  }

  return buildStatePayload();
});

/* ---------- Backup ---------- */

ipcMain.handle('backup:create', async (_event, label) => {
  const result = createBackup(label);
  return { ...buildStatePayload(), backup: result };
});

ipcMain.handle('backup:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer une sauvegarde Sawa',
    properties: ['openFile'],
    filters: [
      { name: 'Sawa Backup', extensions: ['sawa', 'json'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { restored: false };
  }

  try {
    const importResult = importBackup(result.filePaths[0]);
    restartWatchers();
    return { ...buildStatePayload(), ...importResult };
  } catch (error) {
    return { restored: false, error: error?.message || 'Import failed' };
  }
});

ipcMain.handle('backup:list', async () => {
  return listBackups();
});

ipcMain.handle('backup:export', async () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultName = `sawa-backup-${timestamp}.sawa`;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter la sauvegarde Sawa',
    defaultPath: defaultName,
    filters: [
      { name: 'Sawa Backup', extensions: ['sawa'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { exported: false };
  }

  try {
    // Export the current state file directly
    const stateData = loadState();
    fs.writeFileSync(result.filePath, JSON.stringify(stateData, null, 2), 'utf-8');
    return { exported: true, path: result.filePath };
  } catch (error) {
    return { exported: false, error: error?.message || 'Export failed' };
  }
});

/* ---------- UI / Session ---------- */

ipcMain.handle('ui:updateSettings', async (_event, patch) => {
  updateState((state) => {
    state.ui = {
      ...state.ui,
      ...patch
    };
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('ui:pickBackgroundImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir une image de fond',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return buildStatePayload();
  }

  const sourcePath = result.filePaths[0];
  const udp = getUserDataPath();
  const ext = (path.extname(sourcePath) || '.jpg').toLowerCase();
  const destPath = path.join(udp, `sawa-background${ext}`);

  // Remove any previous background image
  try {
    for (const f of fs.readdirSync(udp)) {
      if (f.startsWith('sawa-background')) {
        const fp = path.join(udp, f);
        if (fp !== destPath) try { fs.unlinkSync(fp); } catch (_) {}
      }
    }
  } catch (_) {}

  try {
    fs.copyFileSync(sourcePath, destPath);
  } catch (_) {
    // Fall back to source path
  }

  const finalPath = fs.existsSync(destPath) ? destPath : sourcePath;

  // Read a small version of the image to extract dominant colors
  let extractedColors = null;
  try {
    const imgBuffer = fs.readFileSync(finalPath);
    extractedColors = extractDominantColors(imgBuffer);
  } catch (_) {}

  updateState((state) => {
    state.ui = {
      ...state.ui,
      backgroundImage: finalPath,
      backgroundOpacity: state.ui.backgroundOpacity ?? 0.15,
    };
    if (extractedColors) {
      state.ui.backgroundAccent = extractedColors.accent;
      state.ui.backgroundAccentAlt = extractedColors.accentAlt;
    }
    return state;
  });

  return buildStatePayload();
});

ipcMain.handle('ui:removeBackgroundImage', async () => {
  const udp = getUserDataPath();
  try {
    for (const f of fs.readdirSync(udp)) {
      if (f.startsWith('sawa-background')) {
        try { fs.unlinkSync(path.join(udp, f)); } catch (_) {}
      }
    }
  } catch (_) {}

  updateState((state) => {
    delete state.ui.backgroundImage;
    delete state.ui.backgroundOpacity;
    delete state.ui.backgroundAccent;
    delete state.ui.backgroundAccentAlt;
    return state;
  });

  return buildStatePayload();
});

ipcMain.handle('session:saveTabs', async (_event, payload) => {
  updateState((state) => {
    state.session = {
      tabs: Array.isArray(payload?.tabs) ? payload.tabs : [],
      activeTabId: payload?.activeTabId ?? null
    };
    return state;
  });
  return true;
});

/* ---------- Window ---------- */

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:toggleFullScreen', () => {
  if (!mainWindow) return false;
  const nextValue = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(nextValue);
  return nextValue;
});

/* ---------- Maintenance ---------- */

ipcMain.handle('maintenance:clearCache', async () => {
  const thumbDir = getThumbnailDir();
  try {
    if (fs.existsSync(thumbDir)) {
      const files = fs.readdirSync(thumbDir);
      for (const file of files) {
        try { fs.unlinkSync(path.join(thumbDir, file)); } catch (_) {}
      }
    }
    return { ok: true, cleared: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to clear cache' };
  }
});

ipcMain.handle('maintenance:rebuildIndex', async () => {
  restartWatchers();
  return buildStatePayload();
});

ipcMain.handle('maintenance:getStats', async () => {
  const state = loadState();
  const memUsage = process.memoryUsage();
  return {
    uptime: process.uptime(),
    lastScanTime,
    memoryUsage: {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss
    },
    counts: {
      categories: state.categories.length,
      favorites: Object.keys(state.favorites).length,
      tags: Object.keys(state.tags).length,
      collections: Object.keys(state.collections).length,
      progressEntries: Object.keys(state.progress).length,
      metadataEntries: Object.keys(state.metadata).length,
      recents: state.recents.length
    }
  };
});
