import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(THIS_DIR, '..', '..');

function copyIfPresent(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
  return true;
}

function sourceProfilePath() {
  const explicit = String(process.env.SAWA_E2E_SOURCE_PROFILE || '').trim();
  if (explicit) return path.resolve(explicit);
  const appData = String(process.env.APPDATA || '').trim();
  return appData ? path.join(appData, 'sawa-manga-library') : '';
}

function hashFromString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export function makeFixtureId(prefix, absolutePath) {
  return `${prefix}_${hashFromString(absolutePath)}`;
}

function buildTestSession({ incognito = false } = {}) {
  return {
    version: 4,
    searchPrivacyVersion: 1,
    activeWorkspaceId: 'e2e-workspace',
    workspaces: [{
      id: 'e2e-workspace',
      name: 'E2E',
      iconKey: 'library',
      activeTabId: 'e2e-tab',
      tabs: [{
        id: 'e2e-tab',
        pinned: false,
        incognito,
        searchPrivate: false,
        searchState: { query: '', scope: 'current', filters: [] },
        stack: [{ screen: 'library', mangaId: null, chapterId: null, pageIndex: 0, readerState: null }]
      }]
    }],
    scrollPositions: {}
  };
}

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZqZsAAAAASUVORK5CYII=',
  'base64'
);

function createSeedLibrary(profileRoot, mangaCount = 84) {
  const libraryRoot = path.join(profileRoot, 'fixture-library');
  fs.mkdirSync(libraryRoot, { recursive: true });
  const mangas = [];

  for (let index = 0; index < mangaCount; index += 1) {
    const folderName = index === 0
      ? 'Etoile du Matin'
      : index === 1
        ? 'Etoile du Matin - Edition Couleur'
        : index === 2
          ? 'Secret du Coffre'
          : `Serie Fixture ${String(index + 1).padStart(3, '0')}`;
    const mangaPath = path.join(libraryRoot, folderName);
    const chapterCount = index < 3 ? 3 : 1;
    fs.mkdirSync(mangaPath, { recursive: true });
    const chapterPaths = [];
    for (let chapterIndex = 0; chapterIndex < chapterCount; chapterIndex += 1) {
      const chapterPath = path.join(mangaPath, `Chapitre ${String(chapterIndex + 1).padStart(2, '0')}`);
      fs.mkdirSync(chapterPath, { recursive: true });
      for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
        const identitySuffix = Buffer.from(`sawa-e2e:${index}:${chapterIndex}:${pageIndex}`, 'utf8');
        fs.writeFileSync(
          path.join(chapterPath, `${String(pageIndex + 1).padStart(3, '0')}.png`),
          Buffer.concat([FIXTURE_PNG, identitySuffix])
        );
      }
      chapterPaths.push(chapterPath);
    }
    mangas.push({
      index,
      path: mangaPath,
      id: makeFixtureId('manga', mangaPath),
      chapters: chapterPaths.map((chapterPath) => ({
        path: chapterPath,
        id: makeFixtureId('chapter', chapterPath)
      }))
    });
  }

  return { libraryRoot, mangas };
}

function buildSeedState(profileRoot, { interfaceMode, diagnostics, incognito = false, mangaCount = 84 }) {
  const { libraryRoot, mangas } = createSeedLibrary(profileRoot, mangaCount);
  const first = mangas[0];
  const second = mangas[1];
  const secret = mangas[2];
  const metadata = Object.fromEntries(mangas.map((manga) => [
    manga.id,
    {
      title: manga.index === 0
        ? 'Étoile du Matin'
        : manga.index === 1
          ? 'Étoile du Matin — Édition couleur'
          : manga.index === 2
            ? 'Secret du Coffre'
            : `Série Fixture ${String(manga.index + 1).padStart(3, '0')}`,
      author: manga.index < 2 ? 'Aoi Testeur' : `Auteur ${manga.index % 7}`,
      aliases: manga.index === 0 ? ['Morning Star', 'Etoile Matin'] : [],
      description: `Description locale de test ${manga.index + 1}`
    }
  ]));

  const collectionId = 'collection-e2e';
  const tagId = 'tag-e2e';
  const now = new Date().toISOString();
  return {
    version: 4,
    stateVersion: 4,
    scanIndexVersion: 1,
    queueVersion: 1,
    metadataVersion: 1,
    splitStorageVersion: 1,
    categories: [{
      id: 'category-e2e',
      name: 'Bibliothèque E2E',
      path: libraryRoot,
      hidden: false
    }],
    session: buildTestSession({ incognito }),
    ui: {
      interfaceMode,
      kavitaUpgradePromptSeen: true,
      activeScreen: 'library',
      selectedCategoryId: null,
      cardSize: 'comfortable',
      chapterCardSize: 'comfortable',
      pagePreviewSize: 'comfortable',
      previewQuality: 'balanced',
      showPagePreviewBeforeReading: true,
      sort: 'title-asc',
      filters: {
        readStatus: 'all',
        favoriteOnly: false,
        hasDescription: null,
        hasCustomCover: null,
        tags: [],
        collections: []
      },
      experimental: {
        advancedSearch: true,
        performanceDiagnostics: diagnostics
      }
    },
    metadata,
    metadataLocks: {},
    metadataFieldSource: {},
    coverProfiles: {},
    favorites: { [first.id]: true },
    tags: {
      [tagId]: { id: tagId, name: 'Aventure locale', color: '#22c55e', createdAt: now }
    },
    mangaTags: {
      [first.id]: [tagId],
      [second.id]: [tagId]
    },
    mangaTagMeta: {},
    collections: {
      [collectionId]: {
        id: collectionId,
        name: 'Collection E2E',
        description: 'Collection visible de test',
        color: '#8b5cf6',
        mangaIds: [first.id, second.id, mangas[3].id, mangas[4].id],
        appearance: {
          type: 'mosaic',
          featuredMangaIds: [first.id, second.id]
        },
        createdAt: now
      }
    },
    smartCollections: {},
    annotations: {},
    metadataWorkbenchQueue: [],
    readingQueue: [],
    plugins: { enabled: {}, dismissedWarnings: {} },
    vault: {
      pinHash: 'fixture-pin-hash',
      pinProtectedBlob: null,
      securityMode: 'basic',
      locked: true,
      blurCovers: true,
      autoLockOnClose: true,
      stealthMode: false,
      privateMangaIds: [secret.id],
      privateCategoryIds: []
    },
    readingStates: {},
    chapterStates: {},
    readStatus: {},
    chapterReadStatus: {},
    progress: {
      [first.chapters[0].id]: {
        mangaId: first.id,
        chapterId: first.chapters[0].id,
        pageIndex: 2,
        pageCount: 4,
        lastReadAt: now
      }
    },
    recents: [],
    knownChapterCounts: {},
    identityAliases: {},
    identityRecords: {},
    identitySuggestions: [],
    identityMediaIssues: [],
    workGroups: {
      'work-e2e': {
        id: 'work-e2e',
        editionIds: [first.id, second.id],
        preferredEditionId: first.id,
        shared: {
          favorite: true,
          tagIds: [tagId],
          collectionIds: [collectionId]
        },
        createdAt: now,
        updatedAt: now
      }
    },
    deletionTombstones: {},
    readerPrefs: {},
    pdfMeta: {},
    backupHistory: [],
    migrationLog: []
  };
}

function createRepresentativeProfile({ interfaceMode, diagnostics }) {
  const sourceRoot = sourceProfilePath();
  if (!sourceRoot || !fs.existsSync(path.join(sourceRoot, 'state.json'))) {
    return null;
  }

  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-e2e-'));
  const requiredCopies = [
    ['state.json', 'state.json'],
    ['user-data', 'user-data'],
    [path.join('derived', 'library.db'), path.join('derived', 'library.db')]
  ];
  requiredCopies.forEach(([relativeSource, relativeDestination]) => {
    copyIfPresent(path.join(sourceRoot, relativeSource), path.join(profileRoot, relativeDestination));
  });

  const statePath = path.join(profileRoot, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.session = buildTestSession();
  // Le profil representatif protege une categorie volumineuse dans le coffre.
  // Le test utilise une copie jetable et la rend visible afin de mesurer les 499 mangas,
  // sans changer les preferences du profil utilisateur original.
  state.vault = {
    ...(state.vault || {}),
    locked: false,
    privateMangaIds: [],
    privateCategoryIds: [],
    stealthMode: false
  };
  state.ui = {
    ...(state.ui || {}),
    interfaceMode,
    activeScreen: 'library',
    selectedCategoryId: null,
    cardSize: 'comfortable',
    filters: {
      readStatus: 'all',
      favoriteOnly: false,
      hasDescription: null,
      hasCustomCover: null,
      tags: [],
      collections: []
    },
    experimental: {
      ...(state.ui?.experimental || {}),
      performanceDiagnostics: diagnostics
    }
  };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return profileRoot;
}

export function createIsolatedProfile({
  interfaceMode = 'sawa',
  diagnostics = false,
  representative = false,
  incognito = false,
  mangaCount = 84
} = {}) {
  if (representative) {
    const representativeProfile = createRepresentativeProfile({ interfaceMode, diagnostics });
    if (representativeProfile) return representativeProfile;
  }
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-e2e-'));
  const state = buildSeedState(profileRoot, { interfaceMode, diagnostics, incognito, mangaCount });
  fs.writeFileSync(path.join(profileRoot, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return profileRoot;
}

export function readFixtureState(profileRoot) {
  return JSON.parse(fs.readFileSync(path.join(profileRoot, 'state.json'), 'utf8'));
}

export function fixtureLibraryRoot(profileRoot) {
  return path.join(profileRoot, 'fixture-library');
}

export async function removeIsolatedProfile(profileRoot) {
  const resolved = path.resolve(String(profileRoot || ''));
  const tempRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${tempRoot}${path.sep}`) || !path.basename(resolved).startsWith('sawa-e2e-')) {
    throw new Error(`Refus de supprimer un profil non isole: ${resolved}`);
  }
  // Windows peut conserver le verrou SQLite quelques centaines de millisecondes
  // apres la fermeture de la BrowserWindow. La suppression reste strictement
  // bornee au repertoire temporaire valide ci-dessus.
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

export async function launchSawa(profileRoot, extraEnv = {}) {
  const startedAt = performance.now();
  const application = await electron.launch({
    args: ['.'],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SAWA_USER_DATA_PATH: profileRoot,
      SAWA_PERF_DIAGNOSTICS: '1',
      ...extraEnv
    }
  });

  let page = application.windows().find((candidate) => candidate.url().startsWith('file:')) || null;
  const deadline = Date.now() + 20_000;
  while (!page && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    page = application.windows().find((candidate) => candidate.url().startsWith('file:')) || null;
  }
  if (!page) {
    await application.close().catch(() => {});
    throw new Error('Fenetre principale Electron introuvable.');
  }

  try {
    await page.locator('.app-shell, .kv-app').first().waitFor({ state: 'visible', timeout: 20_000 });
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const bodyHtml = await page.locator('body').innerHTML().catch(() => '');
    await application.close().catch(() => {});
    throw new Error(`Interface Sawa absente: ${bodyText.slice(0, 1200)}\nHTML: ${bodyHtml.slice(0, 1200)}`, { cause: error });
  }
  const librarySelector = await page.locator('.library-view').count() ? '.library-view' : '.kv-scroll-region';
  await page.locator(librarySelector).waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator(`${librarySelector} [data-manga-id]`).first().waitFor({ state: 'visible', timeout: 20_000 });
  return {
    application,
    page,
    librarySelector,
    usableMs: performance.now() - startedAt
  };
}

export async function readScrollSnapshot(page, librarySelector) {
  return page.locator(librarySelector).evaluate((node) => {
    const cards = [...node.querySelectorAll('[data-manga-id]')];
    const viewportTop = node.getBoundingClientRect().top;
    const anchor = cards
      .map((card) => ({
        id: card.getAttribute('data-manga-id'),
        top: card.getBoundingClientRect().top - viewportTop,
        bottom: card.getBoundingClientRect().bottom - viewportTop
      }))
      .filter((item) => item.id && item.bottom >= 0)
      .sort((left, right) => left.top - right.top)[0] || null;
    return { scrollTop: node.scrollTop, anchorId: anchor?.id || null, anchorTop: anchor?.top ?? null };
  });
}

export async function scrollToStableOffset(page, librarySelector, offset = 3200) {
  await page.locator(librarySelector).evaluate((node, target) => {
    node.scrollTop = target;
    node.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, offset);
  await page.waitForTimeout(750);
  return readScrollSnapshot(page, librarySelector);
}

export function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0;
}
