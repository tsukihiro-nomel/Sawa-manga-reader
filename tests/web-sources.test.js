import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const webSourcesPath = require.resolve('../electron/services/webSources.cjs');
const sourceRuntimePath = require.resolve('../electron/services/sourceRuntime.cjs');
const pluginsPath = require.resolve('../electron/services/plugins.cjs');
const suwayomiRuntimePath = require.resolve('../electron/services/suwayomiRuntime.cjs');

function loadWebSources({ connector, searchImpl }) {
  delete require.cache[webSourcesPath];
  require.cache[sourceRuntimePath] = {
    id: sourceRuntimePath,
    filename: sourceRuntimePath,
    loaded: true,
    exports: {
      SOURCE_PLUGIN_ID: 'sources-web',
      getSourceRuntimeImportsDir: () => 'C:\\imports',
      startRuntime: async () => ({ runtime: { state: 'running' } }),
      listConnectors: () => [connector],
      resolveConnector: (connectorId) => (connectorId === connector.id ? connector : null),
      getConnectorPrefs: () => ({}),
      setConnectorPrefs: () => ({}),
      markRuntimeSelection: () => {},
      hasImportedChapter: () => false,
      recordImportHistory: () => {},
      upsertSeriesLinkFromImport: () => {},
      getSeriesLinkForManga: () => null,
      getImportedChapterIdsForSeries: () => [],
      markSeriesRecent: () => {}
    }
  };
  require.cache[pluginsPath] = {
    id: pluginsPath,
    filename: pluginsPath,
    loaded: true,
    exports: {
      listAvailablePlugins: () => ([
        {
          id: 'sources-web',
          installed: true,
          enabled: true
        }
      ])
    }
  };
  require.cache[suwayomiRuntimePath] = {
    id: suwayomiRuntimePath,
    filename: suwayomiRuntimePath,
    loaded: true,
    exports: {
      searchSourceManga: searchImpl,
      resolveRuntimeUrl: (value) => String(value || '')
    }
  };
  return require('../electron/services/webSources.cjs');
}

afterEach(() => {
  delete require.cache[webSourcesPath];
  delete require.cache[sourceRuntimePath];
  delete require.cache[pluginsPath];
  delete require.cache[suwayomiRuntimePath];
});

describe('web sources search', () => {
  it('falls back to browse pages when the direct source search returns nothing', async () => {
    const calls = [];
    const connector = {
      id: 'connector-asura',
      runtimeKind: 'suwayomi',
      sourceId: '987654321',
      displayName: 'Asura Scans',
      language: 'en',
      availability: 'available'
    };
    const webSources = loadWebSources({
      connector,
      searchImpl: async ({ type, query, page }) => {
        calls.push({ type, query, page });
        if (type === 'SEARCH') {
          return { mangas: [], hasNextPage: false };
        }
        if (type === 'POPULAR' && page === 0) {
          return {
            mangas: [
              {
                id: '42',
                title: 'Asura Rising',
                thumbnailUrl: 'https://example.test/asura.jpg',
                description: 'Serie test',
                author: 'Auteur',
                artist: '',
                status: 'ONGOING',
                realUrl: 'https://example.test/asura',
                sourceId: connector.sourceId
              }
            ],
            hasNextPage: false
          };
        }
        return { mangas: [], hasNextPage: false };
      }
    });

    const results = await webSources.searchSourceSeries({
      state: {},
      connectorId: connector.id,
      query: 'asura',
      limit: 12
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Asura Rising');
    expect(calls.find((entry) => entry.type === 'POPULAR')?.query).toBe('');
  });

  it('keeps browsing when the search endpoint throws for a source', async () => {
    const connector = {
      id: 'connector-utoon',
      runtimeKind: 'suwayomi',
      sourceId: '123456789',
      displayName: 'Utoon',
      language: 'en',
      availability: 'available'
    };
    const webSources = loadWebSources({
      connector,
      searchImpl: async ({ type }) => {
        if (type === 'SEARCH') {
          throw new Error('search indisponible');
        }
        if (type === 'LATEST') {
          return {
            mangas: [
              {
                id: '99',
                title: 'Star Hunter',
                thumbnailUrl: '',
                description: 'Une serie test',
                author: '',
                artist: '',
                status: 'ONGOING',
                realUrl: '',
                sourceId: connector.sourceId
              }
            ],
            hasNextPage: false
          };
        }
        return { mangas: [], hasNextPage: false };
      }
    });

    const results = await webSources.searchSourceSeries({
      state: {},
      connectorId: connector.id,
      query: 'star',
      limit: 12
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Star Hunter');
  });
});
