import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtimePath = require.resolve('../electron/services/sourceRuntime.cjs');
const storagePath = require.resolve('../electron/services/storage.cjs');
const suwayomiRuntimePath = require.resolve('../electron/services/suwayomiRuntime.cjs');

const tempDirs = [];

function loadSourceRuntime(baseDir) {
  const userDataStoreDir = path.join(baseDir, 'user-data');
  const cacheDir = path.join(baseDir, 'cache');
  fs.mkdirSync(userDataStoreDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const runtimeExtensions = [];
  const runtimeStatus = {
    kind: 'suwayomi',
    version: 'integrated-headless-v1',
    state: 'stopped',
    healthy: false,
    port: 45678,
    startedAt: null,
    lastError: '',
    needsAttention: false,
    baseUrl: 'http://127.0.0.1:45678'
  };

  delete require.cache[runtimePath];
  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: {
      getUserDataStoreDir: () => userDataStoreDir,
      getCacheDir: () => cacheDir
    }
  };
  require.cache[suwayomiRuntimePath] = {
    id: suwayomiRuntimePath,
    filename: suwayomiRuntimePath,
    loaded: true,
    exports: {
      RUNTIME_KIND: 'suwayomi',
      RUNTIME_VERSION: 'integrated-headless-v1',
      getRuntimeStatus: () => ({ ...runtimeStatus }),
      getRuntimeBaseUrl: () => runtimeStatus.baseUrl,
      resolveRuntimeUrl: (value) => String(value || ''),
      startRuntime: async () => {
        runtimeStatus.state = 'running';
        runtimeStatus.healthy = true;
        runtimeStatus.startedAt = runtimeStatus.startedAt || new Date().toISOString();
        runtimeStatus.lastError = '';
        runtimeStatus.needsAttention = false;
        return { ...runtimeStatus };
      },
      stopRuntime: async () => {
        runtimeStatus.state = 'stopped';
        runtimeStatus.healthy = false;
        return { ...runtimeStatus, port: null };
      },
      resetRuntimeData: async () => {
        runtimeExtensions.splice(0, runtimeExtensions.length);
        runtimeStatus.state = 'stopped';
        runtimeStatus.healthy = false;
        runtimeStatus.lastError = '';
        return { ...runtimeStatus, port: null };
      },
      synchronizeRepositories: async () => ({
        runtime: {
          ...(await require.cache[suwayomiRuntimePath].exports.startRuntime())
        },
        extensions: runtimeExtensions
      }),
      queryExtensions: async () => runtimeExtensions,
      getExtension: async (packageName) => runtimeExtensions.find((entry) => entry.pkgName === packageName) || null,
      installExtension: async (packageName) => {
        const target = runtimeExtensions.find((entry) => entry.pkgName === packageName);
        if (target) target.isInstalled = true;
        return target || null;
      },
      refreshExtension: async (packageName) => runtimeExtensions.find((entry) => entry.pkgName === packageName) || null,
      uninstallExtension: async (packageName) => {
        const target = runtimeExtensions.find((entry) => entry.pkgName === packageName);
        if (target) target.isInstalled = false;
        return target || null;
      },
      getSource: async () => null,
      searchSourceManga: async () => ({ mangas: [], hasNextPage: false }),
      getManga: async () => null,
      fetchChapters: async () => [],
      fetchChapterPages: async () => [],
      updateSourcePreference: async () => [],
      applySettings: async () => null,
      __runtimeExtensions: runtimeExtensions
    }
  };

  return {
    sourceRuntime: require('../electron/services/sourceRuntime.cjs'),
    userDataStoreDir,
    runtimeExtensions
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete require.cache[runtimePath];
  delete require.cache[storagePath];
  delete require.cache[suwayomiRuntimePath];
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('source runtime state', () => {
  it('bootstraps the bundled repository once and installs the default extension', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-sources-'));
    tempDirs.push(baseDir);
    const { sourceRuntime, userDataStoreDir } = loadSourceRuntime(baseDir);

    const started = await sourceRuntime.startRuntime();
    const persisted = JSON.parse(
      fs.readFileSync(path.join(userDataStoreDir, 'sources.json'), 'utf8')
    );
    const bundledRepositories = persisted.repositories.filter(
      (repository) => repository.url === sourceRuntime.BUNDLED_REPOSITORY_URL
    );

    expect(started.runtime.state).toBe('running');
    expect(bundledRepositories).toHaveLength(1);
    expect(started.extensions.some(
      (extension) => extension.id === sourceRuntime.DEFAULT_EXTENSION_ID && extension.installed
    )).toBe(true);
    expect(sourceRuntime.listConnectors({ ui: { allowNsfwSources: false } }).some(
      (connector) => connector.extensionId === sourceRuntime.DEFAULT_EXTENSION_ID
    )).toBe(true);
  });

  it('stores connector prefs and import provenance in JSON truth', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-sources-'));
    tempDirs.push(baseDir);
    const { sourceRuntime, userDataStoreDir } = loadSourceRuntime(baseDir);

    await sourceRuntime.startRuntime();
    sourceRuntime.addRepository({
      id: 'repo-test',
      name: 'Depot test',
      url: 'https://example.test/catalog.json',
      trusted: true
    });

    const connectorId = sourceRuntime.listConnectors({ ui: { allowNsfwSources: false } })[0]?.id;
    expect(connectorId).toBeTruthy();

    sourceRuntime.setConnectorPrefs(connectorId, { quality: 'data', language: 'fr' });
    sourceRuntime.recordImportHistory({
      repoId: sourceRuntime.BUNDLED_REPOSITORY_ID,
      extensionId: sourceRuntime.DEFAULT_EXTENSION_ID,
      connectorId,
      sourceId: 'mangadex',
      seriesId: 'serie-1',
      chapterId: 'chapitre-1',
      destinationCategoryId: 'cat-test',
      localPath: 'C:\\bibliotheque\\Serie 1\\Chapitre 1'
    });

    const persisted = JSON.parse(
      fs.readFileSync(path.join(userDataStoreDir, 'sources.json'), 'utf8')
    );

    expect(persisted.connectorPrefs[connectorId]).toEqual({ quality: 'data', language: 'fr' });
    expect(persisted.repositories.some((repository) => repository.id === 'repo-test')).toBe(true);
    expect(persisted.importHistory).toHaveLength(1);
    expect(sourceRuntime.hasImportedChapter({
      connectorId,
      sourceId: 'mangadex',
      seriesId: 'serie-1',
      chapterId: 'chapitre-1',
      destinationCategoryId: 'cat-test'
    })).toBe(true);
  });

  it('rebuilds a source-web link from import history for older imported folders', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-sources-'));
    tempDirs.push(baseDir);
    const { sourceRuntime } = loadSourceRuntime(baseDir);

    await sourceRuntime.startRuntime();
    const connectorId = sourceRuntime.listConnectors({ ui: { allowNsfwSources: false } })[0]?.id;
    expect(connectorId).toBeTruthy();

    sourceRuntime.recordImportHistory({
      repoId: sourceRuntime.BUNDLED_REPOSITORY_ID,
      extensionId: sourceRuntime.DEFAULT_EXTENSION_ID,
      connectorId,
      sourceId: 'mangadex',
      seriesId: 'serie-legacy',
      chapterId: 'chapitre-legacy-1',
      destinationCategoryId: 'cat-web',
      importedAt: '2026-04-22T08:30:00.000Z',
      localPath: 'C:\\bibliotheque\\Serie Legacy\\Chapitre 01'
    });

    sourceRuntime.reconcileSeriesLinksWithLibrary([
      {
        id: 'manga-legacy',
        contentId: 'content-legacy',
        path: 'C:\\bibliotheque\\Serie Legacy',
        displayTitle: 'Serie Legacy',
        categoryId: 'cat-web'
      }
    ]);

    const link = sourceRuntime.getSeriesLinkForManga({
      id: 'manga-legacy',
      contentId: 'content-legacy',
      path: 'C:\\bibliotheque\\Serie Legacy'
    });

    expect(link).toBeTruthy();
    expect(link.connectorId).toBe(connectorId);
    expect(link.seriesId).toBe('serie-legacy');
    expect(link.importedChapterIds).toContain('chapitre-legacy-1');
    expect(link.localSeriesPath).toBe('C:\\bibliotheque\\Serie Legacy');
  });

  it('parses a Mihon index repository into installable extensions and sources', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-sources-'));
    tempDirs.push(baseDir);
    const { sourceRuntime, runtimeExtensions } = loadSourceRuntime(baseDir);

    const repoUrl = 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json';
    const repoMetaUrl = 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/repo.json';
    const repoMeta = {
      name: 'Keiyoushi',
      baseUrl: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/'
    };
    const repoIndex = [
      {
        name: 'Tachiyomi: MangaDex',
        pkg: 'eu.kanade.tachiyomi.extension.all.mangadex',
        apk: 'apk/tachiyomi-all.mangadex-v1.4.203.apk',
        lang: 'all',
        code: 203,
        version: '1.4.203',
        sources: [
          {
            name: 'MangaDex',
            lang: 'en',
            id: '2499283573021220255',
            baseUrl: 'https://mangadex.org',
            versionId: 1
          }
        ]
      }
    ];

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const normalizedUrl = String(url);
      if (normalizedUrl === repoMetaUrl) {
        return {
          ok: true,
          json: async () => repoMeta
        };
      }
      if (normalizedUrl === repoUrl) {
        return {
          ok: true,
          json: async () => repoIndex
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    }));

    await sourceRuntime.startRuntime({ ensureDefaultExtension: false });
    sourceRuntime.addRepository({
      id: 'repo-keiyoushi',
      name: 'Depot tiers',
      url: repoUrl,
      trusted: true
    });

    const syncResult = await sourceRuntime.syncRepositories();
    const repository = syncResult.repositories.find((entry) => entry.id === 'repo-keiyoushi');
    const catalogEntry = syncResult.extensions.find((entry) => entry.id === 'eu.kanade.tachiyomi.extension.all.mangadex');

    runtimeExtensions.push({
      pkgName: 'eu.kanade.tachiyomi.extension.all.mangadex',
      name: 'MangaDex',
      lang: 'all',
      versionName: '1.4.203',
      versionCode: 203,
      isInstalled: false,
      isNsfw: false,
      iconUrl: '',
      source: {
        nodes: [
          {
            id: '2499283573021220255',
            name: 'MangaDex',
            displayName: 'MangaDex',
            lang: 'en',
            iconUrl: '',
            isNsfw: false,
            isConfigurable: false,
            supportsLatest: true
          }
        ]
      }
    });
    await sourceRuntime.syncRepositories();

    expect(repository?.status).toBe('ready');
    expect(repository?.name).toBe('Keiyoushi');
    expect(catalogEntry?.displayName).toBe('MangaDex');
    expect(catalogEntry?.compatibleSourceCount).toBe(1);
    expect(catalogEntry?.connectors[0]?.sourceId).toBe('2499283573021220255');

    await sourceRuntime.installExtension('eu.kanade.tachiyomi.extension.all.mangadex');
    const connectors = sourceRuntime.listConnectors({ ui: { allowNsfwSources: true } });

    expect(connectors.some((connector) => (
      connector.extensionId === 'eu.kanade.tachiyomi.extension.all.mangadex'
      && connector.sourceId === '2499283573021220255'
      && connector.availability === 'available'
    ))).toBe(true);
  });

  it('derives a usable source id when the Mihon catalog omits source.id', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-sources-'));
    tempDirs.push(baseDir);
    const { sourceRuntime } = loadSourceRuntime(baseDir);

    const repoUrl = 'https://raw.githubusercontent.com/test/extensions/repo/index.min.json';
    const repoMetaUrl = 'https://raw.githubusercontent.com/test/extensions/repo/repo.json';

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const normalizedUrl = String(url);
      if (normalizedUrl === repoMetaUrl) {
        return {
          ok: true,
          json: async () => ({
            name: 'Test Repo',
            baseUrl: 'https://raw.githubusercontent.com/test/extensions/repo/'
          })
        };
      }
      if (normalizedUrl === repoUrl) {
        return {
          ok: true,
          json: async () => ([
            {
              name: 'Tachiyomi: 1Manga.co',
              pkg: 'eu.kanade.tachiyomi.extension.en.onemangaco',
              apk: 'apk/tachiyomi-en.onemangaco-v1.0.0.apk',
              lang: 'en',
              code: 1,
              version: '1.0.0',
              sources: [
                {
                  name: 'Asura Scans',
                  lang: 'en',
                  baseUrl: 'https://asurascans.com',
                  versionId: 1
                }
              ]
            }
          ])
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    }));

    await sourceRuntime.startRuntime({ ensureDefaultExtension: false });
    sourceRuntime.addRepository({
      id: 'repo-missing-source-id',
      name: 'Depot test',
      url: repoUrl,
      trusted: true
    });

    const syncResult = await sourceRuntime.syncRepositories();
    const catalogEntry = syncResult.extensions.find((entry) => entry.id === 'eu.kanade.tachiyomi.extension.en.onemangaco');

    expect(catalogEntry?.sourceCount).toBe(1);
    expect(catalogEntry?.compatibleSourceCount).toBe(1);
    expect(catalogEntry?.connectors[0]?.sourceId).toContain('eu.kanade.tachiyomi.extension.en.onemangaco');
  });

  it('preserves installable catalog sources when Suwayomi has not revealed source nodes yet', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-sources-'));
    tempDirs.push(baseDir);
    const { sourceRuntime, runtimeExtensions } = loadSourceRuntime(baseDir);

    const repoUrl = 'https://raw.githubusercontent.com/test/extensions/repo/index.min.json';
    const repoMetaUrl = 'https://raw.githubusercontent.com/test/extensions/repo/repo.json';

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const normalizedUrl = String(url);
      if (normalizedUrl === repoMetaUrl) {
        return {
          ok: true,
          json: async () => ({
            name: 'Test Repo',
            baseUrl: 'https://raw.githubusercontent.com/test/extensions/repo/'
          })
        };
      }
      if (normalizedUrl === repoUrl) {
        return {
          ok: true,
          json: async () => ([
            {
              name: 'Tachiyomi: 1Manga.co',
              pkg: 'eu.kanade.tachiyomi.extension.en.onemangaco',
              apk: 'apk/tachiyomi-en.onemangaco-v1.0.0.apk',
              lang: 'en',
              code: 1,
              version: '1.0.0'
            }
          ])
        };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({})
      };
    }));

    runtimeExtensions.push({
      pkgName: 'eu.kanade.tachiyomi.extension.en.onemangaco',
      name: '1Manga.co',
      lang: 'en',
      versionName: '1.0.0',
      versionCode: 1,
      isInstalled: false,
      isNsfw: false,
      iconUrl: '',
      source: {
        nodes: []
      }
    });

    await sourceRuntime.startRuntime({ ensureDefaultExtension: false });
    sourceRuntime.addRepository({
      id: 'repo-runtime-empty-source-nodes',
      name: 'Depot test',
      url: repoUrl,
      trusted: true
    });

    const syncResult = await sourceRuntime.syncRepositories();
    const catalogEntry = syncResult.extensions.find((entry) => entry.id === 'eu.kanade.tachiyomi.extension.en.onemangaco');

    expect(catalogEntry?.sourceCount).toBe(1);
    expect(catalogEntry?.compatibleSourceCount).toBe(1);
    expect(catalogEntry?.status).not.toBe('incompatible');
  });
});
