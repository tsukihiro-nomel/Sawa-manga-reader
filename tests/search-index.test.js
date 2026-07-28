import { describe, expect, it } from 'vitest';
import {
  buildCompactSearchIndex,
  getSearchSuggestions,
  mergeSuggestionIntoQuery,
  normalizeSearchText,
  searchCompactIndex
} from '../src/utils/searchIndex.js';

const mangas = [
  {
    id: 'exact',
    displayTitle: 'Éden',
    aliases: ['Eden: It is an Endless World!'],
    author: 'Hiroki Endo',
    tags: [{ name: 'Science-fiction' }],
    collectionIds: ['seinen']
  },
  {
    id: 'prefix',
    displayTitle: 'Eden of the East',
    author: 'Kenji Kamiyama',
    tags: [{ name: 'Thriller' }]
  },
  {
    id: 'alias',
    displayTitle: 'Shingeki no Kyojin',
    aliases: ['Attack on Titan'],
    author: 'Hajime Isayama'
  },
  {
    id: 'author',
    displayTitle: 'Vagabond',
    author: 'Takehiko Inoue',
    isFavorite: true
  },
  {
    id: 'private',
    displayTitle: 'Secret Eden',
    isPrivate: true
  }
];

const context = {
  collectionsById: { seinen: { id: 'seinen', name: 'Grands seinen' } },
  tags: [{ name: 'Historique' }]
};

describe('compact search index', () => {
  const index = buildCompactSearchIndex(mangas, context);

  it('normalizes accents/case and ranks exact, prefix, alias then other fields', () => {
    expect(normalizeSearchText('ÉDÈN')).toBe('eden');
    expect(searchCompactIndex(index, { query: 'eden' }).map((result) => result.id))
      .toEqual(['exact', 'prefix']);
    expect(searchCompactIndex(index, { query: 'Attack Titan' })[0].id).toBe('alias');
    expect(searchCompactIndex(index, { query: 'Inoue' })[0].id).toBe('author');
  });

  it('accepts one light typo and applies advanced plus visual filters', () => {
    expect(searchCompactIndex(index, { query: 'Vagabod' })[0].id).toBe('author');
    expect(searchCompactIndex(index, {
      query: 'favorite:true',
      filters: [{ field: 'author', value: 'inoue' }]
    }).map((result) => result.id)).toEqual(['author']);
  });

  it('honors scope and never includes private entries unless explicitly allowed', () => {
    expect(searchCompactIndex(index, { query: 'secret' })).toEqual([]);
    expect(searchCompactIndex(index, { query: 'secret', includePrivate: true })[0].id).toBe('private');
    expect(searchCompactIndex(index, {
      query: '',
      scopeIds: new Set(['prefix'])
    }).map((result) => result.id)).toEqual(['prefix']);
  });

  it('never derives tag or collection facets from private or out-of-scope entries', () => {
    const privacyIndex = buildCompactSearchIndex([
      {
        id: 'public',
        displayTitle: 'Public',
        tags: [{ name: 'VisibleTag' }],
        collectionIds: ['visible']
      },
      {
        id: 'secret',
        displayTitle: 'Secret',
        isPrivate: true,
        tags: [{ name: 'SecretTag' }],
        collectionIds: ['secret']
      }
    ], {
      collectionsById: {
        visible: { id: 'visible', name: 'VisibleCollection' },
        secret: { id: 'secret', name: 'SecretCollection' }
      },
      tags: [{ name: 'GloballyKnownButInvisible' }]
    });
    expect(getSearchSuggestions(privacyIndex, 'secret', {
      includePrivate: false
    })).toEqual([]);
    expect(getSearchSuggestions(privacyIndex, 'visible', {
      scopeIds: new Set(['secret']),
      includePrivate: false
    })).toEqual([]);
    expect(JSON.stringify(getSearchSuggestions(privacyIndex, 'secret', {
      includePrivate: true,
      scopeIds: new Set(['secret'])
    }))).toContain('SecretTag');
  });

  it('groups, highlights and caps local suggestions at eight', () => {
    const suggestions = getSearchSuggestions(index, 'ed', { limit: 8 });
    expect(suggestions.length).toBeLessThanOrEqual(8);
    expect(suggestions[0]).toMatchObject({ group: 'manga', label: 'Éden' });
    expect(suggestions[0].highlight).toHaveLength(1);
    expect(getSearchSuggestions(index, 'attack')[0]).toMatchObject({
      group: 'manga',
      label: 'Attack on Titan',
      secondary: 'Shingeki no Kyojin'
    });
    expect(mergeSuggestionIntoQuery('', {
      group: 'author',
      token: 'author:"Hiroki Endo"'
    })).toBe('author:"Hiroki Endo"');
    expect(getSearchSuggestions(index, 'ed', {
      scopeIds: new Set(['prefix'])
    }).map((item) => item.mangaId).filter(Boolean)).toEqual(['prefix']);
  });

  it('uses deferred extended ids only as a low-ranked fallback', () => {
    expect(searchCompactIndex(index, {
      query: 'annotation-only',
      extendedIds: new Set(['author'])
    })).toEqual([expect.objectContaining({ id: 'author', match: 'extended' })]);
  });

  it('meets the 100ms p95 contract on a representative 499-item index', () => {
    const sample = Array.from({ length: 499 }, (_, indexValue) => ({
      id: `m-${indexValue}`,
      displayTitle: `Chronique numero ${indexValue}`,
      aliases: [`Saga ${indexValue}`],
      author: `Auteur ${indexValue % 27}`,
      tags: [{ name: indexValue % 2 ? 'Action' : 'Drame' }]
    }));
    const benchmarkIndex = buildCompactSearchIndex(sample);
    const durations = [];
    for (let run = 0; run < 40; run += 1) {
      const startedAt = performance.now();
      searchCompactIndex(benchmarkIndex, { query: `Chronque ${run % 499}` });
      getSearchSuggestions(benchmarkIndex, 'chr', { limit: 8 });
      durations.push(performance.now() - startedAt);
    }
    durations.sort((a, b) => a - b);
    expect(durations[Math.floor(durations.length * 0.95)]).toBeLessThanOrEqual(100);
  });
});
