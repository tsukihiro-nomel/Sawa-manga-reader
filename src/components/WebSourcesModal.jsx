import { memo, useEffect, useMemo, useState } from 'react';
import {
  CheckIcon,
  DownloadIcon,
  FolderPlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon
} from './Icons.jsx';

function WebSourceCover({ title, src }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <div className="web-sources-result-fallback">{(title || '?')[0]}</div>;
  }

  return (
    <img
      src={src}
      alt={title}
      className="thumb-smooth"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
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
  return <span className={`web-sources-status web-sources-status-${normalized}`}>{label}</span>;
}

function SeriesResultCard({ result, active, onSelect }) {
  return (
    <button type="button" className={`web-sources-result-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="web-sources-result-cover">
        <WebSourceCover title={result.title} src={result.coverPreviewSrc || result.coverUrl} />
      </div>
      <div className="web-sources-result-copy">
        <strong>{result.title}</strong>
        {result.subtitle ? <span>{result.subtitle}</span> : null}
        <p>{(result.description || 'Aucun resume disponible.').slice(0, 160)}{result.description && result.description.length > 160 ? '...' : ''}</p>
      </div>
    </button>
  );
}

function ChapterRow({ chapter, checked, onToggle }) {
  return (
    <label className={`web-sources-chapter-row ${checked ? 'active' : ''}`}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(chapter.id)} />
      <div className="web-sources-chapter-copy">
        <strong>{chapter.label}</strong>
        <span>{chapter.meta}</span>
      </div>
    </label>
  );
}

function ImportRow({ job, onCancel }) {
  return (
    <div className="web-sources-import-row">
      <div className="web-sources-import-copy">
        <strong>{job.seriesTitle || 'Import web'}</strong>
        <span>{job.connectorName || 'Source web'} · {job.progressLabel || 'Preparation en cours'}</span>
      </div>
      <div className="web-sources-import-actions">
        <ImportStatusBadge status={job.status} />
        {job.status === 'running' || job.status === 'queued' ? (
          <button type="button" className="ghost-button" onClick={() => onCancel(job.id)}>
            <TrashIcon size={14} /> Annuler
          </button>
        ) : null}
      </div>
    </div>
  );
}

function pluginHasConnectorsNotice(connectors, runtime) {
  if (Array.isArray(connectors) && connectors.some((connector) => connector.availability === 'available')) return '';
  if (Array.isArray(connectors) && connectors.length > 0) {
    return 'Les extensions sont bien detectees. Installe-les puis laisse le runtime confirmer leurs sources pour les rendre utilisables dans Sawa.';
  }
  if (runtime?.needsAttention && runtime?.lastError) return runtime.lastError;
  if (runtime?.state === 'running') {
    return 'Le moteur est actif, mais aucune extension source n est encore installee ou active.';
  }
  return 'Active l addon puis installe une extension compatible dans Parametres > Plugins pour utiliser Sources web.';
}

function pickPreferredConnectorId(connectors = [], requestedId = '') {
  const available = connectors.filter((connector) => connector.availability === 'available');
  if (requestedId && available.some((connector) => connector.id === requestedId)) {
    return requestedId;
  }
  if (available.length > 0) return available[0].id;
  if (requestedId && connectors.some((connector) => connector.id === requestedId)) {
    return requestedId;
  }
  return connectors[0]?.id || '';
}

function WebSourcesModal({
  open,
  embedded = false,
  categories = [],
  defaultCategoryId = null,
  onClose,
  onImported
}) {
  const [runtime, setRuntime] = useState(null);
  const [connectors, setConnectors] = useState([]);
  const [connectorId, setConnectorId] = useState('');
  const [connectorFilter, setConnectorFilter] = useState('');
  const [query, setQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState([]);
  const [activeSeriesId, setActiveSeriesId] = useState('');
  const [activeSeries, setActiveSeries] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState([]);
  const [destinationCategoryId, setDestinationCategoryId] = useState(defaultCategoryId || categories[0]?.id || '');
  const [imports, setImports] = useState([]);
  const [importBusy, setImportBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [lastImportedJobId, setLastImportedJobId] = useState('');

  const activeCategory = useMemo(
    () => categories.find((category) => category.id === destinationCategoryId) || null,
    [categories, destinationCategoryId]
  );

  const visibleConnectors = useMemo(() => {
    const needle = String(connectorFilter || '').trim().toLowerCase();
    if (!needle) return connectors;
    return connectors.filter((connector) => (
      String(connector.displayName || '').toLowerCase().includes(needle)
      || String(connector.language || '').toLowerCase().includes(needle)
    ));
  }, [connectorFilter, connectors]);

  const activeConnector = useMemo(
    () => connectors.find((connector) => connector.id === connectorId) || null,
    [connectors, connectorId]
  );

  useEffect(() => {
    if (!open) return;
    setDestinationCategoryId(defaultCategoryId || categories[0]?.id || '');
  }, [open, defaultCategoryId, categories]);

  useEffect(() => {
    if (!open) return undefined;
    let disposed = false;
    window.mangaAPI.listSourceConnectors().then((result) => {
      if (disposed) return;
      const nextConnectors = Array.isArray(result?.connectors) ? result.connectors : [];
      setRuntime(result?.runtime || null);
      setConnectors(nextConnectors);
      setConnectorId((current) => {
        return pickPreferredConnectorId(nextConnectors, current || result?.lastConnectorId || '');
      });
      if (!defaultCategoryId && result?.lastCategoryId) {
        setDestinationCategoryId((current) => current || result.lastCategoryId);
      }
      if (result?.error) setSearchError(result.error);
    }).catch((error) => {
      if (!disposed) {
        setRuntime(null);
        setConnectors([]);
        setConnectorId('');
        setSearchError(error?.message || 'Impossible de charger les sources web.');
      }
    });
    return () => {
      disposed = true;
    };
  }, [defaultCategoryId, open]);

  useEffect(() => {
    if (!connectors.length) {
      if (connectorId) setConnectorId('');
      return;
    }
    const nextConnectorId = pickPreferredConnectorId(connectors, connectorId);
    if (nextConnectorId !== connectorId) {
      setConnectorId(nextConnectorId);
    }
  }, [connectors, connectorId]);

  useEffect(() => {
    if (!open) return undefined;
    let disposed = false;

    const refreshImports = async () => {
      try {
        const result = await window.mangaAPI.listSourceImports();
        if (disposed) return;
        setImports(Array.isArray(result?.imports) ? result.imports : []);
      } catch (_error) {
        if (!disposed) setImports([]);
      }
    };

    refreshImports();
    const intervalId = window.setInterval(refreshImports, 1200);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !lastImportedJobId) return;
    const completedJob = imports.find((job) => job.id === lastImportedJobId && ['done', 'failed', 'cancelled'].includes(job.status));
    if (!completedJob) return;
    setLastImportedJobId('');
    if (completedJob.status === 'done') {
      setStatusMessage(`Import termine dans ${completedJob.categoryName || 'la categorie choisie'}.`);
      onImported?.(completedJob);
    } else if (completedJob.status === 'failed') {
      setStatusMessage(completedJob.error || 'Import web interrompu.');
    } else {
      setStatusMessage('Import annule.');
    }
  }, [imports, lastImportedJobId, onImported, open]);

  useEffect(() => {
    setResults([]);
    setActiveSeriesId('');
    setActiveSeries(null);
    setChapters([]);
    setSelectedChapterIds([]);
  }, [connectorId]);

  const runSearch = async () => {
    const nextQuery = query.trim();
    if (!connectorId || !nextQuery || activeConnector?.availability !== 'available') return;
    setSearchBusy(true);
    setSearchError('');
    setResults([]);
    setActiveSeriesId('');
    setActiveSeries(null);
    setChapters([]);
    setSelectedChapterIds([]);
    try {
      const result = await window.mangaAPI.searchSourceSeries({ connectorId, query: nextQuery });
      setResults(Array.isArray(result?.results) ? result.results : []);
      if (result?.error) setSearchError(result.error);
    } catch (error) {
      setSearchError(error?.message || 'Recherche impossible.');
    } finally {
      setSearchBusy(false);
    }
  };

  const loadSeries = async (seriesId) => {
    if (!connectorId || !seriesId || activeConnector?.availability !== 'available') return;
    setSeriesBusy(true);
    setSearchError('');
    setActiveSeriesId(seriesId);
    setSelectedChapterIds([]);
    try {
      const [seriesResult, chaptersResult] = await Promise.all([
        window.mangaAPI.getSourceSeries({ connectorId, seriesId }),
        window.mangaAPI.getSourceChapters({ connectorId, seriesId })
      ]);
      setActiveSeries(seriesResult?.series || null);
      setChapters(Array.isArray(chaptersResult?.chapters) ? chaptersResult.chapters : []);
    } catch (error) {
      setActiveSeries(null);
      setChapters([]);
      setSearchError(error?.message || 'Impossible de charger cette serie.');
    } finally {
      setSeriesBusy(false);
    }
  };

  const toggleChapter = (chapterId) => {
    setSelectedChapterIds((current) => (
      current.includes(chapterId)
        ? current.filter((entry) => entry !== chapterId)
        : [...current, chapterId]
    ));
  };

  const selectAllChapters = () => {
    setSelectedChapterIds(chapters.map((chapter) => chapter.id));
  };

  const clearChapters = () => {
    setSelectedChapterIds([]);
  };

  const handleImport = async () => {
    if (!connectorId || !activeSeries || !destinationCategoryId || selectedChapterIds.length === 0 || activeConnector?.availability !== 'available') return;
    setImportBusy(true);
    setStatusMessage('');
    try {
      const result = await window.mangaAPI.enqueueSourceImport({
        connectorId,
        seriesId: activeSeries.id,
        chapterIds: selectedChapterIds,
        destinationCategoryId
      });
      if (!result?.ok) {
        setStatusMessage(result?.error || 'Import impossible.');
        return;
      }
      setLastImportedJobId(result?.job?.id || '');
      setStatusMessage('Import en file. La bibliotheque se mettra a jour sans interrompre la lecture.');
      setImports(Array.isArray(result?.imports) ? result.imports : []);
    } catch (error) {
      setStatusMessage(error?.message || 'Import impossible.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleCancelImport = async (jobId) => {
    try {
      const result = await window.mangaAPI.cancelSourceImport(jobId);
      setImports(Array.isArray(result?.imports) ? result.imports : []);
    } catch (_error) {
      // Best effort only.
    }
  };

  if (!open) return null;

  const content = (
    <div className={`web-sources-modal ${embedded ? 'web-sources-modal-embedded' : ''}`}>
        <div className="web-sources-head">
          <div>
            <span className="web-sources-kicker">Addon officiel</span>
            <h3>Sources web</h3>
            <p>Recherche une serie, choisis les chapitres, puis importe-les dans une categorie locale.</p>
            <div className="settings-note">
              Runtime: {runtime?.state === 'running' ? 'actif' : (runtime?.needsAttention ? 'attention' : 'arrete')}
              {activeConnector ? ` · Source active: ${activeConnector.displayName}` : ''}
            </div>
          </div>
          {!embedded ? <button type="button" className="ghost-button" onClick={onClose}>Fermer</button> : null}
        </div>

        <div className="web-sources-toolbar">
          <div className="web-sources-connectors-block">
            {connectors.length > 4 ? (
              <div className="web-sources-search web-sources-connector-filter">
                <SearchIcon size={16} />
                <input
                  value={connectorFilter}
                  onChange={(event) => setConnectorFilter(event.target.value)}
                  placeholder="Filtrer les sources actives"
                />
              </div>
            ) : null}
            <div className="web-sources-connectors">
              {connectors.length === 0 ? <span className="web-sources-empty-inline">Aucune source active.</span> : null}
              {connectors.length > 0 && visibleConnectors.length === 0 ? (
                <span className="web-sources-empty-inline">Aucune source active ne correspond au filtre.</span>
              ) : null}
              {visibleConnectors.map((connector) => (
                <button
                  key={connector.id}
                  type="button"
                  className={`ghost-button web-sources-connector ${connector.id === connectorId ? 'active' : ''}`}
                  disabled={connector.availability !== 'available'}
                  onClick={() => setConnectorId(connector.id)}
                >
                  <span className="web-sources-connector-copy">
                    <strong>{connector.displayName}</strong>
                    <small>
                      {connector.language || 'multi'}
                      {connector.availability !== 'available' ? ' · incompatible' : ''}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <form
            className="web-sources-search"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch();
            }}
          >
            <SearchIcon size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={activeConnector
                ? activeConnector.availability === 'available'
                  ? `Rechercher un titre sur ${activeConnector.displayName}`
                  : `La source ${activeConnector.displayName} n est pas encore compatible`
                : 'Active une source pour lancer la recherche'}
            />
            <button
              type="submit"
              className="primary-button"
              disabled={searchBusy || !connectorId || !query.trim() || activeConnector?.availability !== 'available'}
            >
              {searchBusy ? 'Recherche...' : 'Chercher'}
            </button>
          </form>
        </div>

        {!pluginHasConnectorsNotice(connectors, runtime) ? null : (
          <div className="web-sources-banner web-sources-banner-soft">
            {pluginHasConnectorsNotice(connectors, runtime)}
          </div>
        )}
        {searchError ? <div className="web-sources-banner">{searchError}</div> : null}
        {statusMessage ? <div className="web-sources-banner web-sources-banner-soft">{statusMessage}</div> : null}

        <div className="web-sources-layout">
          <section className="web-sources-results-panel">
            <div className="web-sources-panel-head">
              <strong>Resultats</strong>
              <span>{results.length} element{results.length > 1 ? 's' : ''}</span>
            </div>

            <div className="web-sources-results-list">
              {results.length === 0 ? (
                <div className="web-sources-empty">
                  <SearchIcon size={18} />
                  <strong>{connectorId ? 'Recherche locale calme' : 'Aucune source prete'}</strong>
                  <span>
                    {connectorId && activeConnector?.availability === 'available'
                      ? 'Lance une recherche pour afficher les titres disponibles sur la source choisie.'
                      : connectors.length > 0
                        ? 'Installe une extension qui expose au moins une source compatible dans Sawa.'
                        : 'Installe puis active au moins une extension dans Parametres > Plugins pour remplir cette vue.'}
                  </span>
                </div>
              ) : results.map((result) => (
                <SeriesResultCard
                  key={result.id}
                  result={result}
                  active={result.id === activeSeriesId}
                  onSelect={() => loadSeries(result.id)}
                />
              ))}
            </div>
          </section>

          <section className="web-sources-detail-panel">
            <div className="web-sources-panel-head">
              <strong>Serie & import</strong>
              {seriesBusy ? <span>Chargement...</span> : activeSeries ? <span>{chapters.length} chapitres</span> : null}
            </div>

            {!activeSeries && !seriesBusy ? (
              <div className="web-sources-empty">
                <FolderPlusIcon size={18} />
                <strong>Choisis une serie</strong>
                <span>Les details et la liste de chapitres apparaissent ici, sans charger l'interface principale.</span>
              </div>
            ) : null}

            {activeSeries ? (
              <>
                <div className="web-sources-series-card">
                  <div className="web-sources-series-cover">
                    <WebSourceCover title={activeSeries.title} src={activeSeries.coverPreviewSrc || activeSeries.coverUrl} />
                  </div>
                  <div className="web-sources-series-copy">
                    <strong>{activeSeries.title}</strong>
                    {activeSeries.subtitle ? <span>{activeSeries.subtitle}</span> : null}
                    <p>{(activeSeries.description || 'Aucun resume disponible.').slice(0, 260)}{activeSeries.description && activeSeries.description.length > 260 ? '...' : ''}</p>
                    <div className="web-sources-meta-row">
                      {activeSeries.author ? <span>{activeSeries.author}</span> : null}
                      {activeSeries.status ? <span>{activeSeries.status}</span> : null}
                      {activeSeries.year ? <span>{activeSeries.year}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="web-sources-import-bar">
                  <label className="web-sources-category-picker">
                    <span>Destination</span>
                    <select value={destinationCategoryId} onChange={(event) => setDestinationCategoryId(event.target.value)}>
                      <option value="" disabled>Choisir une categorie</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="web-sources-selection-actions">
                    <button type="button" className="ghost-button" onClick={selectAllChapters} disabled={!chapters.length}>
                      <CheckIcon size={14} /> Tout
                    </button>
                    <button type="button" className="ghost-button" onClick={clearChapters} disabled={!selectedChapterIds.length}>
                      <TrashIcon size={14} /> Effacer
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleImport}
                      disabled={importBusy || !destinationCategoryId || !selectedChapterIds.length}
                    >
                      <DownloadIcon size={14} /> {importBusy ? 'Import...' : `Importer ${selectedChapterIds.length || ''}`.trim()}
                    </button>
                  </div>
                </div>

                {activeCategory ? (
                  <div className="web-sources-banner web-sources-banner-soft">
                    Destination actuelle: <strong>{activeCategory.name}</strong>
                  </div>
                ) : null}

                <div className="web-sources-chapter-list">
                  {chapters.map((chapter) => (
                    <ChapterRow
                      key={chapter.id}
                      chapter={chapter}
                      checked={selectedChapterIds.includes(chapter.id)}
                      onToggle={toggleChapter}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </div>

        <section className="web-sources-imports-panel">
          <div className="web-sources-panel-head">
            <strong>Imports recents</strong>
            <button type="button" className="ghost-button" onClick={() => window.mangaAPI.listSourceImports().then((result) => setImports(result?.imports || []))}>
              <RefreshIcon size={14} /> Actualiser
            </button>
          </div>
          <div className="web-sources-import-list">
            {imports.length === 0 ? (
              <div className="web-sources-empty-inline">Aucun import web recemment lance.</div>
            ) : imports.map((job) => (
              <ImportRow key={job.id} job={job} onCancel={handleCancelImport} />
            ))}
          </div>
        </section>
      </div>
  );

  if (embedded) {
    return <div className="web-sources-embedded">{content}</div>;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

export default memo(WebSourcesModal);
