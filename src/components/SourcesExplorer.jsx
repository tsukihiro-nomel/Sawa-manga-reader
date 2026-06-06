import {
  memo,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  CheckIcon,
  DownloadIcon,
  FolderPlusIcon,
  LayersIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon
} from './Icons.jsx';

function formatRelativeTime(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 1) return 'A l instant';
    if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Il y a ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Il y a ${diffDays} j`;
    return date.toLocaleDateString('fr-FR');
  } catch (_error) {
    return '';
  }
}

function buildMangaReference(manga = {}) {
  return {
    id: manga?.id || manga?.mangaId || '',
    contentId: manga?.contentId || manga?.localContentId || '',
    path: manga?.path || manga?.localSeriesPath || '',
    displayTitle: manga?.displayTitle || manga?.seriesTitle || '',
    sourceWeb: manga?.sourceWeb || null
  };
}

function getSeriesRefKey(value = {}) {
  return [
    value?.connectorId || '',
    value?.seriesId || '',
    value?.localContentId || value?.contentId || '',
    value?.localSeriesPath || value?.path || ''
  ].join('::');
}

function dedupeSeriesEntries(entries = []) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const key = getSeriesRefKey(entry);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function annotateChapters(chapters = [], link = null) {
  const importedSet = new Set(Array.isArray(link?.importedChapterIds) ? link.importedChapterIds : []);
  const knownSet = new Set(Array.isArray(link?.lastKnownChapterIds) ? link.lastKnownChapterIds : []);
  return (Array.isArray(chapters) ? chapters : []).map((chapter) => {
    const chapterId = String(chapter?.id || '').trim();
    const imported = importedSet.has(chapterId);
    return {
      ...chapter,
      isImported: imported,
      imported,
      isNew: !imported && (!knownSet.size || knownSet.has(chapterId)),
      selectable: !imported
    };
  });
}

function decorateLinkedSeriesEntry(entry = {}) {
  const imported = new Set(Array.isArray(entry.importedChapterIds) ? entry.importedChapterIds : []);
  const known = Array.isArray(entry.lastKnownChapterIds) ? entry.lastKnownChapterIds : [];
  const newChapterCount = known.filter((chapterId) => !imported.has(chapterId)).length;
  return {
    ...entry,
    importedChapterIds: [...imported],
    lastKnownChapterIds: known,
    newChapterCount,
    statusLabel: newChapterCount > 0 ? 'Nouveaux chapitres disponibles' : 'Suivi web actif'
  };
}

function decorateLinkedSeries(entries = []) {
  return dedupeSeriesEntries(entries).map((entry) => decorateLinkedSeriesEntry(entry));
}

function pickPreferredConnectorId(connectors = [], requestedId = '', fallbackId = '') {
  const safeConnectors = Array.isArray(connectors) ? connectors : [];
  const requested = String(requestedId || '').trim();
  const fallback = String(fallbackId || '').trim();

  if (requested && safeConnectors.some((connector) => connector.id === requested && connector.availability === 'available')) {
    return requested;
  }
  if (fallback && safeConnectors.some((connector) => connector.id === fallback && connector.availability === 'available')) {
    return fallback;
  }
  return safeConnectors.find((connector) => connector.availability === 'available')?.id
    || (requested && safeConnectors.some((connector) => connector.id === requested) ? requested : '')
    || (fallback && safeConnectors.some((connector) => connector.id === fallback) ? fallback : '')
    || safeConnectors[0]?.id
    || '';
}

function WebSourceCover({ title, src }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <div className="sources-cover-fallback">{(title || '?').slice(0, 1).toUpperCase()}</div>;
  }

  return (
    <img
      src={src}
      alt={title}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="thumb-smooth"
      onError={() => setFailed(true)}
    />
  );
}

function ImportStatusBadge({ status }) {
  const normalized = String(status || 'queued').trim();
  const label = normalized === 'running'
    ? 'En cours'
    : normalized === 'done'
      ? 'Termine'
      : normalized === 'failed'
        ? 'Echec'
        : normalized === 'cancelled'
          ? 'Annule'
          : normalized === 'cancel_requested'
            ? 'Annulation'
            : 'En file';
  return <span className={`sources-import-badge sources-import-badge-${normalized}`}>{label}</span>;
}

function VirtualCardList({
  items,
  estimateSize = 96,
  overscan = 6,
  className = '',
  emptyTitle = 'Aucun element',
  emptyBody = '',
  renderItem
}) {
  const shouldVirtualize = items.length > 12;
  const viewportRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => estimateSize,
    overscan,
    measureElement: (element) => element?.getBoundingClientRect().height ?? estimateSize
  });

  if (!shouldVirtualize) {
    return (
      <div className={`sources-virtual-list sources-virtual-list-static ${className}`}>
        {items.length === 0 ? (
          <div className="sources-empty-card">
            <strong>{emptyTitle}</strong>
            {emptyBody ? <span>{emptyBody}</span> : null}
          </div>
        ) : (
          <div className="sources-static-list">
            {items.map((item, index) => (
              <div key={item?.id || item?.seriesId || item?.connectorId || index} className="sources-static-row">
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={viewportRef} className={`sources-virtual-list ${className}`}>
      {items.length === 0 ? (
        <div className="sources-empty-card">
          <strong>{emptyTitle}</strong>
          {emptyBody ? <span>{emptyBody}</span> : null}
        </div>
      ) : (
        <div className="sources-virtual-inner" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                className="sources-virtual-row"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderItem(item, virtualRow.index)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConnectorChip({ connector, active, onSelect }) {
  const availabilityLabel = connector.availability === 'available'
    ? (connector.language || 'multi')
    : 'Indisponible';
  return (
    <button
      type="button"
      className={`sources-connector-chip ${active ? 'active' : ''}`}
      onClick={() => onSelect?.(connector.id)}
      disabled={connector.availability !== 'available'}
      title={connector.availability !== 'available' ? (connector.error || 'Source indisponible') : connector.displayName}
    >
      <div className="sources-connector-copy">
        <strong>{connector.displayName}</strong>
        <span>{connector.sourceLabel || 'Source web'}</span>
      </div>
      <span className={`sources-connector-pill ${connector.availability !== 'available' ? 'muted' : ''}`}>
        {availabilityLabel}
      </span>
    </button>
  );
}

function LinkedSeriesCard({ entry, active, onOpen }) {
  const statusLabel = entry?.newChapterCount > 0
    ? `${entry.newChapterCount} nouveau${entry.newChapterCount > 1 ? 'x' : ''}`
    : (entry?.sourceLabel || 'Source web');

  return (
    <button type="button" className={`sources-linked-card ${active ? 'active' : ''}`} onClick={() => onOpen?.(entry)}>
      <div className="sources-linked-cover">
        <WebSourceCover title={entry.seriesTitle} src={entry.coverUrl} />
      </div>
      <div className="sources-linked-copy">
        <strong>{entry.seriesTitle || 'Serie liee'}</strong>
        <span>{statusLabel}</span>
        <small>{formatRelativeTime(entry.lastImportedAt || entry.updatedAt || entry.lastCheckedAt)}</small>
      </div>
    </button>
  );
}

function SeriesResultCard({ result, active, onSelect }) {
  return (
    <button type="button" className={`sources-result-card ${active ? 'active' : ''}`} onClick={() => onSelect?.(result)}>
      <div className="sources-result-cover">
        <WebSourceCover title={result.title} src={result.coverPreviewSrc || result.coverUrl} />
      </div>
      <div className="sources-result-copy">
        <strong>{result.title}</strong>
        <span>{result.subtitle || result.sourceLabel || 'Serie'}</span>
        <p>{(result.description || 'Aucun resume disponible.').slice(0, 180)}{result.description && result.description.length > 180 ? '...' : ''}</p>
      </div>
    </button>
  );
}

function ChapterRow({ chapter, checked, onToggle }) {
  const rawMeta = String(chapter?.meta || '').trim();
  const metaText = rawMeta && !/invalid\s+date/i.test(rawMeta) ? rawMeta : '';
  return (
    <label className={`sources-chapter-row ${checked ? 'active' : ''} ${chapter.isImported ? 'is-imported' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!chapter.selectable}
        onChange={() => onToggle?.(chapter.id)}
      />
      <div className="sources-chapter-copy">
        <strong>{chapter.label}</strong>
        {metaText ? <span>{metaText}</span> : null}
      </div>
      <div className="sources-chapter-flags">
        {chapter.isImported ? <span className="sources-flag sources-flag-muted">Deja importe</span> : null}
        {!chapter.isImported && chapter.isNew ? <span className="sources-flag sources-flag-fresh">Nouveau</span> : null}
      </div>
    </label>
  );
}

function ImportRow({ job, onCancel }) {
  return (
    <div className="sources-import-row">
      <div className="sources-import-copy">
        <strong>{job.seriesTitle || 'Import web'}</strong>
        <span>{job.connectorName || 'Source web'} · {job.progressLabel || 'Preparation'}</span>
      </div>
      <div className="sources-import-actions">
        <ImportStatusBadge status={job.status} />
        {(job.status === 'queued' || job.status === 'running') ? (
          <button type="button" className="ghost-button" onClick={() => onCancel?.(job.id)}>
            <TrashIcon size={14} /> Annuler
          </button>
        ) : null}
      </div>
    </div>
  );
}

const EMPTY_CONNECTORS = [];
const EMPTY_SERIES = [];
const EMPTY_JOBS = [];

function SourcesExplorer({
  categories = [],
  defaultCategoryId = '',
  initialContext = null,
  initialRecentSeries = [],
  initialLinkedSeries = [],
  onImported
}) {
  const [runtime, setRuntime] = useState(null);
  const [connectors, setConnectors] = useState(EMPTY_CONNECTORS);
  const [linkedSeries, setLinkedSeries] = useState(() => decorateLinkedSeries(initialLinkedSeries));
  const [recentSeries, setRecentSeries] = useState(() => dedupeSeriesEntries(initialRecentSeries));
  const [connectorId, setConnectorId] = useState('');
  const [connectorFilter, setConnectorFilter] = useState('');
  const [query, setQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [results, setResults] = useState(EMPTY_SERIES);
  const [activeSeriesId, setActiveSeriesId] = useState('');
  const [activeSeries, setActiveSeries] = useState(null);
  const [activeLink, setActiveLink] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState([]);
  const [chapterFilter, setChapterFilter] = useState('missing');
  const [destinationCategoryId, setDestinationCategoryId] = useState(defaultCategoryId || categories[0]?.id || '');
  const [imports, setImports] = useState(EMPTY_JOBS);
  const [lastImportedJobId, setLastImportedJobId] = useState('');
  const [railTab, setRailTab] = useState('connectors');
  const lastContextKeyRef = useRef('');

  const deferredConnectorFilter = useDeferredValue(connectorFilter);
  const deferredResults = useDeferredValue(results);

  useEffect(() => {
    setLinkedSeries(decorateLinkedSeries(initialLinkedSeries));
  }, [initialLinkedSeries]);

  useEffect(() => {
    setRecentSeries((current) => {
      const merged = dedupeSeriesEntries([...current, ...initialRecentSeries]);
      return merged.slice(0, 16);
    });
  }, [initialRecentSeries]);

  useEffect(() => {
    if (!defaultCategoryId && destinationCategoryId) return;
    setDestinationCategoryId(defaultCategoryId || categories[0]?.id || '');
  }, [categories, defaultCategoryId, destinationCategoryId]);

  const effectiveConnectorId = useMemo(
    () => pickPreferredConnectorId(connectors, connectorId),
    [connectors, connectorId]
  );

  const activeConnector = useMemo(
    () => connectors.find((connector) => connector.id === effectiveConnectorId) || null,
    [connectors, effectiveConnectorId]
  );

  const visibleConnectors = useMemo(() => {
    const needle = String(deferredConnectorFilter || '').trim().toLowerCase();
    if (!needle) return connectors;
    return connectors.filter((connector) => (
      String(connector.displayName || '').toLowerCase().includes(needle)
      || String(connector.language || '').toLowerCase().includes(needle)
      || String(connector.sourceLabel || '').toLowerCase().includes(needle)
    ));
  }, [connectors, deferredConnectorFilter]);
  const availableConnectorCount = useMemo(
    () => connectors.filter((connector) => connector.availability === 'available').length,
    [connectors]
  );

  const linkedByRemoteKey = useMemo(() => {
    const map = new Map();
    linkedSeries.forEach((entry) => {
      const key = `${entry.connectorId || ''}::${entry.seriesId || ''}`;
      if (key !== '::') map.set(key, entry);
    });
    return map;
  }, [linkedSeries]);

  const visibleChapters = useMemo(() => {
    const items = Array.isArray(chapters) ? chapters : [];
    if (chapterFilter === 'all') return items;
    return items.filter((chapter) => !chapter.isImported);
  }, [chapters, chapterFilter]);

  const importsSummary = useMemo(
    () => (Array.isArray(imports) ? imports.slice(0, 6) : []),
    [imports]
  );

  const selectionCount = selectedChapterIds.length;

  useEffect(() => {
    if (!connectors.length) {
      if (connectorId) setConnectorId('');
      return;
    }
    if (effectiveConnectorId && connectorId !== effectiveConnectorId) {
      setConnectorId(effectiveConnectorId);
    }
  }, [connectors, connectorId, effectiveConnectorId]);

  useEffect(() => {
    if (!activeLink?.connectorId || !activeLink?.seriesId) return;
    const fresh = linkedByRemoteKey.get(`${activeLink.connectorId}::${activeLink.seriesId}`);
    if (!fresh) return;
    setActiveLink((current) => {
      if (!current || current.connectorId !== fresh.connectorId || current.seriesId !== fresh.seriesId) {
        return current;
      }
      const next = {
        ...fresh,
        ...current,
        importedChapterIds: current.importedChapterIds || fresh.importedChapterIds,
        lastKnownChapterIds: current.lastKnownChapterIds || fresh.lastKnownChapterIds
      };
      const unchanged = (
        current.newChapterCount === next.newChapterCount
        && current.statusLabel === next.statusLabel
        && current.lastImportedAt === next.lastImportedAt
        && current.lastCheckedAt === next.lastCheckedAt
      );
      return unchanged ? current : next;
    });
  }, [linkedByRemoteKey, activeLink]);

  function rememberRecent(entry = {}) {
    const normalized = {
      connectorId: entry.connectorId || '',
      seriesId: entry.seriesId || entry.id || '',
      seriesTitle: entry.seriesTitle || entry.title || '',
      sourceLabel: entry.sourceLabel || entry.connectorName || activeConnector?.displayName || '',
      coverUrl: entry.coverUrl || entry.coverPreviewSrc || '',
      localContentId: entry.localContentId || '',
      localSeriesPath: entry.localSeriesPath || '',
      lastOpenedAt: new Date().toISOString()
    };
    if (!normalized.connectorId || !normalized.seriesId) return;
    setRecentSeries((current) => dedupeSeriesEntries([normalized, ...current]).slice(0, 16));
  }

  async function refreshConnectors() {
    const result = await window.mangaAPI.listSourceConnectors();
    const nextConnectors = Array.isArray(result?.connectors) ? result.connectors : [];
    setRuntime(result?.runtime || null);
    setConnectors(nextConnectors);
    setConnectorId((current) => pickPreferredConnectorId(nextConnectors, current, result?.lastConnectorId));
    if (!defaultCategoryId && result?.lastCategoryId) {
      setDestinationCategoryId((current) => current || result.lastCategoryId);
    }
  }

  async function refreshLinkedSeries() {
    try {
      const result = await window.mangaAPI.listLinkedSourceSeries();
      startTransition(() => {
        setLinkedSeries(decorateLinkedSeries(result?.series || []));
      });
    } catch (_error) {
      // Keep previous local state.
    }
  }

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        await Promise.all([refreshConnectors(), refreshLinkedSeries()]);
      } catch (error) {
        if (!disposed) {
          setSearchError(error?.message || 'Impossible de charger le hub Sources web.');
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSeriesId) return;
    if (deferredResults.some((result) => result.id === activeSeriesId)) return;
    if (activeSeries?.id === activeSeriesId) return;
    setActiveSeriesId('');
  }, [deferredResults, activeSeriesId, activeSeries]);

  useEffect(() => {
    let disposed = false;
    let timerId = null;

    const clearTimer = () => {
      if (timerId) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleNextPoll = (delay) => {
      clearTimer();
      timerId = window.setTimeout(poll, delay);
    };

    const poll = async () => {
      if (document.visibilityState === 'hidden') {
        scheduleNextPoll(30000);
        return;
      }
      try {
        const result = await window.mangaAPI.listSourceImports();
        if (disposed) return;
        const nextImports = Array.isArray(result?.imports) ? result.imports : [];
        startTransition(() => setImports(nextImports));
        const activeJob = nextImports.some((job) => ['queued', 'running', 'cancel_requested'].includes(job.status));
        scheduleNextPoll(activeJob ? 2500 : 30000);
      } catch (_error) {
        if (disposed) return;
        scheduleNextPoll(30000);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    poll();
    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!lastImportedJobId) return;
    const completedJob = imports.find((job) => job.id === lastImportedJobId && ['done', 'failed', 'cancelled'].includes(job.status));
    if (!completedJob) return;
    setLastImportedJobId('');
    if (completedJob.status === 'done') {
      setStatusMessage(`Import termine dans ${completedJob.categoryName || 'la categorie choisie'}.`);
      refreshLinkedSeries();
      onImported?.(completedJob);
    } else if (completedJob.status === 'failed') {
      setStatusMessage(completedJob.error || 'Import web interrompu.');
    } else {
      setStatusMessage('Import annule.');
    }
  }, [imports, lastImportedJobId, onImported]);

  async function openLinkedSeries(linkEntry) {
    if (!linkEntry) return;
    setDetailBusy(true);
    setSearchError('');
    setStatusMessage('');
    try {
      const mangaRef = buildMangaReference(linkEntry);
      const result = await window.mangaAPI.getSourceSeriesChaptersForManga(mangaRef);
      if (!result?.ok) throw new Error(result?.error || 'Serie web introuvable.');
      const nextLink = {
        ...(linkedByRemoteKey.get(`${result?.connector?.id || linkEntry.connectorId || ''}::${result?.series?.id || linkEntry.seriesId || ''}`) || {}),
        ...(result.link || {}),
        ...(linkEntry || {})
      };
      setConnectorId(result?.connector?.id || nextLink.connectorId || '');
      setActiveSeriesId(result?.series?.id || nextLink.seriesId || '');
      setActiveSeries(result?.series || null);
      setActiveLink(nextLink);
      setChapters(Array.isArray(result?.chapters) ? result.chapters : []);
      setSelectedChapterIds([]);
      setQuery(result?.series?.title || linkEntry.seriesTitle || '');
      rememberRecent({
        connectorId: nextLink.connectorId,
        seriesId: nextLink.seriesId,
        seriesTitle: nextLink.seriesTitle || result?.series?.title,
        sourceLabel: nextLink.sourceLabel || result?.connector?.displayName,
        coverUrl: nextLink.coverUrl || result?.series?.coverUrl,
        localContentId: nextLink.localContentId,
        localSeriesPath: nextLink.localSeriesPath
      });
    } catch (error) {
      setSearchError(error?.message || 'Impossible de reprendre cette serie.');
    } finally {
      setDetailBusy(false);
    }
  }

  async function openSearchSeries(result, requestedConnectorId = effectiveConnectorId) {
    if (!result?.id || !requestedConnectorId) return;
    setDetailBusy(true);
    setSearchError('');
    setStatusMessage('');
    try {
      const matchingLink = linkedByRemoteKey.get(`${requestedConnectorId}::${result.id}`) || null;
      if (matchingLink?.localContentId || matchingLink?.localSeriesPath || matchingLink?.localMangaId) {
        await openLinkedSeries(matchingLink);
        return;
      }

      const [seriesResult, chaptersResult] = await Promise.all([
        window.mangaAPI.getSourceSeries({ connectorId: requestedConnectorId, seriesId: result.id }),
        window.mangaAPI.getSourceChapters({ connectorId: requestedConnectorId, seriesId: result.id })
      ]);
      if (!seriesResult?.ok) throw new Error(seriesResult?.error || 'Serie introuvable.');
      if (!chaptersResult?.ok) throw new Error(chaptersResult?.error || 'Chapitres introuvables.');

      const nextLink = linkedByRemoteKey.get(`${requestedConnectorId}::${result.id}`) || null;
      const nextSeries = seriesResult.series || result;
      setActiveSeriesId(result.id);
      setActiveSeries(nextSeries);
      setActiveLink(nextLink);
      setChapters(annotateChapters(chaptersResult?.chapters || [], nextLink));
      setSelectedChapterIds([]);
      setConnectorId(requestedConnectorId);
      rememberRecent({
        connectorId: requestedConnectorId,
        seriesId: result.id,
        seriesTitle: nextSeries?.title || result.title,
        sourceLabel: connectors.find((connector) => connector.id === requestedConnectorId)?.displayName || activeConnector?.displayName,
        coverUrl: nextSeries?.coverUrl || result.coverUrl
      });
    } catch (error) {
      setSearchError(error?.message || 'Impossible de charger cette serie.');
    } finally {
      setDetailBusy(false);
    }
  }

  useEffect(() => {
    const manga = initialContext?.manga;
    if (!manga) return;
    const key = [
      manga?.contentId || '',
      manga?.id || '',
      manga?.path || '',
      initialContext?.requestedAt || ''
    ].join('::');
    if (!key || key === lastContextKeyRef.current) return;
    lastContextKeyRef.current = key;
    openLinkedSeries(manga);
  }, [initialContext, linkedByRemoteKey]);

  async function runSearch() {
    const nextConnectorId = pickPreferredConnectorId(connectors, connectorId);
    const nextQuery = query.trim();
    const nextConnector = connectors.find((connector) => connector.id === nextConnectorId) || null;
    if (!nextConnectorId || !nextQuery || nextConnector?.availability !== 'available') return;
    setSearchBusy(true);
    setSearchError('');
    setStatusMessage('');
    try {
      const result = await window.mangaAPI.searchSourceSeries({ connectorId: nextConnectorId, query: nextQuery, limit: 80 });
      if (!result?.ok) {
        throw new Error(result?.error || 'Recherche impossible.');
      }
      const nextResults = Array.isArray(result?.results) ? result.results : [];
      startTransition(() => {
        setResults(nextResults);
      });
      if (connectorId !== nextConnectorId) {
        setConnectorId(nextConnectorId);
      }
      if (nextResults[0]) {
        openSearchSeries(nextResults[0], nextConnectorId);
      } else {
        setActiveSeriesId('');
        setActiveSeries(null);
        setActiveLink(null);
        setChapters([]);
        setSelectedChapterIds([]);
      }
    } catch (error) {
      setSearchError(error?.message || 'Recherche impossible.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleCheckUpdates() {
    if (!activeLink) return;
    setDetailBusy(true);
    setSearchError('');
    try {
      const result = await window.mangaAPI.checkSourceUpdatesForManga(buildMangaReference({
        id: activeLink.localMangaId,
        contentId: activeLink.localContentId,
        path: activeLink.localSeriesPath
      }));
      if (!result?.ok) throw new Error(result?.error || 'Verification impossible.');
      setActiveLink(result.link || activeLink);
      setChapters(Array.isArray(result?.chapters) ? result.chapters : []);
      setStatusMessage(
        result?.newCount > 0
          ? `${result.newCount} nouveau${result.newCount > 1 ? 'x chapitres' : ' chapitre'} detecte${result.newCount > 1 ? 's' : ''}.`
          : 'Aucun nouveau chapitre detecte.'
      );
      refreshLinkedSeries();
    } catch (error) {
      setSearchError(error?.message || 'Verification impossible.');
    } finally {
      setDetailBusy(false);
    }
  }

  function toggleChapter(chapterId) {
    setSelectedChapterIds((current) => (
      current.includes(chapterId)
        ? current.filter((entry) => entry !== chapterId)
        : [...current, chapterId]
    ));
  }

  function clearSelection() {
    setSelectedChapterIds([]);
  }

  function selectAllVisible() {
    setSelectedChapterIds(visibleChapters.filter((chapter) => chapter.selectable !== false).map((chapter) => chapter.id));
  }

  function selectNewestVisible() {
    const nextIds = visibleChapters
      .filter((chapter) => chapter.selectable !== false && (chapter.isNew || !chapter.isImported))
      .map((chapter) => chapter.id);
    setSelectedChapterIds(nextIds);
  }

  async function handleImport() {
    const nextConnectorId = pickPreferredConnectorId(connectors, connectorId);
    if (!activeSeries?.id || !nextConnectorId || !destinationCategoryId || selectedChapterIds.length === 0) return;
    setImportBusy(true);
    setSearchError('');
    try {
      const result = await window.mangaAPI.enqueueSourceImport({
        connectorId: nextConnectorId,
        seriesId: activeSeries.id,
        chapterIds: selectedChapterIds,
        destinationCategoryId
      });
      if (!result?.ok) throw new Error(result?.error || 'Import impossible.');
      setImports(Array.isArray(result?.imports) ? result.imports : []);
      setLastImportedJobId(result?.job?.id || '');
      setStatusMessage('Telechargement lance. La bibliotheque se mettra a jour ensuite.');
    } catch (error) {
      setSearchError(error?.message || 'Import impossible.');
    } finally {
      setImportBusy(false);
    }
  }

  async function handleCancelImport(jobId) {
    try {
      const result = await window.mangaAPI.cancelSourceImport(jobId);
      setImports(Array.isArray(result?.imports) ? result.imports : []);
    } catch (_error) {
      // best effort
    }
  }

  const connectorNotice = useMemo(() => {
    if (visibleConnectors.some((connector) => connector.availability === 'available')) {
      return 'Choisis une source active puis lance une recherche.';
    }
    if (connectors.length > 0) {
      return 'Les extensions sont detectees. Installe ou active une source compatible pour lancer la recherche.';
    }
    if (runtime?.needsAttention && runtime?.lastError) {
      return runtime.lastError;
    }
    return 'Active l addon puis installe une extension source pour commencer.';
  }, [connectors, runtime, visibleConnectors]);

  return (
    <section className="sources-explorer">
      <div className="sources-explorer-toolbar">
        <label className="sources-field">
          <span>Source</span>
          <select value={effectiveConnectorId} onChange={(event) => setConnectorId(event.target.value)}>
            {connectors.map((connector) => (
              <option key={connector.id} value={connector.id} disabled={connector.availability !== 'available'}>
                {connector.displayName} - {connector.language || 'multi'}
                {connector.availability !== 'available' ? ' - indisponible' : ''}
              </option>
            ))}
          </select>
        </label>

        <form
          className="sources-search-bar"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
        >
          <SearchIcon size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={activeConnector ? `Rechercher sur ${activeConnector.displayName}` : 'Choisis une source pour commencer'}
          />
          <button type="submit" className="primary-button" disabled={!effectiveConnectorId || !query.trim() || searchBusy || activeConnector?.availability !== 'available'}>
            {searchBusy ? 'Recherche...' : 'Rechercher'}
          </button>
        </form>

        <div className="sources-toolbar-meta">
          <span className={`sources-runtime-pill ${runtime?.state === 'running' ? 'active' : ''}`}>
            Moteur {runtime?.state === 'running' ? 'actif' : 'a la demande'}
          </span>
          <span className="sources-runtime-note">
            {runtime?.lastSyncAt
              ? `Sync ${formatRelativeTime(runtime.lastSyncAt)}`
              : `${availableConnectorCount} source${availableConnectorCount > 1 ? 's' : ''} prete${availableConnectorCount > 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {statusMessage ? <div className="sources-inline-banner sources-inline-banner-success">{statusMessage}</div> : null}
      {searchError ? <div className="sources-inline-banner sources-inline-banner-warning">{searchError}</div> : null}
      {!statusMessage && !searchError ? <div className="sources-inline-banner">{connectorNotice}</div> : null}

      <div className="sources-explorer-shell">
        <aside className="sources-explorer-rail">
          <section className="sources-side-panel sources-side-panel-rail">
            <div className="sources-side-head">
              <strong>{railTab === 'connectors' ? 'Sources' : railTab === 'linked' ? 'Series liees' : 'Ouvertes recemment'}</strong>
              <span>{railTab === 'connectors' ? visibleConnectors.length : railTab === 'linked' ? linkedSeries.length : recentSeries.length}</span>
            </div>

            <div className="sources-rail-tabs">
              <button
                type="button"
                className={`ghost-button ${railTab === 'connectors' ? 'active' : ''}`}
                onClick={() => setRailTab('connectors')}
              >
                Sources
              </button>
              <button
                type="button"
                className={`ghost-button ${railTab === 'linked' ? 'active' : ''}`}
                onClick={() => setRailTab('linked')}
              >
                Liees
              </button>
              <button
                type="button"
                className={`ghost-button ${railTab === 'recent' ? 'active' : ''}`}
                onClick={() => setRailTab('recent')}
              >
                Recentes
              </button>
            </div>

            {railTab === 'connectors' ? (
              <>
                <div className="sources-side-search">
                  <SearchIcon size={14} />
                  <input
                    value={connectorFilter}
                    onChange={(event) => setConnectorFilter(event.target.value)}
                    placeholder="Filtrer les sources"
                  />
                </div>
                <VirtualCardList
                  items={visibleConnectors}
                  estimateSize={76}
                  className="sources-connector-list"
                  emptyTitle="Aucune source visible"
                  emptyBody="Installe une extension compatible ou ajuste le filtre pour afficher une source utilisable."
                  renderItem={(connector) => (
                    <ConnectorChip
                      connector={connector}
                      active={connector.id === effectiveConnectorId}
                      onSelect={setConnectorId}
                    />
                  )}
                />
              </>
            ) : null}

            {railTab === 'linked' ? (
              <VirtualCardList
                items={linkedSeries}
                estimateSize={92}
                className="sources-side-list"
                emptyTitle="Aucune serie liee"
                emptyBody="Importe un premier chapitre web pour la retrouver ensuite directement depuis la bibliotheque."
                renderItem={(entry) => (
                  <LinkedSeriesCard
                    entry={entry}
                    active={Boolean(activeLink && getSeriesRefKey(activeLink) === getSeriesRefKey(entry))}
                    onOpen={openLinkedSeries}
                  />
                )}
              />
            ) : null}

            {railTab === 'recent' ? (
              <VirtualCardList
                items={recentSeries}
                estimateSize={82}
                className="sources-side-list"
                emptyTitle="Aucune reprise recente"
                emptyBody="Les dernieres series ouvertes resteront ici pour revenir plus vite."
                renderItem={(entry) => (
                  <button
                    type="button"
                    className="sources-recent-card"
                    onClick={() => {
                      const matching = linkedByRemoteKey.get(`${entry.connectorId || ''}::${entry.seriesId || ''}`);
                      if (matching) {
                        openLinkedSeries(matching);
                        return;
                      }
                      const nextConnectorId = pickPreferredConnectorId(connectors, entry.connectorId || effectiveConnectorId);
                      setConnectorId(nextConnectorId);
                      openSearchSeries({
                        id: entry.seriesId,
                        title: entry.seriesTitle,
                        coverUrl: entry.coverUrl,
                        sourceLabel: entry.sourceLabel
                      }, nextConnectorId);
                    }}
                  >
                    <strong>{entry.seriesTitle || 'Serie web'}</strong>
                    <span>{entry.sourceLabel || 'Source web'}</span>
                  </button>
                )}
              />
            ) : null}
          </section>
        </aside>

        <section className="sources-explorer-results">
          <div className="sources-section-head">
            <div>
              <strong>Resultats</strong>
              <span>{deferredResults.length} serie{deferredResults.length > 1 ? 's' : ''} trouvee{deferredResults.length > 1 ? 's' : ''}</span>
            </div>
            {searchBusy ? <span className="sources-mini-status">Recherche en cours...</span> : null}
          </div>

          <VirtualCardList
            items={deferredResults}
            estimateSize={144}
            overscan={4}
            className="sources-results-list"
            emptyTitle="Aucun resultat charge"
            emptyBody="Choisis une source, lance une recherche, puis garde la fiche ouverte a droite pour ajouter plus de chapitres facilement."
            renderItem={(result) => (
              <SeriesResultCard
                result={result}
                active={result.id === activeSeriesId}
                onSelect={openSearchSeries}
              />
            )}
          />
        </section>

        <section className="sources-explorer-detail">
          <div className="sources-section-head">
            <div>
              <strong>Serie</strong>
              <span>{activeSeries ? (activeLink ? 'Liee a la bibliotheque' : 'Pret pour la selection') : 'Choisis une serie'}</span>
            </div>
            {activeLink ? (
              <button type="button" className="ghost-button" onClick={handleCheckUpdates} disabled={detailBusy}>
                <RefreshIcon size={14} /> Chercher les nouveautes
              </button>
            ) : null}
          </div>

          {!activeSeries ? (
            <div className="sources-detail-empty">
              <LayersIcon size={18} />
              <strong>Choisis une serie</strong>
              <span>Son detail restera ouvert ici pendant que tu explores les resultats et prepares ta selection.</span>
            </div>
          ) : (
            <>
              <div className="sources-series-card">
                <div className="sources-series-cover">
                  <WebSourceCover title={activeSeries.title} src={activeSeries.coverPreviewSrc || activeSeries.coverUrl || activeLink?.coverUrl} />
                </div>
                <div className="sources-series-copy">
                  <strong>{activeSeries.title}</strong>
                  <span>{activeSeries.subtitle || activeLink?.sourceLabel || activeConnector?.displayName || 'Source web'}</span>
                  <p>{activeSeries.description || 'Aucun resume disponible.'}</p>
                  <div className="sources-series-meta">
                    {activeLink ? <span className="sources-flag sources-flag-linked">Source web liee</span> : null}
                    {activeLink?.newChapterCount > 0 ? <span className="sources-flag sources-flag-fresh">{activeLink.newChapterCount} nouveau{activeLink.newChapterCount > 1 ? 'x' : ''}</span> : null}
                  </div>
                </div>
              </div>

              <div className="sources-chapter-toolbar">
                <div className="sources-filter-group">
                  <button
                    type="button"
                    className={`ghost-button ${chapterFilter === 'missing' ? 'active' : ''}`}
                    onClick={() => setChapterFilter('missing')}
                  >
                    Non importes
                  </button>
                  <button
                    type="button"
                    className={`ghost-button ${chapterFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setChapterFilter('all')}
                  >
                    Tous
                  </button>
                </div>

                <div className="sources-selection-tools">
                  <button type="button" className="ghost-button" onClick={selectAllVisible}>
                    <CheckIcon size={14} /> Tout
                  </button>
                  <button type="button" className="ghost-button" onClick={selectNewestVisible}>
                    <DownloadIcon size={14} /> Nouveaux
                  </button>
                  <button type="button" className="ghost-button" onClick={clearSelection}>
                    <TrashIcon size={14} /> Effacer
                  </button>
                </div>
              </div>

              <div className="sources-import-bar">
                <div className="sources-import-target">
                  <FolderPlusIcon size={14} />
                  <label>
                    <span>Destination</span>
                    <select value={destinationCategoryId} onChange={(event) => setDestinationCategoryId(event.target.value)}>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="sources-import-primary">
                  <span>{selectionCount} chapitre{selectionCount > 1 ? 's' : ''} selectionne{selectionCount > 1 ? 's' : ''}</span>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!destinationCategoryId || selectionCount === 0 || importBusy}
                    onClick={handleImport}
                  >
                    {importBusy ? 'Preparation...' : 'Telecharger la selection'}
                  </button>
                </div>
              </div>

              <VirtualCardList
                items={visibleChapters}
                estimateSize={82}
                overscan={8}
                className="sources-chapter-list"
                emptyTitle="Aucun chapitre dans ce filtre"
                emptyBody={chapterFilter === 'missing' ? 'Tous les chapitres connus sont deja importes.' : 'Aucun chapitre disponible pour cette serie.'}
                renderItem={(chapter) => (
                  <ChapterRow
                    chapter={chapter}
                    checked={selectedChapterIds.includes(chapter.id)}
                    onToggle={toggleChapter}
                  />
                )}
              />
            </>
          )}

            <div className="sources-imports-dock">
              <div className="sources-section-head compact">
                <div>
                  <strong>Telechargements</strong>
                  <span>{importsSummary.length}</span>
                </div>
              </div>
            <div className="sources-import-list">
              {importsSummary.length === 0 ? (
                <div className="sources-empty-card compact">
                  <strong>Aucun import recent</strong>
                  <span>Les telechargements apparaitront ici sans masquer l explorer.</span>
                </div>
              ) : importsSummary.map((job) => (
                <ImportRow key={job.id} job={job} onCancel={handleCancelImport} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

export default memo(SourcesExplorer);
