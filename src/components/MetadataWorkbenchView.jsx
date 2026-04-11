import { memo, useEffect, useMemo, useState } from 'react';
import MediaAsset from './MediaAsset.jsx';
import {
  ChevronLeftIcon,
  ImageIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  TrashIcon
} from './Icons.jsx';

function ResultCard({ result, onImport, importing }) {
  return (
    <article className="workbench-result-card">
      <div className="workbench-result-cover">
        {result.coverPreviewSrc || result.coverUrl ? (
          <img src={result.coverPreviewSrc || result.coverUrl} alt={result.title} className="thumb-smooth" />
        ) : (
          <div className="workbench-result-fallback">?</div>
        )}
      </div>

      <div className="workbench-result-copy">
        <strong>{result.title}</strong>
        {result.titleJapanese ? <span>{result.titleJapanese}</span> : null}
        <p>{(result.synopsis || 'Aucun synopsis disponible.').slice(0, 190)}{result.synopsis && result.synopsis.length > 190 ? '...' : ''}</p>
        <div className="workbench-result-meta">
          {result.authors ? <span>{result.authors}</span> : null}
          {Array.isArray(result.genres) ? result.genres.slice(0, 4).map((genre) => <span key={genre}>{genre}</span>) : null}
        </div>
      </div>

      <button type="button" className="primary-button" onClick={onImport} disabled={importing}>
        {importing ? 'Import...' : 'Importer'}
      </button>
    </article>
  );
}

function QueueItem({ manga, active, onClick, onRemove }) {
  return (
    <button type="button" className={`workbench-queue-item ${active ? 'workbench-queue-item-active' : ''}`} onClick={onClick}>
      <span className="workbench-queue-item-cover">
        {manga.coverSrc || manga.coverMediaType === 'pdf' ? (
          <MediaAsset
            src={manga.coverSrc}
            alt={manga.displayTitle}
            className="thumb-smooth thumb-media"
            loading="lazy"
            mediaType={manga.coverMediaType || 'image'}
            filePath={manga.coverFilePath}
            pageNumber={manga.coverPageNumber || 1}
            maxWidth={90}
            maxHeight={132}
          />
        ) : (
          <span className="workbench-result-fallback">{(manga.displayTitle || '?')[0]}</span>
        )}
      </span>
      <span className="workbench-queue-item-copy">
        <strong>{manga.displayTitle}</strong>
        <small>{manga.author || 'Sans auteur'} · {manga.chapterCount} ch.</small>
      </span>
      <span
        role="button"
        tabIndex={0}
        className="workbench-queue-remove"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }
        }}
      >
        <TrashIcon size={14} />
      </span>
    </button>
  );
}

function MetadataWorkbenchView({
  queueMangas,
  onReplaceQueue,
  onImportMatch,
  onPickCover,
  onOpenManga
}) {
  const [activeMangaId, setActiveMangaId] = useState(queueMangas[0]?.id || null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importingId, setImportingId] = useState(null);

  useEffect(() => {
    if (!queueMangas.length) {
      setActiveMangaId(null);
      return;
    }
    if (!queueMangas.some((manga) => manga.id === activeMangaId)) {
      setActiveMangaId(queueMangas[0].id);
    }
  }, [queueMangas, activeMangaId]);

  const activeManga = useMemo(
    () => queueMangas.find((manga) => manga.id === activeMangaId) || queueMangas[0] || null,
    [queueMangas, activeMangaId]
  );

  useEffect(() => {
    setQuery(activeManga?.displayTitle || '');
    setResults([]);
    setError('');
  }, [activeManga?.id]);

  const runSearch = async (forcedQuery = null) => {
    const nextQuery = String(forcedQuery ?? query).trim();
    if (!nextQuery) return;
    setLoading(true);
    setError('');
    try {
      const response = await window.mangaAPI.searchOnlineMetadata(nextQuery);
      setResults(response.results || []);
      if (response.error) setError(response.error);
    } catch (searchError) {
      setError(searchError?.message || 'Recherche impossible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeManga) return;
    const timer = window.setTimeout(() => {
      runSearch(activeManga.displayTitle);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeManga?.id]);

  const handleRemove = (mangaId) => {
    onReplaceQueue(queueMangas.filter((manga) => manga.id !== mangaId).map((manga) => manga.id));
  };

  const handleImport = async (result) => {
    if (!activeManga) return;
    setImportingId(result.sourceId || result.malId || result.title);
    try {
      await onImportMatch(activeManga.id, result);
      handleRemove(activeManga.id);
    } finally {
      setImportingId(null);
    }
  };

  if (!queueMangas.length) {
    return (
      <section className="workbench-view">
        <div className="workbench-empty-card">
          <span className="workbench-empty-kicker">Atelier metadata</span>
          <h1>Aucun manga dans la file.</h1>
          <p>
            Ajoute des mangas depuis le centre d'entretien, la barre d'actions en masse
            ou le menu contextuel pour traiter covers et metadata en serie.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="workbench-view">
      <div className="workbench-layout">
        <aside className="workbench-sidebar">
          <div className="workbench-sidebar-head">
            <span className="workbench-empty-kicker">Atelier metadata</span>
            <strong>{queueMangas.length} en attente</strong>
          </div>

          <div className="workbench-queue-list">
            {queueMangas.map((manga) => (
              <QueueItem
                key={manga.id}
                manga={manga}
                active={manga.id === activeManga?.id}
                onClick={() => setActiveMangaId(manga.id)}
                onRemove={() => handleRemove(manga.id)}
              />
            ))}
          </div>
        </aside>

        <div className="workbench-main">
          <div className="workbench-current-card">
            <div className="workbench-current-copy">
              <span className="workbench-empty-kicker">Selection courante</span>
              <h1>{activeManga.displayTitle}</h1>
              <p>
                {activeManga.author || 'Auteur inconnu'} · {activeManga.chapterCount} chapitres ·
                {activeManga.coverSrc ? ' cover presente' : ' cover manquante'}
              </p>
            </div>
            <div className="workbench-current-actions">
              <button type="button" className="ghost-button" onClick={() => onOpenManga(activeManga.id)}>
                <ChevronLeftIcon size={14} /> Ouvrir la fiche
              </button>
              <button type="button" className="ghost-button" onClick={() => onPickCover(activeManga.id)}>
                <ImageIcon size={14} /> Choisir une cover
              </button>
              <button type="button" className="ghost-button" onClick={() => runSearch(activeManga.displayTitle)}>
                <RefreshIcon size={14} /> Relancer la recherche
              </button>
            </div>
          </div>

          <form
            className="workbench-search-bar"
            onSubmit={(event) => {
              event.preventDefault();
              runSearch();
            }}
          >
            <SearchIcon size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une source pour ce manga"
            />
            <button type="submit" className="primary-button" disabled={loading || !query.trim()}>
              {loading ? 'Recherche...' : 'Rechercher'}
            </button>
          </form>

          {error ? <p className="workbench-error">{error}</p> : null}

          <div className="workbench-results-grid">
            {results.length === 0 && !loading ? (
              <div className="workbench-empty-results">
                <SparklesIcon size={18} />
                <strong>Aucun resultat pour le moment.</strong>
                <span>Essaie un titre alternatif, puis importe la meilleure suggestion.</span>
              </div>
            ) : null}

            {results.map((result) => (
              <ResultCard
                key={`${result.source || 'src'}-${result.sourceId || result.malId || result.title}`}
                result={result}
                importing={importingId === (result.sourceId || result.malId || result.title)}
                onImport={() => handleImport(result)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(MetadataWorkbenchView);
