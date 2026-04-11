/**
 * Sawa Manga Library v3.0.0 - Electron Main Process
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
  safeStorage,
  shell
} = require('electron');
const { pathToFileURL } = require('url');

const {
  loadState,
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
  buildCompactIndex,
  isPdfFile,
  isCbzFile
} = require('./services/libraryScanner.cjs');

const { LibraryWatcher } = require('./services/watcher.cjs');
const {
  createCbzAssetResponse,
  clearCbzCache,
  loadComicInfoForSource
} = require('./services/archive.cjs');

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
let splashWindow = null;
let splashFailSafeTimer = null;
const watcher = new LibraryWatcher();
let lastScanTime = 0;
let pdfMetaSyncPromise = null;
let pdfMetaResyncRequested = false;
let pdfMetaNeedsRefresh = false;
let libraryEmitInFlight = false;
let libraryEmitQueued = false;

let pdfJsModulePromise = null;

async function loadPdfJsModule() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfJsModulePromise;
}

async function readPdfPageCount(pdfPath) {
  const pdfjs = await loadPdfJsModule();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
    verbosity: 0
  });

  try {
    const document = await loadingTask.promise;
    return Number(document?.numPages || 0);
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}


function collectPdfFilesFromState(state) {
  const files = [];
  for (const category of state?.categories || []) {
    if (!category?.path || !fs.existsSync(category.path)) continue;
    const mangaEntries = fs.readdirSync(category.path, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const mangaEntry of mangaEntries) {
      const mangaPath = path.join(category.path, mangaEntry.name);
      const chapterEntries = fs.readdirSync(mangaPath, { withFileTypes: true });
      for (const entry of chapterEntries) {
        if (entry.isFile() && isPdfFile(entry.name)) {
          files.push(path.join(mangaPath, entry.name));
        }
      }
    }
  }
  return files;
}

async function syncPdfMetaCache() {
  const state = loadState();
  const nextPdfMeta = { ...(state.pdfMeta || {}) };
  const knownFiles = new Set(collectPdfFilesFromState(state));
  let changed = false;

  for (const filePath of knownFiles) {
    let stats = null;
    try {
      stats = fs.statSync(filePath);
    } catch (error) {
      continue;
    }

    const mtimeMs = Number(stats?.mtimeMs || 0);
    const cached = nextPdfMeta[filePath];
    if (cached?.pageCount > 0 && Number(cached?.mtimeMs || 0) === mtimeMs) {
      continue;
    }

    try {
      const pageCount = await readPdfPageCount(filePath);
      if (pageCount > 0) {
        nextPdfMeta[filePath] = {
          ...(cached || {}),
          pageCount,
          mtimeMs,
          validatedAt: new Date().toISOString()
        };
        changed = true;
      }
    } catch (error) {
      // Ignore invalid PDFs without blocking the library load.
    }
  }

  for (const cachedPath of Object.keys(nextPdfMeta)) {
    if (!knownFiles.has(cachedPath)) {
      delete nextPdfMeta[cachedPath];
      changed = true;
    }
  }

  if (changed) {
    updateState((draft) => {
      draft.pdfMeta = nextPdfMeta;
      return draft;
    });
  }

  return changed;
}

function emitLibraryPayload(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('library:changed', payload);
  mainWindow.webContents.send('library:compactIndexChanged', payload.compactIndex);
}

function requestPdfMetaSync(options = {}) {
  if (options.refreshLibraryAfterSync) {
    pdfMetaNeedsRefresh = true;
  }

  if (pdfMetaSyncPromise) {
    pdfMetaResyncRequested = true;
    return pdfMetaSyncPromise;
  }

  pdfMetaSyncPromise = (async () => {
    let hasChanges = false;
    do {
      pdfMetaResyncRequested = false;
      const changed = await syncPdfMetaCache();
      if (changed) hasChanges = true;
    } while (pdfMetaResyncRequested);
    return hasChanges;
  })()
    .catch(() => false)
    .then((hasChanges) => {
      if (hasChanges && pdfMetaNeedsRefresh && mainWindow && !mainWindow.isDestroyed()) {
        const payload = buildStatePayload();
        detectNewChapters(payload.library);
        emitLibraryPayload(payload);
      }
      return hasChanges;
    })
    .finally(() => {
      pdfMetaSyncPromise = null;
      pdfMetaNeedsRefresh = false;
    });

  return pdfMetaSyncPromise;
}

/* ------------------------------------------------------------------ */
/*  Protocol - manga://local/<encoded-path>                                  */
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
      if (url.hostname === 'local') {
        const encodedPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        const filePath = decodeURIComponent(encodedPath);
        return net.fetch(pathToFileURL(filePath).toString());
      }

      if (url.hostname === 'cbz') {
        const encodedPath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        const archivePath = decodeURIComponent(encodedPath);
        const entryName = url.searchParams.get('entry');
        if (!archivePath || !entryName) {
          return new Response('Missing CBZ asset parameters', { status: 400 });
        }
        return createCbzAssetResponse(archivePath, entryName);
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      return new Response('Unable to load local asset', { status: 500 });
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Window                                                            */
/* ------------------------------------------------------------------ */

function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) return;

  splashWindow = new BrowserWindow({
    width: 440,
    height: 260,
    show: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#0a1020',
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  const splashHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          :root { color-scheme: dark; }
          html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0a1020; font-family: "Segoe UI", system-ui, sans-serif; }
          .shell {
            width: 100%;
            height: 100%;
            display: grid;
            place-items: center;
            background:
              radial-gradient(130% 100% at 15% 8%, rgba(96, 165, 250, 0.25), transparent 60%),
              radial-gradient(120% 110% at 85% 90%, rgba(244, 114, 182, 0.22), transparent 62%),
              #0a1020;
            color: #dbe5f8;
          }
          .card {
            display: grid;
            gap: 14px;
            place-items: center;
            width: 280px;
          }
          .logo {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          .spinner {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.18);
            border-top-color: #7dd3fc;
            animation: spin 0.7s linear infinite;
          }
          .label {
            font-size: 13px;
            color: rgba(219, 229, 248, 0.75);
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="card">
            <div class="logo">Sawa</div>
            <div class="spinner"></div>
            <div class="label">Chargement rapide…</div>
          </div>
        </div>
      </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function ensureMainWindowVisible() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) return;
  try {
    mainWindow.maximize();
    mainWindow.show();
  } catch (_error) {
    // Best effort only.
  }
}

function scheduleSplashFailSafeClose(delayMs = 10000) {
  if (splashFailSafeTimer) {
    clearTimeout(splashFailSafeTimer);
  }
  splashFailSafeTimer = setTimeout(() => {
    ensureMainWindowVisible();
    closeSplashWindow();
  }, delayMs);
}

function closeSplashWindow() {
  if (splashFailSafeTimer) {
    clearTimeout(splashFailSafeTimer);
    splashFailSafeTimer = null;
  }
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null;
    return;
  }
  try {
    if (typeof splashWindow.setClosable === 'function') {
      splashWindow.setClosable(true);
    }
    splashWindow.destroy();
  } catch (_error) {
    try {
      splashWindow.close();
    } catch (_) {
      // noop
    }
  }
  splashWindow = null;
}

function createWindow() {
  createSplashWindow();
  scheduleSplashFailSafeClose(10000);

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

  mainWindow.webContents.once('did-finish-load', () => {
    ensureMainWindowVisible();
    setTimeout(() => closeSplashWindow(), 40);
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow) return;
    ensureMainWindowVisible();
    setTimeout(() => closeSplashWindow(), 60);
  });

  mainWindow.webContents.on('did-fail-load', () => {
    closeSplashWindow();
  });

  mainWindow.on('close', () => {
    persistVaultLock();
  });

  mainWindow.on('closed', () => {
    closeSplashWindow();
    mainWindow = null;
  });
}

/* ------------------------------------------------------------------ */
/*  State helpers                                                     */
/* ------------------------------------------------------------------ */

function getNsfwOnlyTagIds(state) {
  const usageByTagId = new Map();
  const mangaTags = state?.mangaTags || {};
  const mangaTagMeta = state?.mangaTagMeta || {};

  for (const [mangaId, tagIds] of Object.entries(mangaTags)) {
    const metaForManga = mangaTagMeta[mangaId] || {};
    for (const tagId of Array.isArray(tagIds) ? tagIds : []) {
      if (!state?.tags?.[tagId]) continue;
      const entry = usageByTagId.get(tagId) || { nsfw: 0, safe: 0 };
      if (metaForManga?.[tagId]?.nsfw) entry.nsfw += 1;
      else entry.safe += 1;
      usageByTagId.set(tagId, entry);
    }
  }

  const hidden = new Set();
  for (const [tagId, usage] of usageByTagId.entries()) {
    if (usage.nsfw > 0 && usage.safe === 0) hidden.add(tagId);
  }
  return hidden;
}

function getPrivateMangaIdSet(state) {
  return new Set(
    (Array.isArray(state?.vault?.privateMangaIds) ? state.vault.privateMangaIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
}

function getPrivateCategoryIdSet(state) {
  return new Set(
    (Array.isArray(state?.vault?.privateCategoryIds) ? state.vault.privateCategoryIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
}

function isVaultConfigured(state) {
  return Boolean(state?.vault?.pinProtectedBlob || state?.vault?.pinHash);
}

function isVaultLocked(state) {
  return isVaultConfigured(state) && Boolean(state?.vault?.locked);
}

function isSystemVaultProtectionAvailable() {
  return process.platform === 'win32'
    && Boolean(safeStorage)
    && typeof safeStorage.isEncryptionAvailable === 'function'
    && safeStorage.isEncryptionAvailable();
}

function getVaultSecurityMode(state) {
  if (state?.vault?.pinProtectedBlob) return 'system';
  if (state?.vault?.pinHash) return 'basic';
  return 'none';
}

function buildProtectedPinBlob(pin) {
  if (!isSystemVaultProtectionAvailable()) return null;
  const normalizedPin = normalizePinInput(pin);
  if (!normalizedPin) return null;
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(normalizedPin, salt, 32).toString('hex');
  return safeStorage.encryptString(JSON.stringify({ version: 1, salt, hash })).toString('base64');
}

function verifyProtectedPinBlob(pin, pinProtectedBlob) {
  if (!pinProtectedBlob || !isSystemVaultProtectionAvailable()) return false;
  try {
    const decrypted = safeStorage.decryptString(Buffer.from(String(pinProtectedBlob), 'base64'));
    const parsed = JSON.parse(decrypted);
    if (!parsed?.salt || !parsed?.hash) return false;
    const nextHash = crypto.scryptSync(normalizePinInput(pin), parsed.salt, 32).toString('hex');
    return nextHash === parsed.hash;
  } catch (_error) {
    return false;
  }
}

function buildVaultPrivacyModel(library, state) {
  const existingMangaMap = new Map();
  for (const manga of library?.allMangas || []) {
    if (manga?.id) existingMangaMap.set(manga.id, manga.id);
    if (manga?.contentId) existingMangaMap.set(manga.contentId, manga.id);
    if (manga?.locationId) existingMangaMap.set(manga.locationId, manga.id);
  }
  const directPrivateIds = new Set(
    [...getPrivateMangaIdSet(state)]
      .map((mangaId) => existingMangaMap.get(mangaId) || null)
      .filter(Boolean)
  );
  const privateCategoryIds = getPrivateCategoryIdSet(state);
  const categoryPrivateIds = new Set();

  for (const category of library?.categories || []) {
    if (!privateCategoryIds.has(category.id)) continue;
    for (const manga of category.mangas || []) {
      if (manga?.id) categoryPrivateIds.add(manga.id);
    }
  }

  return {
    directPrivateIds,
    privateCategoryIds,
    categoryPrivateIds,
    allPrivateIds: new Set([...directPrivateIds, ...categoryPrivateIds])
  };
}

function applyVaultVisibilityToLibrary(library, state, privacyModel) {
  const { directPrivateIds, privateCategoryIds, categoryPrivateIds, allPrivateIds } = privacyModel || buildVaultPrivacyModel(library, state);
  const hideDirectPrivate = isVaultLocked(state) || Boolean(state?.vault?.stealthMode);
  const idsHiddenFromLibrary = hideDirectPrivate ? allPrivateIds : categoryPrivateIds;
  const withPrivacy = (manga, forcedPrivate = null) => ({
    ...manga,
    isPrivate: forcedPrivate === null ? allPrivateIds.has(manga.id) : Boolean(forcedPrivate)
  });

  const visibleCategories = (library.categories || [])
    .filter((category) => !privateCategoryIds.has(category.id))
    .map((category) => {
      const mangas = (category.mangas || [])
        .filter((manga) => !idsHiddenFromLibrary.has(manga.id))
        .map((manga) => withPrivacy(manga, hideDirectPrivate ? false : null));
      return {
        ...category,
        mangas,
        mangaCount: mangas.length
      };
    });

  const visibleMangas = (library.allMangas || [])
    .filter((manga) => !idsHiddenFromLibrary.has(manga.id))
    .map((manga) => withPrivacy(manga, hideDirectPrivate ? false : null));
  const visibleMap = new Map(visibleMangas.map((manga) => [manga.id, manga]));

  return {
    ...library,
    allMangas: visibleMangas,
    favorites: (library.favorites || [])
      .filter((manga) => !idsHiddenFromLibrary.has(manga.id))
      .map((manga) => visibleMap.get(manga.id) || withPrivacy(manga, hideDirectPrivate ? false : null)),
    recents: (library.recents || [])
      .filter((entry) => !idsHiddenFromLibrary.has(entry.mangaId))
      .map((entry) => ({
        ...entry,
        isPrivate: hideDirectPrivate ? false : directPrivateIds.has(entry.mangaId)
      })),
    categories: visibleCategories
  };
}

function buildVaultLibrary(library, state, privacyModel) {
  const { privateCategoryIds, allPrivateIds } = privacyModel || buildVaultPrivacyModel(library, state);
  if (isVaultLocked(state) || allPrivateIds.size === 0) {
    return { categories: [], allMangas: [], favorites: [], recents: [] };
  }

  const privateMangas = (library.allMangas || [])
    .filter((manga) => allPrivateIds.has(manga.id))
    .map((manga) => ({ ...manga, isPrivate: true }));
  const privateMap = new Map(privateMangas.map((manga) => [manga.id, manga]));

  return {
    categories: (library.categories || [])
      .filter((category) => privateCategoryIds.has(category.id))
      .map((category) => {
        const mangas = (category.mangas || [])
          .filter((manga) => allPrivateIds.has(manga.id))
          .map((manga) => privateMap.get(manga.id) || { ...manga, isPrivate: true });
        return {
          ...category,
          isVaulted: true,
          mangas,
          mangaCount: mangas.length
        };
      }),
    allMangas: privateMangas,
    favorites: (library.favorites || [])
      .filter((manga) => allPrivateIds.has(manga.id))
      .map((manga) => privateMap.get(manga.id) || { ...manga, isPrivate: true }),
    recents: (library.recents || [])
      .filter((entry) => allPrivateIds.has(entry.mangaId))
      .map((entry) => ({ ...entry, isPrivate: true }))
  };
}

function persistVaultLock() {
  const current = loadState();
  if (!isVaultConfigured(current) || current?.vault?.locked) {
    return current;
  }
  return updateState((state) => {
    state.vault = state.vault || {};
    state.vault.autoLockOnClose = true;
    state.vault.locked = true;
    return state;
  });
}

function stripPrivateContentFromPersistedState(state, existingLibrary) {
  const library = existingLibrary || scanLibrary(state);
  const { privateCategoryIds, allPrivateIds } = buildVaultPrivacyModel(library, state);
  const clientState = structuredClone(state);
  const locked = isVaultLocked(state);
  const stealthMode = Boolean(state?.vault?.stealthMode);
  const effectiveHidePrivate = locked || stealthMode;

  clientState.vault = {
    configured: isVaultConfigured(state),
    locked,
    blurCovers: Boolean(state?.vault?.blurCovers),
    stealthMode,
    autoLockOnClose: true,
    privateCount: allPrivateIds.size,
    privateCategoryCount: privateCategoryIds.size,
    privateMangaIds: effectiveHidePrivate ? [] : [...allPrivateIds],
    privateCategoryIds: effectiveHidePrivate ? [] : [...privateCategoryIds],
    securityMode: getVaultSecurityMode(state),
    systemProtectionAvailable: isSystemVaultProtectionAvailable()
  };

  if (!effectiveHidePrivate || allPrivateIds.size === 0) return clientState;

  for (const mangaId of allPrivateIds) {
    delete clientState.metadata?.[mangaId];
    delete clientState.favorites?.[mangaId];
    delete clientState.readStatus?.[mangaId];
    delete clientState.mangaTags?.[mangaId];
    delete clientState.mangaTagMeta?.[mangaId];
    delete clientState.annotations?.[mangaId];
  }

  for (const collection of Object.values(clientState.collections || {})) {
    collection.mangaIds = (collection.mangaIds || []).filter((mangaId) => !allPrivateIds.has(mangaId));
  }

  clientState.categories = (clientState.categories || []).filter((category) => !privateCategoryIds.has(category.id));
  clientState.recents = (clientState.recents || []).filter((entry) => !allPrivateIds.has(entry.mangaId));
  clientState.metadataWorkbenchQueue = (clientState.metadataWorkbenchQueue || []).filter((mangaId) => !allPrivateIds.has(mangaId));
  clientState.readingQueue = (clientState.readingQueue || []).filter((item) => !allPrivateIds.has(item.mangaId));
  if (privateCategoryIds.has(clientState?.ui?.selectedCategoryId)) {
    clientState.ui.selectedCategoryId = null;
  }
  return clientState;
}

function buildClientPersistedState(state, rawLibrary) {
  const privateSafeState = stripPrivateContentFromPersistedState(state, rawLibrary);
  if (privateSafeState?.ui?.allowNsfwSources) return privateSafeState;

  const hiddenTagIds = getNsfwOnlyTagIds(privateSafeState);
  if (hiddenTagIds.size === 0) return privateSafeState;

  const clientState = structuredClone(privateSafeState);
  for (const tagId of hiddenTagIds) {
    delete clientState.tags[tagId];
  }

  for (const mangaId of Object.keys(clientState.mangaTags || {})) {
    clientState.mangaTags[mangaId] = (clientState.mangaTags[mangaId] || []).filter((tagId) => !hiddenTagIds.has(tagId));
    if (clientState.mangaTags[mangaId].length === 0) delete clientState.mangaTags[mangaId];
  }

  for (const mangaId of Object.keys(clientState.mangaTagMeta || {})) {
    for (const tagId of Object.keys(clientState.mangaTagMeta[mangaId] || {})) {
      if (hiddenTagIds.has(tagId)) delete clientState.mangaTagMeta[mangaId][tagId];
    }
    if (Object.keys(clientState.mangaTagMeta[mangaId]).length === 0) delete clientState.mangaTagMeta[mangaId];
  }

  return clientState;
}

function buildStatePayload() {
  let persisted = loadState();
  let rawLibrary = scanLibrary(persisted);
  const reconciliation = reconcilePersistedStateWithLibrary(persisted, rawLibrary);
  if (reconciliation.changed) {
    persisted = reconciliation.persisted;
  } else {
    const currentScanEntries = JSON.stringify(persisted?.scanIndex?.entries || []);
    const nextScanEntries = JSON.stringify(rawLibrary?.scanIndex?.entries || []);
    if (currentScanEntries !== nextScanEntries) {
      persisted = updateState((state) => {
        state.scanIndex = rawLibrary.scanIndex;
        return state;
      });
    }
  }
  const privacyModel = buildVaultPrivacyModel(rawLibrary, persisted);
  const library = applyVaultVisibilityToLibrary(rawLibrary, persisted, privacyModel);
  const vaultLibrary = buildVaultLibrary(rawLibrary, persisted, privacyModel);
  const compactIndex = buildCompactIndex(library);
  lastScanTime = Date.now();
  return {
    persisted: buildClientPersistedState(persisted, rawLibrary),
    library,
    vaultLibrary,
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

async function emitLibraryChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (libraryEmitInFlight) {
    libraryEmitQueued = true;
    return;
  }

  libraryEmitInFlight = true;
  try {
    do {
      libraryEmitQueued = false;
      const payload = buildStatePayload();
      detectNewChapters(payload.library);
      emitLibraryPayload(payload);
      requestPdfMetaSync({ refreshLibraryAfterSync: true });
      await new Promise((resolve) => setTimeout(resolve, 0));
    } while (libraryEmitQueued);
  } finally {
    libraryEmitInFlight = false;
  }
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
  requestPdfMetaSync({ refreshLibraryAfterSync: true });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      requestPdfMetaSync({ refreshLibraryAfterSync: true });
    }
  });
});

app.on('before-quit', () => {
  persistVaultLock();
  closeSplashWindow();
});

app.on('window-all-closed', () => {
  closeSplashWindow();
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
    const { mangaId, chapterId, pageIndex, pageCount, mode, fitMode, zoom, scrollTop, scrollRatio } = payload;
    const now = new Date().toISOString();

    state.progress[chapterId] = {
      mangaId,
      chapterId,
      pageIndex,
      pageCount,
      mode,
      fitMode,
      zoom,
      scrollTop,
      scrollRatio,
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
    if (fitMode) state.ui.readerFit = fitMode;
    if (Number.isFinite(Number(zoom))) state.ui.readerZoom = Number(zoom);
    return state;
  });
}

function makeLocalId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePinInput(pin) {
  return String(pin || '').trim().replace(/\s+/g, '');
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(normalizePinInput(pin)).digest('hex');
}

const QUEUE_SOURCE_PRIORITY = ['manual', 'quick-add', 'end-of-chapter', 'next-engine'];
const METADATA_SOURCE_WEIGHT = {
  'manual-locked': 5,
  manual: 4,
  comicinfo: 3,
  online: 2,
  scanner: 1
};

function normalizeQueueSource(source) {
  const normalized = String(source || '').trim();
  return QUEUE_SOURCE_PRIORITY.includes(normalized) ? normalized : 'manual';
}

function getQueueDisplaySource(sources = []) {
  const normalizedSources = [...new Set((Array.isArray(sources) ? sources : []).map(normalizeQueueSource))];
  return QUEUE_SOURCE_PRIORITY.find((source) => normalizedSources.includes(source)) || 'manual';
}

function applyMetadataField(state, mangaId, field, nextValue, source) {
  const metadata = state.metadata?.[mangaId] || {};
  const locks = state.metadataLocks?.[mangaId] || {};
  const fieldSources = state.metadataFieldSource?.[mangaId] || {};
  const currentSource = String(fieldSources[field] || '').trim();
  const currentValue = metadata[field];
  const hasCurrentValue = Array.isArray(currentValue) ? currentValue.length > 0 : String(currentValue || '').trim().length > 0;
  const normalizedSource = String(source || 'manual').trim();
  const nextWeight = METADATA_SOURCE_WEIGHT[locks[field] ? 'manual-locked' : normalizedSource] ?? 0;
  const currentWeight = METADATA_SOURCE_WEIGHT[locks[field] ? 'manual-locked' : currentSource] ?? 0;

  if (locks[field] && normalizedSource !== 'manual') return false;
  if (hasCurrentValue && normalizedSource !== 'manual' && currentWeight > nextWeight) return false;
  if (hasCurrentValue && normalizedSource !== 'manual' && currentWeight === nextWeight) return false;

  state.metadata[mangaId] = {
    ...(state.metadata[mangaId] || {}),
    [field]: nextValue
  };
  state.metadataFieldSource[mangaId] = {
    ...(state.metadataFieldSource[mangaId] || {}),
    [field]: normalizedSource
  };
  return true;
}

function findMangaByReference(library, reference) {
  const normalized = String(reference || '').trim();
  if (!normalized) return null;
  return (library?.allMangas || []).find((manga) =>
    manga.id === normalized
    || manga.contentId === normalized
    || manga.locationId === normalized
  ) || null;
}

function findChapterByReference(library, reference) {
  const normalized = String(reference || '').trim();
  if (!normalized) return { manga: null, chapter: null };
  for (const manga of library?.allMangas || []) {
    const chapter = (manga.chapters || []).find((entry) =>
      entry.id === normalized
      || entry.contentId === normalized
      || entry.locationId === normalized
    );
    if (chapter) return { manga, chapter };
  }
  return { manga: null, chapter: null };
}

function moveKeyedEntry(record, fromKey, toKey, transformValue = (value) => value) {
  if (!record || typeof record !== 'object' || !fromKey || !toKey || fromKey === toKey) return false;
  if (!(fromKey in record)) return false;
  if (!(toKey in record)) {
    record[toKey] = transformValue(record[fromKey]);
  }
  delete record[fromKey];
  return true;
}

function remapValue(value, fromId, toId) {
  return String(value || '').trim() === fromId ? toId : value;
}

function remapSessionIdentifiers(state, mangaIdMap, chapterIdMap) {
  if (!state?.session || typeof state.session !== 'object') return false;
  let changed = false;

  const remapView = (view) => {
    if (!view || typeof view !== 'object') return view;
    const nextView = { ...view };
    if (nextView.mangaId && mangaIdMap.has(nextView.mangaId)) {
      nextView.mangaId = mangaIdMap.get(nextView.mangaId);
      changed = true;
    }
    if (nextView.chapterId && chapterIdMap.has(nextView.chapterId)) {
      nextView.chapterId = chapterIdMap.get(nextView.chapterId);
      changed = true;
    }
    return nextView;
  };

  const remapTab = (tab) => {
    if (!tab || typeof tab !== 'object') return tab;
    const nextTab = { ...tab };
    if (nextTab.view) nextTab.view = remapView(nextTab.view);
    return nextTab;
  };

  if (Array.isArray(state.session.workspaces)) {
    state.session.workspaces = state.session.workspaces.map((workspace) => ({
      ...workspace,
      tabs: Array.isArray(workspace.tabs) ? workspace.tabs.map(remapTab) : []
    }));
  }

  if (Array.isArray(state.session.tabs)) {
    state.session.tabs = state.session.tabs.map(remapTab);
  }

  return changed;
}

function reconcilePersistedStateWithLibrary(persisted, rawLibrary) {
  const previousEntries = Array.isArray(persisted?.scanIndex?.entries) ? persisted.scanIndex.entries : [];
  const nextEntries = Array.isArray(rawLibrary?.scanIndex?.entries) ? rawLibrary.scanIndex.entries : [];
  if (previousEntries.length === 0 || nextEntries.length === 0) {
    return { changed: false, persisted };
  }

  const previousByContentId = new Map(previousEntries.filter((entry) => entry?.contentId).map((entry) => [entry.contentId, entry]));
  const mangaIdMap = new Map();
  const chapterIdMap = new Map();

  for (const entry of nextEntries) {
    const previous = previousByContentId.get(entry?.contentId);
    if (!previous || !previous.legacyId || !entry?.legacyId || previous.legacyId === entry.legacyId) continue;
    if (entry.type === 'manga') mangaIdMap.set(previous.legacyId, entry.legacyId);
    if (entry.type === 'chapter') chapterIdMap.set(previous.legacyId, entry.legacyId);
  }

  if (mangaIdMap.size === 0 && chapterIdMap.size === 0) {
    return { changed: false, persisted };
  }

  const nextState = updateState((state) => {
    for (const [fromId, toId] of mangaIdMap.entries()) {
      moveKeyedEntry(state.metadata, fromId, toId);
      moveKeyedEntry(state.favorites, fromId, toId);
      moveKeyedEntry(state.readStatus, fromId, toId);
      moveKeyedEntry(state.knownChapterCounts, fromId, toId);
      moveKeyedEntry(state.mangaTags, fromId, toId);
      moveKeyedEntry(state.mangaTagMeta, fromId, toId);
      moveKeyedEntry(state.annotations, fromId, toId, (value) =>
        Array.isArray(value)
          ? value.map((item) => ({ ...item, mangaId: toId }))
          : value
      );
      moveKeyedEntry(state.metadataLocks, fromId, toId);
      moveKeyedEntry(state.metadataFieldSource, fromId, toId);

      state.recents = (state.recents || []).map((entry) => ({
        ...entry,
        mangaId: remapValue(entry.mangaId, fromId, toId)
      }));
      state.metadataWorkbenchQueue = (state.metadataWorkbenchQueue || []).map((value) => remapValue(value, fromId, toId));
      state.vault.privateMangaIds = (state.vault?.privateMangaIds || []).map((value) => remapValue(value, fromId, toId));
      state.readingQueue = (state.readingQueue || []).map((item) => ({
        ...item,
        mangaId: remapValue(item.mangaId, fromId, toId)
      }));

      for (const progressEntry of Object.values(state.progress || {})) {
        if (progressEntry?.mangaId === fromId) progressEntry.mangaId = toId;
      }

      for (const collection of Object.values(state.collections || {})) {
        if (!Array.isArray(collection?.mangaIds)) continue;
        collection.mangaIds = collection.mangaIds.map((value) => remapValue(value, fromId, toId));
      }
    }

    for (const [fromId, toId] of chapterIdMap.entries()) {
      moveKeyedEntry(state.progress, fromId, toId, (value) => ({ ...(value || {}), chapterId: toId }));
      moveKeyedEntry(state.chapterReadStatus, fromId, toId);
      state.recents = (state.recents || []).map((entry) => ({
        ...entry,
        chapterId: remapValue(entry.chapterId, fromId, toId)
      }));
      state.readingQueue = (state.readingQueue || []).map((item) => ({
        ...item,
        chapterId: remapValue(item.chapterId, fromId, toId)
      }));
      for (const annotations of Object.values(state.annotations || {})) {
        if (!Array.isArray(annotations)) continue;
        for (const annotation of annotations) {
          if (annotation?.chapterId === fromId) annotation.chapterId = toId;
        }
      }
    }

    remapSessionIdentifiers(state, mangaIdMap, chapterIdMap);
    state.scanIndex = rawLibrary.scanIndex;
    return state;
  });

  return { changed: true, persisted: nextState };
}

/* ================================================================== */
/*  IPC Handlers                                                      */
/* ================================================================== */

/* ---------- App ---------- */

ipcMain.on('app:boot-ready', () => {
  ensureMainWindowVisible();
  closeSplashWindow();
});

ipcMain.handle('app:bootstrap', async () => {
  const payload = buildStatePayload();
  detectNewChapters(payload.library);
  requestPdfMetaSync({ refreshLibraryAfterSync: true });
  return payload;
});

ipcMain.handle('app:getCompactIndex', async () => {
  requestPdfMetaSync();
  return buildStatePayload().compactIndex;
});

/* ---------- Library management ---------- */

ipcMain.handle('library:addCategories', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir un ou plusieurs dossiers de categories',
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
  const payload = buildStatePayload();
  requestPdfMetaSync({ refreshLibraryAfterSync: true });
  return payload;
});

ipcMain.handle('library:removeCategory', async (_event, categoryId) => {
  updateState((state) => {
    state.categories = state.categories.filter((entry) => entry.id !== categoryId);
    if (state.vault?.privateCategoryIds) {
      state.vault.privateCategoryIds = state.vault.privateCategoryIds.filter((entryId) => entryId !== categoryId);
    }
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
    return payload;
  }

  try {
    if (typeof shell.trashItem === 'function') {
      await shell.trashItem(manga.path);
    } else if (typeof shell.moveItemToTrash === 'function') {
      shell.moveItemToTrash(manga.path);
    }
  } catch (error) {
    return { ...payload, error: error?.message || 'Unable to move manga to trash.' };
  }

  updateState((state) => {
    delete state.metadata[mangaId];
    delete state.favorites[mangaId];
    delete state.readStatus[mangaId];
    delete state.knownChapterCounts[mangaId];
    delete state.mangaTags[mangaId];
    delete state.mangaTagMeta[mangaId];

    // Remove from all collections
    for (const col of Object.values(state.collections)) {
      col.mangaIds = (col.mangaIds || []).filter((id) => id !== mangaId);
    }

    for (const chapter of manga.chapters || []) {
      delete state.progress[chapter.id];
      delete state.chapterReadStatus[chapter.id];
      if (chapter?.path) delete state.pdfMeta?.[chapter.path];
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
    if (isPdfFile(chapterPath) && fs.existsSync(chapterPath)) {
      const pageCount = await readPdfPageCount(chapterPath);
      if (pageCount > 0) {
        updateState((state) => {
          state.pdfMeta = state.pdfMeta || {};
          state.pdfMeta[chapterPath] = {
            ...(state.pdfMeta?.[chapterPath] || {}),
            pageCount,
            validatedAt: new Date().toISOString()
          };
          return state;
        });
      }
    }
    return getChapterPages(chapterPath, loadState());
  } catch (error) {
    return [];
  }
});


ipcMain.handle('library:readPdfData', async (_event, filePath) => {
  try {
    if (!filePath || !isPdfFile(filePath) || !fs.existsSync(filePath)) {
      return null;
    }

    const buffer = fs.readFileSync(filePath);
    return { base64: buffer.toString('base64') };
  } catch (error) {
    return null;
  }
});

ipcMain.handle('library:pickCover', async (_event, mangaId) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir une couverture personnalisee',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif'] }]
  });

  const payload = buildStatePayload();
  if (result.canceled || result.filePaths.length === 0) {
    return payload;
  }

  const sourcePath = result.filePaths[0];
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
    state.metadata = state.metadata || {};
    state.metadataLocks = state.metadataLocks || {};
    state.metadataFieldSource = state.metadataFieldSource || {};
    for (const [field, value] of Object.entries(patch || {})) {
      applyMetadataField(state, mangaId, field, value, 'manual');
    }
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

ipcMain.handle('library:bulkFavorite', async (_event, mangaIds = [], nextValue = true) => {
  const ids = [...new Set((Array.isArray(mangaIds) ? mangaIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
  updateState((state) => {
    ids.forEach((mangaId) => {
      const nextFavorite = nextValue === null ? !state.favorites?.[mangaId] : Boolean(nextValue);
      if (nextFavorite) state.favorites[mangaId] = true;
      else delete state.favorites[mangaId];
    });
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('library:setPrivateFlag', async (_event, mangaId, isPrivate) => {
  updateState((state) => {
    const next = getPrivateMangaIdSet(state);
    if (isPrivate) next.add(String(mangaId || '').trim());
    else next.delete(String(mangaId || '').trim());
    state.vault = state.vault || {};
    state.vault.privateMangaIds = [...next];
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('library:setPrivateFlagMany', async (_event, mangaIds = [], isPrivate) => {
  const ids = [...new Set((Array.isArray(mangaIds) ? mangaIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
  updateState((state) => {
    const next = getPrivateMangaIdSet(state);
    ids.forEach((mangaId) => {
      if (isPrivate) next.add(mangaId);
      else next.delete(mangaId);
    });
    state.vault = state.vault || {};
    state.vault.privateMangaIds = [...next];
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('library:setPrivateCategoryFlag', async (_event, categoryId, isPrivate) => {
  const normalizedCategoryId = String(categoryId || '').trim();
  if (!normalizedCategoryId) return buildStatePayload();

  updateState((state) => {
    const next = getPrivateCategoryIdSet(state);
    if (isPrivate) next.add(normalizedCategoryId);
    else next.delete(normalizedCategoryId);
    state.vault = state.vault || {};
    state.vault.privateCategoryIds = [...next];
    if (state.ui?.selectedCategoryId === normalizedCategoryId) {
      state.ui.selectedCategoryId = null;
    }
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('library:forceRescan', async () => {
  restartWatchers();
  const payload = buildStatePayload();
  requestPdfMetaSync({ refreshLibraryAfterSync: true });
  return payload;
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

ipcMain.handle('reading:bulkSetReadStatus', async (_event, entries = [], isRead) => {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      mangaId: String(entry?.mangaId || '').trim(),
      chapterIds: Array.isArray(entry?.chapterIds) ? entry.chapterIds.map((value) => String(value || '').trim()).filter(Boolean) : []
    }))
    .filter((entry) => entry.mangaId);

  updateState((state) => {
    normalizedEntries.forEach(({ mangaId, chapterIds }) => {
      chapterIds.forEach((chapterId) => {
        if (isRead) {
          state.chapterReadStatus[chapterId] = true;
        } else {
          delete state.chapterReadStatus[chapterId];
          if (state.progress[chapterId]) {
            state.progress[chapterId] = { ...state.progress[chapterId], pageIndex: 0 };
          }
        }
      });

      if (isRead) state.readStatus[mangaId] = true;
      else delete state.readStatus[mangaId];
    });
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

ipcMain.handle('tags:addMany', async (_event, tagId, mangaIds = []) => {
  const ids = [...new Set((Array.isArray(mangaIds) ? mangaIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length > 0) {
    updateState((state) => {
      for (const mangaId of ids) {
        state.mangaTags[mangaId] = [...new Set([...(state.mangaTags[mangaId] || []), tagId])];
      }
      return state;
    });
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

ipcMain.handle('collections:addMany', async (_event, collectionId, mangaIds = []) => {
  const ids = [...new Set((Array.isArray(mangaIds) ? mangaIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (ids.length > 0) {
    updateState((state) => {
      const collection = state.collections?.[collectionId];
      if (collection) {
        collection.mangaIds = [...new Set([...(collection.mangaIds || []), ...ids])];
      }
      return state;
    });
  }
  return buildStatePayload();
});

ipcMain.handle('smartCollections:save', async (_event, collection) => {
  const collectionId = String(collection?.id || '').trim() || `smart-custom-${Date.now()}`;
  updateState((state) => {
    state.smartCollections = state.smartCollections || {};
    const previous = state.smartCollections[collectionId] || {};
    state.smartCollections[collectionId] = {
      ...previous,
      id: collectionId,
      name: String(collection?.name || previous.name || 'Collection intelligente').trim(),
      description: String(collection?.description || previous.description || '').trim(),
      icon: String(collection?.icon || previous.icon || 'layers').trim(),
      color: String(collection?.color || previous.color || '#64748b').trim(),
      rules: collection?.rules && typeof collection.rules === 'object' ? collection.rules : (previous.rules || { type: 'unread' }),
      builtIn: Boolean(previous.builtIn && collection?.builtIn !== false)
    };
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('smartCollections:delete', async (_event, collectionId) => {
  updateState((state) => {
    if (state.smartCollections?.[collectionId]?.builtIn || String(collectionId || '').startsWith('smart-')) {
      return state;
    }
    delete state.smartCollections?.[collectionId];
    state.ui.sidebarPins = (state.ui.sidebarPins || []).filter((pin) => !(pin.type === 'smart' && pin.refId === collectionId));
    return state;
  });
  return buildStatePayload();
});

/* ---------- Online Metadata ---------- */

function uniqueStrings(values = []) {
  return [...new Map(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .map((value) => [value.toLowerCase(), value])
  ).values()];
}

function stripMarkup(input) {
  return String(input || '')
    .replace(/<br\s*\/?>(\n)?/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/~!/g, '')
    .replace(/!~/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeAltTitles(title, values = []) {
  const normalizedTitle = String(title || '').trim().toLowerCase();
  return uniqueStrings(values).filter((value) => value.toLowerCase() !== normalizedTitle);
}

function pickJapaneseTitle(values = []) {
  return values.find((value) => /[\\u3000-\\u9fff\\uf900-\\ufaff]/.test(String(value || ''))) || null;
}

function normalizeQuery(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function computeResultRelevance(item, query) {
  const q = normalizeQuery(query);
  if (!q) return 0;
  const sourceBoosts = { mangadex: 120, anilist: 110, nhentai: 80 };
  const titles = uniqueStrings([
    item.title,
    item.titleEnglish,
    item.titleJapanese,
    ...(Array.isArray(item.altTitles) ? item.altTitles : [])
  ]);

  let best = sourceBoosts[item.source] || 0;
  for (const title of titles) {
    const candidate = normalizeQuery(title);
    if (!candidate) continue;
    if (candidate === q) best = Math.max(best, 1000);
    else if (candidate.startsWith(q)) best = Math.max(best, 850);
    else if (candidate.includes(q)) best = Math.max(best, 700);
    else {
      const parts = q.split(' ').filter(Boolean);
      const matches = parts.filter((part) => candidate.includes(part)).length;
      if (matches > 0) best = Math.max(best, 500 + (matches * 40));
    }
  }
  return best;
}

function inferImageExtensionFromContentType(contentType = '') {
  const lower = String(contentType || '').toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  if (lower.includes('avif')) return '.avif';
  if (lower.includes('gif')) return '.gif';
  if (lower.includes('bmp')) return '.bmp';
  if (lower.includes('svg')) return '.svg';
  return '.jpg';
}

function buildNormalizedResult(data = {}) {
  const source = data.source || 'unknown';
  const sourceId = String(data.sourceId || data.mangaDexId || data.anilistId || data.nhentaiId || data.id || '');
  const title = String(data.title || data.titleEnglish || data.titleJapanese || 'Sans titre').trim() || 'Sans titre';
  const rawTags = uniqueStrings([...(Array.isArray(data.tags) ? data.tags : []), ...(Array.isArray(data.genres) ? data.genres : [])]);
  const rawAltTitles = [
    ...(Array.isArray(data.altTitles) ? data.altTitles : []),
    data.titleEnglish,
    data.titleJapanese
  ];
  const altTitles = normalizeAltTitles(title, rawAltTitles);
  const titleJapanese = data.titleJapanese || pickJapaneseTitle(altTitles) || null;

  return {
    resultId: `${source}:${sourceId || title.toLowerCase().replace(/\s+/g, '-')}`,
    source,
    sourceLabel: data.sourceLabel || source,
    sourceId,
    malId: data.malId ?? `${source}:${sourceId || title}`,
    mangaDexId: data.mangaDexId || null,
    anilistId: data.anilistId || null,
    nhentaiId: data.nhentaiId || null,
    title,
    titleJapanese,
    titleEnglish: data.titleEnglish || null,
    altTitles,
    synopsis: data.synopsis ? stripMarkup(data.synopsis) : null,
    authors: data.authors || '',
    genres: rawTags,
    tags: rawTags,
    coverUrl: data.coverUrl || null,
    coverDownloadUrl: data.coverDownloadUrl || data.coverUrl || null,
    coverPreviewUrl: data.coverPreviewUrl || data.coverUrl || data.coverDownloadUrl || null,
    score: data.score ?? null,
    status: data.status || null,
    chapters: data.chapters ?? null,
    volumes: data.volumes ?? null,
    year: data.year ?? null,
    contentRating: data.contentRating || null,
    isAdult: Boolean(data.isAdult),
    siteUrl: data.siteUrl || null
  };
}

function buildRemoteHeaders(url, extraHeaders = {}) {
  const headers = {
    'User-Agent': 'Sawa Manga Library/3.0.0',
    ...extraHeaders
  };
  if (/nhentai\.net/i.test(String(url || ''))) {
    headers.Referer = headers.Referer || 'https://nhentai.net/';
    headers.Origin = headers.Origin || 'https://nhentai.net';
  }
  return headers;
}

async function fetchJson(url, options = {}) {
  const response = await net.fetch(url, {
    ...options,
    headers: buildRemoteHeaders(url, {
      'Accept': 'application/json',
      ...(options.headers || {})
    })
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await net.fetch(url, {
    ...options,
    headers: buildRemoteHeaders(url, {
      'Accept': 'text/html,application/xhtml+xml',
      ...(options.headers || {})
    })
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function decodeHtmlEntities(input = '') {
  return String(input || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

function parseNHentaiSearchHtml(html, limit = 8) {
  if (!html || typeof html !== 'string') return [];
  const results = [];
  const cardRegex = /<a[^>]*class="cover"[^>]*href="\/g\/(\d+)\/"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"[\s\S]*?<div[^>]*class="caption"[^>]*>([\s\S]*?)<\/div>/gi;

  let match;
  while ((match = cardRegex.exec(html)) && results.length < limit) {
    const id = Number.parseInt(match[1], 10);
    const rawCover = match[2] || '';
    const rawTitle = match[3] || '';
    if (!Number.isFinite(id)) continue;
    const title = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, '').trim()) || 'Sans titre';
    const coverUrl = rawCover.startsWith('//') ? `https:${rawCover}` : rawCover;

    results.push(buildNormalizedResult({
      source: 'nhentai',
      sourceLabel: 'nHentai',
      sourceId: id,
      nhentaiId: id,
      title,
      contentRating: 'adult',
      isAdult: true,
      chapters: 1,
      coverUrl: coverUrl || null,
      coverDownloadUrl: coverUrl || null,
      coverPreviewUrl: coverUrl || null,
      siteUrl: `https://nhentai.net/g/${id}/`
    }));
  }

  return results;
}

function formatMangaDexResults(json) {
  return (json.data || []).map((item) => {
    const attr = item.attributes || {};
    const titleMap = attr.title || {};
    const title = titleMap.en || titleMap['ja-ro'] || titleMap.ja || Object.values(titleMap)[0] || 'Sans titre';
    const rawAltTitles = [
      ...Object.values(titleMap || {}),
      ...(attr.altTitles || []).flatMap((entry) => Object.values(entry || {}))
    ];
    const descMap = attr.description || {};
    const synopsis = descMap.fr || descMap.en || Object.values(descMap)[0] || null;
    const authors = (item.relationships || [])
      .filter((r) => r.type === 'author' || r.type === 'artist')
      .map((r) => r.attributes?.name)
      .filter(Boolean);
    const tags = (attr.tags || [])
      .map((t) => t.attributes?.name?.en || Object.values(t.attributes?.name || {})[0])
      .filter(Boolean);
    const coverRel = (item.relationships || []).find((r) => r.type === 'cover_art');
    const coverFileName = coverRel?.attributes?.fileName || null;
    const coverDownloadUrl = coverFileName ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}` : null;
    const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.512.jpg` : null;
    const coverPreviewUrl = coverFileName ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.256.jpg` : coverUrl;

    return buildNormalizedResult({
      source: 'mangadex',
      sourceLabel: 'MangaDex',
      sourceId: item.id,
      mangaDexId: item.id,
      title,
      titleEnglish: titleMap.en || null,
      titleJapanese: pickJapaneseTitle(rawAltTitles),
      altTitles: rawAltTitles,
      synopsis,
      authors: uniqueStrings(authors).join(', '),
      tags,
      coverUrl,
      coverDownloadUrl,
      coverPreviewUrl,
      score: attr.rating?.bayesian ? Math.round(attr.rating.bayesian * 10) / 10 : null,
      status: attr.status,
      chapters: attr.lastChapter ? parseInt(attr.lastChapter, 10) : null,
      volumes: attr.lastVolume ? parseInt(attr.lastVolume, 10) : null,
      year: attr.year,
      contentRating: attr.contentRating,
      isAdult: ['pornographic', 'erotica'].includes(attr.contentRating)
    });
  });
}

async function searchMangaDex(query) {
  const encoded = encodeURIComponent(query.trim());
  const url = `https://api.mangadex.org/manga?title=${encoded}&limit=10&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic&order[relevance]=desc`;
  const json = await fetchJson(url);
  return formatMangaDexResults(json);
}

function extractAniListAuthors(staffEdges = []) {
  const preferred = [];
  const fallback = [];
  for (const edge of staffEdges || []) {
    const role = String(edge?.role || '');
    const node = edge?.node;
    const name = node?.name?.full || node?.name?.userPreferred || node?.name?.native || null;
    if (!name) continue;
    fallback.push(name);
    if (/(story|art|original creator|creator|author|writer|illustrator|mangaka)/i.test(role)) {
      preferred.push(name);
    }
  }
  return uniqueStrings(preferred.length ? preferred : fallback).join(', ');
}

function extractAniListTags(tags = []) {
  return uniqueStrings(
    (tags || [])
      .filter((tag) => tag?.name)
      .sort((a, b) => (b?.rank || 0) - (a?.rank || 0))
      .slice(0, 12)
      .map((tag) => tag.name)
  );
}

async function searchAniList(query) {
  const gql = `
    query ($search: String!, $page: Int!, $perPage: Int!) {
      Page(page: $page, perPage: $perPage) {
        media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
          id
          idMal
          siteUrl
          isAdult
          format
          status
          chapters
          volumes
          averageScore
          startDate { year }
          title {
            romaji
            english
            native
            userPreferred
          }
          synonyms
          description(asHtml: false)
          genres
          tags {
            name
            rank
            category
          }
          coverImage {
            extraLarge
            large
            medium
          }
          staff(perPage: 8, sort: [RELEVANCE, ID]) {
            edges {
              role
              node {
                id
                name {
                  full
                  native
                  userPreferred
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await net.fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Sawa Manga Library/3.0.0'
    },
    body: JSON.stringify({
      query: gql,
      variables: { search: query.trim(), page: 1, perPage: 8 }
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();
  if (Array.isArray(json?.errors) && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message || 'AniList error');
  }

  return (json?.data?.Page?.media || []).map((item) => buildNormalizedResult({
    source: 'anilist',
    sourceLabel: 'AniList',
    sourceId: item.id,
    anilistId: item.id,
    malId: item.idMal ?? null,
    title: item.title?.userPreferred || item.title?.romaji || item.title?.english || item.title?.native || 'Sans titre',
    titleEnglish: item.title?.english || null,
    titleJapanese: item.title?.native || null,
    altTitles: [
      item.title?.romaji,
      item.title?.english,
      item.title?.native,
      ...(item.synonyms || [])
    ],
    synopsis: item.description || null,
    authors: extractAniListAuthors(item.staff?.edges || []),
    genres: item.genres || [],
    tags: extractAniListTags(item.tags || []),
    coverUrl: item.coverImage?.large || item.coverImage?.medium || item.coverImage?.extraLarge || null,
    coverDownloadUrl: item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || null,
    coverPreviewUrl: item.coverImage?.medium || item.coverImage?.large || item.coverImage?.extraLarge || null,
    score: typeof item.averageScore === 'number' ? Math.round(item.averageScore) / 10 : null,
    status: item.status || item.format || null,
    chapters: item.chapters ?? null,
    volumes: item.volumes ?? null,
    year: item.startDate?.year ?? null,
    contentRating: item.isAdult ? 'adult' : 'safe',
    isAdult: Boolean(item.isAdult),
    siteUrl: item.siteUrl || null
  }));
}

function nhentaiImageExtension(type) {
  if (type === 'p') return 'png';
  if (type === 'g') return 'gif';
  if (type === 'w') return 'webp';
  return 'jpg';
}

function buildNHentaiCoverUrl(mediaId, imageType) {
  if (!mediaId) return null;
  const ext = nhentaiImageExtension(imageType);
  return `https://t.nhentai.net/galleries/${mediaId}/cover.${ext}`;
}

function extractNHentaiAuthors(tags = []) {
  const artists = tags
    .filter((tag) => tag?.type === 'artist' || tag?.type === 'group')
    .map((tag) => tag?.name)
    .filter(Boolean);
  return uniqueStrings(artists).join(', ');
}

function extractNHentaiTags(tags = []) {
  return uniqueStrings(
    (tags || [])
      .filter((tag) => ['category', 'tag', 'parody', 'character'].includes(tag?.type))
      .map((tag) => tag?.name)
      .filter(Boolean)
      .slice(0, 20)
  );
}

function formatNHentaiEntry(item) {
  const title = item?.title?.pretty || item?.title?.english || item?.title?.japanese || 'Sans titre';
  return buildNormalizedResult({
    source: 'nhentai',
    sourceLabel: 'nHentai',
    sourceId: item?.id,
    nhentaiId: item?.id,
    title,
    titleEnglish: item?.title?.english || null,
    titleJapanese: item?.title?.japanese || null,
    altTitles: [item?.title?.english, item?.title?.japanese],
    synopsis: null,
    authors: extractNHentaiAuthors(item?.tags || []),
    tags: extractNHentaiTags(item?.tags || []),
    coverUrl: buildNHentaiCoverUrl(item?.media_id, item?.images?.cover?.t),
    coverDownloadUrl: buildNHentaiCoverUrl(item?.media_id, item?.images?.cover?.t),
    coverPreviewUrl: buildNHentaiCoverUrl(item?.media_id, item?.images?.cover?.t),
    score: null,
    status: null,
    chapters: 1,
    volumes: null,
    year: item?.upload_date ? new Date(item.upload_date * 1000).getUTCFullYear() : null,
    contentRating: 'adult',
    isAdult: true,
    siteUrl: item?.id ? `https://nhentai.net/g/${item.id}/` : null
  });
}

const NHENTAI_CACHE_MAX = 500;
const nhentaiTagsCacheById = new Map();
const nhentaiGalleryCacheById = new Map();

function capMapSize(map, max) {
  if (map.size <= max) return;
  const excess = map.size - max;
  const iter = map.keys();
  for (let i = 0; i < excess; i++) {
    const key = iter.next().value;
    if (key !== undefined) map.delete(key);
  }
}

function buildNHentaiThumbUrl(thumbnail) {
  if (!thumbnail) return null;
  if (/^https?:\/\//i.test(String(thumbnail))) return String(thumbnail);
  const normalized = String(thumbnail).replace(/^\/+/, '');
  return normalized ? `https://t3.nhentai.net/${normalized}` : null;
}

async function fetchNHentaiTagsByIds(tagIds = []) {
  const normalizedIds = [...new Set(
    (Array.isArray(tagIds) ? tagIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
  if (normalizedIds.length === 0) return [];

  const unresolvedIds = normalizedIds.filter((id) => !nhentaiTagsCacheById.has(id));
  for (let index = 0; index < unresolvedIds.length; index += 100) {
    const chunk = unresolvedIds.slice(index, index + 100);
    if (chunk.length === 0) continue;
    try {
      const json = await fetchJson(`https://nhentai.net/api/v2/tags/ids?ids=${chunk.join(',')}`, {
        headers: {
          Referer: 'https://nhentai.net/',
          Origin: 'https://nhentai.net'
        }
      });
      for (const tag of Array.isArray(json) ? json : []) {
        const id = Number(tag?.id);
        if (!Number.isInteger(id) || id <= 0) continue;
        nhentaiTagsCacheById.set(id, tag);
      }
    } catch (_error) {
      // Silent by design: metadata search must remain resilient.
    }
  }

  capMapSize(nhentaiTagsCacheById, NHENTAI_CACHE_MAX);
  return normalizedIds.map((id) => nhentaiTagsCacheById.get(id)).filter(Boolean);
}

function extractNHentaiV2AuthorsAndTags(tagObjects = []) {
  const normalized = Array.isArray(tagObjects) ? tagObjects : [];
  const authors = uniqueStrings(
    normalized
      .filter((tag) => tag?.type === 'artist' || tag?.type === 'group')
      .map((tag) => tag?.name)
      .filter(Boolean)
  ).join(', ');
  const tags = uniqueStrings(
    normalized
      .filter((tag) => ['category', 'tag', 'parody', 'character'].includes(tag?.type))
      .map((tag) => tag?.name)
      .filter(Boolean)
      .slice(0, 20)
  );
  return { authors, tags };
}

async function fetchNHentaiV2GalleryById(galleryId) {
  const id = Number(galleryId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (nhentaiGalleryCacheById.has(id)) return nhentaiGalleryCacheById.get(id);
  try {
    const json = await fetchJson(`https://nhentai.net/api/v2/galleries/${id}`, {
      headers: {
        Referer: 'https://nhentai.net/',
        Origin: 'https://nhentai.net'
      }
    });
    if (json && typeof json === 'object') {
      capMapSize(nhentaiGalleryCacheById, NHENTAI_CACHE_MAX);
      nhentaiGalleryCacheById.set(id, json);
      for (const tag of Array.isArray(json.tags) ? json.tags : []) {
        const tagId = Number(tag?.id);
        if (!Number.isInteger(tagId) || tagId <= 0) continue;
        nhentaiTagsCacheById.set(tagId, tag);
      }
      return json;
    }
  } catch (_error) {
    // Silent by design.
  }
  return null;
}

function formatNHentaiV2Entry(item, tagLookup = new Map(), galleryFallback = null) {
  const resolvedTags = (Array.isArray(item?.tag_ids) ? item.tag_ids : [])
    .map((id) => tagLookup.get(Number(id)))
    .filter(Boolean);
  const fallbackTags = Array.isArray(galleryFallback?.tags) ? galleryFallback.tags : [];
  const { authors, tags } = extractNHentaiV2AuthorsAndTags(resolvedTags.length > 0 ? resolvedTags : fallbackTags);

  const fallbackEnglish = galleryFallback?.title?.english || null;
  const fallbackJapanese = galleryFallback?.title?.japanese || null;
  const fallbackPretty = galleryFallback?.title?.pretty || null;
  const title = item?.english_title || item?.japanese_title || fallbackEnglish || fallbackJapanese || fallbackPretty || 'Sans titre';
  const cover = buildNHentaiThumbUrl(item?.thumbnail || galleryFallback?.thumbnail || galleryFallback?.cover);
  const sourceId = item?.id || galleryFallback?.id || null;

  return buildNormalizedResult({
    source: 'nhentai',
    sourceLabel: 'nHentai',
    sourceId,
    nhentaiId: sourceId,
    title,
    titleEnglish: item?.english_title || fallbackEnglish || null,
    titleJapanese: item?.japanese_title || fallbackJapanese || null,
    altTitles: [item?.english_title || fallbackEnglish, item?.japanese_title || fallbackJapanese, fallbackPretty],
    synopsis: null,
    authors,
    tags,
    coverUrl: cover,
    coverDownloadUrl: cover,
    coverPreviewUrl: cover,
    score: null,
    status: null,
    chapters: 1,
    volumes: null,
    year: null,
    contentRating: 'adult',
    isAdult: true,
    siteUrl: sourceId ? `https://nhentai.net/g/${sourceId}/` : null
  });
}

async function searchNHentai(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const encoded = encodeURIComponent(trimmed);

  try {
    const jsonV2 = await fetchJson(`https://nhentai.net/api/v2/search?query=${encoded}&sort=date&page=1`, {
      headers: {
        Referer: 'https://nhentai.net/',
        Origin: 'https://nhentai.net'
      }
    });
    const v2Entries = (jsonV2?.result || []).slice(0, 8);
    const allTagIds = [...new Set(v2Entries.flatMap((entry) => (Array.isArray(entry?.tag_ids) ? entry.tag_ids : [])))];
    const resolvedTags = await fetchNHentaiTagsByIds(allTagIds);
    const tagLookup = new Map(resolvedTags.map((tag) => [Number(tag.id), tag]));
    const apiV2Results = v2Entries.map((entry) => formatNHentaiV2Entry(entry, tagLookup));
    const fallbackIndexes = new Set(
      apiV2Results
        .map((entry, index) => (Array.isArray(entry?.genres) && entry.genres.length > 0 ? -1 : index))
        .filter((index) => index >= 0)
    );
    if (fallbackIndexes.size > 0) {
      const galleryDetails = await Promise.all(
        v2Entries.map((entry, index) => (
          fallbackIndexes.has(index)
            ? fetchNHentaiV2GalleryById(entry?.id)
            : Promise.resolve(null)
        ))
      );
      const hydratedResults = v2Entries.map((entry, index) => (
        formatNHentaiV2Entry(entry, tagLookup, galleryDetails[index])
      ));
      if (hydratedResults.length > 0) return hydratedResults;
    }
    if (apiV2Results.length > 0) return apiV2Results;
  } catch (_error) {
    // Fallback below
  }

  try {
    const json = await fetchJson(`https://nhentai.net/api/galleries/search?query=${encoded}&page=1`, {
      headers: {
        Referer: 'https://nhentai.net/',
        Origin: 'https://nhentai.net'
      }
    });
    const apiResults = (json?.result || []).slice(0, 8).map(formatNHentaiEntry);
    if (apiResults.length > 0) return apiResults;
  } catch (_error) {
    // Fallback below
  }

  try {
    const html = await fetchText(`https://nhentai.net/search/?q=${encoded}`);
    const fallbackResults = parseNHentaiSearchHtml(html, 8);
    if (fallbackResults.length > 0) return fallbackResults;
  } catch (_error) {
    // Silent fail: NSFW provider should not break metadata search UI
  }
  return [];
}

async function remoteImageToDataUrl(url) {
  if (!url) return null;
  try {
    const response = await net.fetch(url, {
      headers: buildRemoteHeaders(url, {
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      })
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
  const trimmedQuery = query.trim();
  const state = loadState();
  const allowNsfwSources = Boolean(state?.ui?.allowNsfwSources);
  const providers = [
    ['mangadex', () => searchMangaDex(trimmedQuery)],
    ['anilist', () => searchAniList(trimmedQuery)],
    ...(allowNsfwSources ? [['nhentai', () => searchNHentai(trimmedQuery)]] : [])
  ];
  const providerErrors = {};
  const settled = await Promise.allSettled(providers.map(([, run]) => run()));

  const merged = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const key = providers[index]?.[0] || `provider-${index}`;
    if (result.status === 'fulfilled') {
      merged.push(...(result.value || []));
    } else {
      providerErrors[key] = result.reason?.message || 'Erreur réseau';
    }
  }

  const ranked = merged
    .map((item) => ({ ...item, _relevance: computeResultRelevance(item, trimmedQuery) }))
    .sort((a, b) => {
      if (b._relevance !== a._relevance) return b._relevance - a._relevance;
      if (a.isAdult !== b.isAdult) return Number(a.isAdult) - Number(b.isAdult);
      return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    })
    .slice(0, 20)
    .map(({ _relevance, ...item }) => item);

  const results = await Promise.all(ranked.map(async (item) => ({
    ...item,
    coverPreviewSrc: await remoteImageToDataUrl(item.coverPreviewUrl || item.coverUrl || item.coverDownloadUrl)
  })));

  const errorKeys = Object.keys(providerErrors);
  return {
    results,
    error: errorKeys.length ? errorKeys.map((key) => `${key}: ${providerErrors[key]}`).join(' | ') : null,
    providerErrors
  };
});

ipcMain.handle('metadata:importOnline', async (_event, mangaId, onlineData) => {
  const importedGenres = uniqueStrings([
    ...(Array.isArray(onlineData?.genres) ? onlineData.genres : []),
    ...(Array.isArray(onlineData?.tags) ? onlineData.tags : [])
  ]);
  const patch = {};
  if (onlineData.title) patch.onlineTitle = onlineData.title;
  if (onlineData.titleJapanese) patch.titleJapanese = onlineData.titleJapanese;
  if (onlineData.titleEnglish) patch.titleEnglish = onlineData.titleEnglish;
  if (onlineData.synopsis) patch.onlineDescription = onlineData.synopsis;
  if (onlineData.authors) patch.onlineAuthor = onlineData.authors;
  if (importedGenres.length > 0) patch.onlineGenres = importedGenres;
  if (onlineData.source) patch.onlineSource = onlineData.source;
  if (onlineData.sourceLabel) patch.onlineSourceLabel = onlineData.sourceLabel;
  if (onlineData.sourceId) patch.onlineSourceId = String(onlineData.sourceId);
  if (onlineData.mangaDexId) patch.mangaDexId = onlineData.mangaDexId;
  if (onlineData.anilistId) patch.anilistId = onlineData.anilistId;
  if (onlineData.nhentaiId) patch.nhentaiId = onlineData.nhentaiId;
  if (Array.isArray(onlineData.altTitles)) {
    patch.onlineAltTitles = uniqueStrings(onlineData.altTitles);
  }
  if (onlineData.source === 'anilist' && Number.isFinite(Number(onlineData.malId))) {
    patch.malId = Number(onlineData.malId);
  }

  if (onlineData.coverDownloadUrl || onlineData.coverUrl) {
    try {
      const rawLibrary = scanLibrary(loadState());
      const manga = findMangaByReference(rawLibrary, mangaId);
      if (manga?.path && fs.existsSync(manga.path)) {
        const remoteUrl = onlineData.coverDownloadUrl || onlineData.coverUrl;
        const response = await net.fetch(remoteUrl, { headers: buildRemoteHeaders(remoteUrl) });
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const contentType = response.headers.get('content-type') || '';
          const urlPath = (() => {
            try { return new URL(remoteUrl).pathname; } catch (_) { return remoteUrl; }
          })();
          const extFromUrl = (path.extname(urlPath) || '').toLowerCase();
          const ext = extFromUrl || inferImageExtensionFromContentType(contentType);
          const coverPath = path.join(manga.path, `.sawa-online-cover${ext || '.jpg'}`);
          fs.writeFileSync(coverPath, buffer);
          patch.onlineCoverPath = coverPath;
        }
      }
    } catch (_) {
      // Cover download failed silently
    }
  }

  const TAG_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
    '#6366f1', '#f43f5e', '#0ea5e9', '#84cc16'
  ];
  const isNhentai = onlineData.source === 'nhentai';
  const now = new Date().toISOString();

  updateState((state) => {
    state.metadata = state.metadata || {};
    state.metadataLocks = state.metadataLocks || {};
    state.metadataFieldSource = state.metadataFieldSource || {};
    state.tags = state.tags || {};
    state.mangaTags = state.mangaTags || {};
    state.mangaTagMeta = state.mangaTagMeta || {};

    for (const [field, value] of Object.entries(patch)) {
      applyMetadataField(state, mangaId, field, value, 'online');
    }
    state.metadata[mangaId] = {
      ...(state.metadata[mangaId] || {}),
      onlineImportedAt: now
    };

    for (const tag of importedGenres) {
      const tagName = tag.trim();
      if (!tagName) continue;

      let existingTag = Object.values(state.tags).find((t) => t.name.toLowerCase() === tagName.toLowerCase());
      if (!existingTag) {
        let hash = 0;
        for (let i = 0; i < tagName.length; i += 1) {
          hash = ((hash << 5) - hash) + tagName.charCodeAt(i);
          hash |= 0;
        }
        const id = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        existingTag = { id, name: tagName, color: TAG_COLORS[Math.abs(hash) % TAG_COLORS.length], createdAt: now };
        state.tags[id] = existingTag;
      }
      if (existingTag) {
        state.mangaTags[mangaId] = [...new Set([...(state.mangaTags[mangaId] || []), existingTag.id])];
        if (isNhentai) {
          state.mangaTagMeta[mangaId] = state.mangaTagMeta[mangaId] || {};
          state.mangaTagMeta[mangaId][existingTag.id] = { nsfw: true, source: 'nhentai', autoImported: true, markedAt: now };
        }
      }
    }

    return state;
  });

  return buildStatePayload();
});

ipcMain.handle('metadata:queueWorkbench', async (_event, mangaIds = [], mode = 'append') => {
  const ids = [...new Set((Array.isArray(mangaIds) ? mangaIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
  updateState((state) => {
    const existing = Array.isArray(state.metadataWorkbenchQueue) ? state.metadataWorkbenchQueue : [];
    state.metadataWorkbenchQueue = mode === 'replace'
      ? ids
      : [...new Set([...existing, ...ids])];
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('metadata:setWorkbenchQueue', async (_event, mangaIds = []) => {
  const ids = [...new Set((Array.isArray(mangaIds) ? mangaIds : []).map((value) => String(value || '').trim()).filter(Boolean))];
  updateState((state) => {
    state.metadataWorkbenchQueue = ids;
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('metadata:updateFieldLocks', async (_event, mangaId, patch = {}) => {
  updateState((state) => {
    state.metadataLocks = state.metadataLocks || {};
    state.metadataLocks[mangaId] = {
      ...(state.metadataLocks[mangaId] || {}),
      ...Object.fromEntries(
        Object.entries(patch || {}).map(([field, value]) => [field, Boolean(value)])
      )
    };
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('metadata:importComicInfo', async (_event, mangaRef, options = {}) => {
  const payload = buildStatePayload();
  const manga = findMangaByReference(payload.library, mangaRef);
  if (!manga) return { ok: false, error: 'Manga introuvable.', payload };

  const explicitChapterRef = String(options?.chapterId || options?.chapterContentId || '').trim();
  const targetChapter = explicitChapterRef
    ? (manga.chapters || []).find((chapter) => chapter.id === explicitChapterRef || chapter.contentId === explicitChapterRef || chapter.locationId === explicitChapterRef)
    : (manga.chapters || []).find((chapter) => chapter.comicInfo)
      || (manga.chapters || []).find((chapter) => chapter.containerType === 'cbz' || chapter.containerType === 'folder')
      || null;

  if (!targetChapter?.path) {
    return { ok: false, error: 'Aucune source ComicInfo exploitable.', payload };
  }

  const comicInfo = targetChapter.comicInfo || await loadComicInfoForSource(targetChapter.path);
  if (!comicInfo) {
    return { ok: false, error: 'ComicInfo.xml introuvable.', payload: buildStatePayload() };
  }

  const authorParts = [...new Set([comicInfo.writer, comicInfo.artist].map((value) => String(value || '').trim()).filter(Boolean))];
  const comicPatch = {
    title: String(comicInfo.series || comicInfo.title || '').trim() || undefined,
    description: String(comicInfo.summary || '').trim() || undefined,
    author: authorParts.join(', ') || undefined,
    volume: String(comicInfo.volume || '').trim() || undefined,
    number: String(comicInfo.number || '').trim() || undefined,
    year: String(comicInfo.year || '').trim() || undefined
  };

  const importedGenres = uniqueStrings(
    String(comicInfo.genre || '')
      .split(/[;,]/g)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
  const now = new Date().toISOString();

  updateState((state) => {
    state.metadata = state.metadata || {};
    state.metadataLocks = state.metadataLocks || {};
    state.metadataFieldSource = state.metadataFieldSource || {};
    state.tags = state.tags || {};
    state.mangaTags = state.mangaTags || {};

    Object.entries(comicPatch).forEach(([field, value]) => {
      if (value !== undefined) applyMetadataField(state, manga.id, field, value, 'comicinfo');
    });

    state.metadata[manga.id] = {
      ...(state.metadata[manga.id] || {}),
      comicInfoImportedAt: now
    };

    for (const tagName of importedGenres) {
      let existingTag = Object.values(state.tags).find((tag) => tag.name.toLowerCase() === tagName.toLowerCase());
      if (!existingTag) {
        let hash = 0;
        for (let index = 0; index < tagName.length; index += 1) {
          hash = ((hash << 5) - hash) + tagName.charCodeAt(index);
          hash |= 0;
        }
        const id = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        existingTag = { id, name: tagName, color: TAG_COLORS[Math.abs(hash) % TAG_COLORS.length], createdAt: now };
        state.tags[id] = existingTag;
      }
      if (existingTag) {
        state.mangaTags[manga.id] = [...new Set([...(state.mangaTags[manga.id] || []), existingTag.id])];
      }
    }

    return state;
  });

  return { ok: true, payload: buildStatePayload(), comicInfo };
});

ipcMain.handle('queue:upsert', async (_event, item = {}) => {
  const payload = buildStatePayload();
  const manga = findMangaByReference(payload.library, item.mangaId);
  const chapterTarget = item.chapterId ? findChapterByReference(payload.library, item.chapterId) : { manga: null, chapter: null };
  const targetManga = chapterTarget.manga || manga;
  const targetChapter = chapterTarget.chapter || null;
  if (!targetManga) return payload;

  updateState((state) => {
    const nextSource = normalizeQueueSource(item.source);
    const currentQueue = Array.isArray(state.readingQueue) ? state.readingQueue : [];
    const targetIndex = currentQueue.findIndex((entry) =>
      String(entry?.mangaId || '') === targetManga.id
      && String(entry?.chapterId || '') === String(targetChapter?.id || '')
    );

    const existing = targetIndex >= 0 ? currentQueue[targetIndex] : null;
    const sources = [...new Set([...(existing?.sources || []), nextSource].map(normalizeQueueSource))];
    const nextItem = {
      mangaId: targetManga.id,
      mangaContentId: targetManga.contentId,
      chapterId: targetChapter?.id || null,
      chapterContentId: targetChapter?.contentId || null,
      sources,
      displaySource: getQueueDisplaySource(sources),
      pinned: item.pinned !== undefined ? Boolean(item.pinned) : Boolean(existing?.pinned),
      deferredUntil: item.deferredUntil ?? existing?.deferredUntil ?? null,
      updatedAt: new Date().toISOString()
    };

    if (targetIndex >= 0) currentQueue[targetIndex] = nextItem;
    else currentQueue.unshift(nextItem);
    state.readingQueue = currentQueue;
    return state;
  });

  return buildStatePayload();
});

ipcMain.handle('queue:remove', async (_event, item = {}) => {
  updateState((state) => {
    state.readingQueue = (state.readingQueue || []).filter((entry) => !(
      String(entry?.mangaId || '') === String(item?.mangaId || '')
      && String(entry?.chapterId || '') === String(item?.chapterId || '')
    ));
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('queue:save', async (_event, items = []) => {
  updateState((state) => {
    state.readingQueue = Array.isArray(items) ? items : [];
    return state;
  });
  return buildStatePayload();
});

ipcMain.handle('annotations:add', async (_event, input = {}) => {
  const mangaId = String(input?.mangaId || '').trim();
  const chapterId = String(input?.chapterId || '').trim();
  if (!mangaId || !chapterId) return buildStatePayload();

  updateState((state) => {
    state.annotations = state.annotations || {};
    const list = Array.isArray(state.annotations[mangaId]) ? state.annotations[mangaId] : [];
    const now = new Date().toISOString();
    list.unshift({
      id: makeLocalId('annotation'),
      mangaId,
      chapterId,
      pageIndex: Math.max(0, Number(input?.pageIndex || 0)),
      label: String(input?.label || '').trim() || 'Repere',
      note: String(input?.note || '').trim(),
      createdAt: now,
      updatedAt: now
    });
    state.annotations[mangaId] = list.slice(0, 200);
    return state;
  });

  return buildStatePayload();
});

ipcMain.handle('annotations:delete', async (_event, mangaId, annotationId) => {
  const targetMangaId = String(mangaId || '').trim();
  const targetAnnotationId = String(annotationId || '').trim();
  updateState((state) => {
    if (!state.annotations?.[targetMangaId]) return state;
    state.annotations[targetMangaId] = state.annotations[targetMangaId].filter((item) => item.id !== targetAnnotationId);
    if (state.annotations[targetMangaId].length === 0) delete state.annotations[targetMangaId];
    return state;
  });
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
    if (payload?.version === 2 && Array.isArray(payload?.workspaces)) {
      state.session = {
        version: 2,
        activeWorkspaceId: payload.activeWorkspaceId ?? null,
        workspaces: payload.workspaces
      };
    } else {
      state.session = {
        tabs: Array.isArray(payload?.tabs) ? payload.tabs : [],
        activeTabId: payload?.activeTabId ?? null
      };
    }
    return state;
  });
  return true;
});

ipcMain.handle('vault:setPin', async (_event, pin) => {
  const normalizedPin = normalizePinInput(pin);
  if (normalizedPin.length < 4) {
    return { ok: false, error: 'Le code PIN doit contenir au moins 4 caracteres.' };
  }

  updateState((state) => {
    state.vault = state.vault || {};
    const pinProtectedBlob = buildProtectedPinBlob(normalizedPin);
    state.vault.pinProtectedBlob = pinProtectedBlob;
    state.vault.pinHash = pinProtectedBlob ? null : hashPin(normalizedPin);
    state.vault.securityMode = pinProtectedBlob ? 'system' : 'basic';
    state.vault.autoLockOnClose = true;
    state.vault.locked = false;
    return state;
  });

  return { ok: true, payload: buildStatePayload() };
});

ipcMain.handle('vault:unlock', async (_event, pin) => {
  const state = loadState();
  if (!isVaultConfigured(state)) {
    return { ok: false, error: 'Aucun code PIN n est configure.' };
  }
  const normalizedPin = normalizePinInput(pin);
  const matchesProtected = verifyProtectedPinBlob(normalizedPin, state?.vault?.pinProtectedBlob);
  const matchesBasic = !state?.vault?.pinProtectedBlob && hashPin(normalizedPin) === (state?.vault?.pinHash || null);
  if (!matchesProtected && !matchesBasic) {
    return { ok: false, error: 'Code PIN incorrect.' };
  }
  updateState((nextState) => {
    nextState.vault = nextState.vault || {};
    if (!nextState.vault.pinProtectedBlob) {
      const nextProtectedBlob = buildProtectedPinBlob(normalizedPin);
      if (nextProtectedBlob) {
        nextState.vault.pinProtectedBlob = nextProtectedBlob;
        nextState.vault.pinHash = null;
        nextState.vault.securityMode = 'system';
      }
    }
    nextState.vault.locked = false;
    return nextState;
  });
  return { ok: true, payload: buildStatePayload() };
});

ipcMain.handle('vault:lock', async () => {
  updateState((state) => {
    if (!isVaultConfigured(state)) return state;
    state.vault.locked = true;
    return state;
  });
  return { ok: true, payload: buildStatePayload() };
});

ipcMain.handle('vault:updatePrefs', async (_event, patch = {}) => {
  updateState((state) => {
    state.vault = {
      ...(state.vault || {}),
      blurCovers: patch.blurCovers !== undefined ? Boolean(patch.blurCovers) : Boolean(state.vault?.blurCovers),
      stealthMode: patch.stealthMode !== undefined ? Boolean(patch.stealthMode) : Boolean(state.vault?.stealthMode)
    };
    return state;
  });
  return buildStatePayload();
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
  persistVaultLock();
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
    clearCbzCache();
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

