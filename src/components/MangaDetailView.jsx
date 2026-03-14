import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, EditIcon, HeartIcon, LayersIcon, PlayIcon, PlusIcon, ScrollIcon, SearchIcon, SparklesIcon, TagIcon } from './Icons.jsx';
import { getProgressPercent } from '../utils/reader.js';

// ---------------------------------------------------------------------------
// Scroll restoration (RAF + setTimeout, user interaction cancels)
// ---------------------------------------------------------------------------

function restoreScrollPosition(element, value) {
  if (!element) return () => {};

  const target = Math.max(0, Number(value || 0));
  let cancelled = false;
  let userInteracted = false;

  const timers = [];
  const cleanups = [];

  const apply = () => {
    if (cancelled || userInteracted) return;
    if (Math.abs((element.scrollTop || 0) - target) < 2) return;
    element.scrollTo({ top: target, behavior: 'auto' });
  };

  const stopRestoring = () => {
    userInteracted = true;
  };

  ['wheel', 'touchstart', 'pointerdown', 'mousedown', 'keydown'].forEach((eventName) => {
    const handler = () => stopRestoring();
    element.addEventListener(eventName, handler, { passive: true });
    cleanups.push(() => element.removeEventListener(eventName, handler));
  });

  const raf1 = window.requestAnimationFrame(() => apply());
  const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(() => apply()));
  timers.push(window.setTimeout(() => apply(), 90));
  timers.push(window.setTimeout(() => apply(), 180));

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => apply());
    observer.observe(element);
    cleanups.push(() => observer.disconnect());
    timers.push(window.setTimeout(() => observer.disconnect(), 280));
  }

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    window.cancelAnimationFrame(raf2);
    timers.forEach((timer) => window.clearTimeout(timer));
    cleanups.forEach((cleanup) => cleanup());
  };
}

// ---------------------------------------------------------------------------
// Middle-click helpers
// ---------------------------------------------------------------------------

function middleMouseDown(event) {
  if (event.button !== 1) return;
  event.preventDefault();
}

function middleMouseUp(event, callback) {
  if (event.button !== 1) return;
  event.preventDefault();
  event.stopPropagation();
  callback();
}

// ---------------------------------------------------------------------------
// Reading state helpers
// ---------------------------------------------------------------------------

function getReadingStateLabel(state) {
  switch (state) {
    case 'read': return 'Lu';
    case 'in-progress': return 'En cours';
    case 'to-resume': return 'À reprendre';
    case 'never':
    default: return 'Non lu';
  }
}

function getChapterDotClass(chapter) {
  if (chapter.isRead) return 'chapter-dot chapter-dot-read';
  if (chapter.progress?.pageIndex != null && chapter.progress.pageIndex > 0) return 'chapter-dot chapter-dot-in-progress';
  return 'chapter-dot chapter-dot-unread';
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cover type indicator label
// ---------------------------------------------------------------------------

function getCoverTypeLabel(coverType) {
  switch (coverType) {
    case 'custom': return 'Personnalisée';
    case 'first-page': return 'Première page';
    case 'default':
    default: return 'Par défaut';
  }
}

// ---------------------------------------------------------------------------
// MangaDetailView
// ---------------------------------------------------------------------------

function OnlineMetadataModal({ manga, onClose, onImport }) {
  const [query, setQuery] = useState(manga.displayTitle || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(null);

  async function handleSearch(e) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      const response = await window.mangaAPI.searchOnlineMetadata(query.trim());
      setResults(response.results || []);
      if (response.error) setError(response.error);
    } catch (err) {
      setError(err?.message || 'Erreur réseau');
    }
    setLoading(false);
  }

  async function handleImport(item) {
    setImporting(item.malId);
    try {
      await onImport(manga.id, item);
      onClose();
    } catch (_) {
      setError('Erreur lors de l\'import');
      setImporting(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-panel-wide" onClick={(e) => e.stopPropagation()}>
        <h3><SearchIcon size={18} /> Rechercher des métadonnées en ligne</h3>
        <p className="muted-text">Les données importées sont copiées localement et restent disponibles hors ligne.</p>
        <form onSubmit={handleSearch} className="online-search-form">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un manga…"
            autoFocus
          />
          <button type="submit" className="primary-button" disabled={loading || !query.trim()}>
            {loading ? 'Recherche…' : 'Rechercher'}
          </button>
        </form>
        {error && <p className="muted-text" style={{ color: '#ef4444' }}>{error}</p>}
        <div className="online-results-list">
          {results.map((item) => (
            <div key={item.malId} className="online-result-card">
              <div className="online-result-cover">
                {item.coverUrl ? <img src={item.coverUrl} alt={item.title} /> : <div className="cover-fallback">?</div>}
              </div>
              <div className="online-result-info">
                <strong>{item.title}</strong>
                {item.titleJapanese && <small>{item.titleJapanese}</small>}
                {item.authors && <span className="muted-text">{item.authors}</span>}
                {item.synopsis && <p className="manga-description-clamp">{item.synopsis.slice(0, 200)}…</p>}
                <div className="online-result-meta">
                  {item.score && <span className="badge-pill">Score: {item.score}</span>}
                  {item.genres?.slice(0, 3).map((g) => <span key={g} className="badge-pill">{g}</span>)}
                </div>
              </div>
              <button
                className="primary-button online-result-import"
                onClick={() => handleImport(item)}
                disabled={importing === item.malId}
              >
                {importing === item.malId ? 'Import…' : 'Importer'}
              </button>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function MangaDetailView({
  manga,
  allTags,
  allCollections,
  initialScrollTop = 0,
  onScrollPositionChange,
  onBack,
  onOpenChapter,
  onOpenChapterInNewTab,
  onOpenChapterInBackgroundTab,
  onToggleFavorite,
  onPickCover,
  onOpenMetadataEditor,
  onAddTag,
  onAddToCollection,
  onImportOnlineMetadata,
  onContextMenu
}) {
  const containerRef = useRef(null);
  const [showOnlineSearch, setShowOnlineSearch] = useState(false);

  // Save scroll position on unmount
  useEffect(() => () => {
    if (containerRef.current) onScrollPositionChange?.(containerRef.current.scrollTop);
  }, [onScrollPositionChange]);

  // Restore scroll position
  useLayoutEffect(
    () => restoreScrollPosition(containerRef.current, initialScrollTop),
    [initialScrollTop, manga.id]
  );

  // Resolve the resume chapter (last reading position)
  const resumeChapterId = useMemo(() => {
    if (manga.progress?.lastChapterId) return manga.progress.lastChapterId;
    // Fallback: find first non-read chapter
    const ch = manga.chapters?.find((c) => !c.isRead);
    return ch?.id ?? manga.chapters?.[0]?.id ?? null;
  }, [manga]);

  // Resolve collections this manga belongs to
  const mangaCollections = useMemo(() => {
    if (!allCollections || !manga.collectionIds?.length) return [];
    const idSet = new Set(manga.collectionIds);
    return allCollections.filter((c) => idSet.has(c.id));
  }, [allCollections, manga.collectionIds]);

  const progressPercent = manga.progressPercent ?? manga.progress?.percent ?? 0;
  const readingState = manga.readingState || (manga.isRead ? 'read' : progressPercent > 0 ? 'in-progress' : 'never');

  const handleScroll = useCallback((event) => {
    onScrollPositionChange?.(event.currentTarget.scrollTop);
  }, [onScrollPositionChange]);

  return (
    <section className="detail-view" ref={containerRef} onScroll={handleScroll}>
      {/* Back navigation */}
      <button className="ghost-button back-button" onClick={onBack}>
        <ChevronLeftIcon size={16} /> Retour
      </button>

      {/* Hero banner */}
      <div className="detail-hero" onContextMenu={(event) => onContextMenu(event, { type: 'manga', manga })}>
        <div className="detail-cover-card">
          {manga.coverSrc
            ? <img src={manga.coverSrc} alt={manga.displayTitle} className="detail-cover" loading="lazy" />
            : <div className="cover-fallback detail-cover-fallback">{manga.displayTitle[0]}</div>
          }
        </div>

        <div className="detail-copy">
          <div className="detail-title-row">
            <div className="detail-title-block">
              <h1 className="detail-title-ellipsis" title={manga.displayTitle}>{manga.displayTitle}</h1>
              {manga.author && <p className="detail-author">{manga.author}</p>}
            </div>
            <button
              className={`favorite-toggle detail-favorite ${manga.isFavorite ? 'favorite-toggle-active' : ''}`}
              onClick={() => onToggleFavorite(manga.id)}
              title={manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <HeartIcon size={20} filled={manga.isFavorite} />
            </button>
          </div>

          {/* Compact stats row */}
          <div className="detail-stats-row">
            <span className={`detail-status detail-status-${readingState}`}>{getReadingStateLabel(readingState)}</span>
            <span>{manga.chapterCount} chapitres</span>
            <span>{manga.completedChapterCount ?? 0} lus</span>
            <span>{progressPercent}%</span>
          </div>

          {/* Progress bar */}
          <div className="detail-progress-bar-wrap">
            <div className="detail-progress-bar">
              <div className="detail-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* Primary actions */}
          <div className="detail-actions-row">
            {resumeChapterId && (
              <button className="primary-button" onClick={() => onOpenChapter(resumeChapterId)}>
                <PlayIcon size={16} /> Reprendre
              </button>
            )}
            {manga.chapters[0] && (
              <button className="ghost-button" onClick={() => onOpenChapter(manga.chapters[0].id)}>
                <ScrollIcon size={16} /> Ch. 1
              </button>
            )}
            <button className="ghost-button" onClick={onOpenMetadataEditor}>
              <EditIcon size={14} />
            </button>
            <button className="ghost-button" onClick={() => setShowOnlineSearch(true)}>
              <SearchIcon size={14} />
            </button>
            <button className="ghost-button" onClick={() => onPickCover(manga.id)}>
              <SparklesIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Info section below hero */}
      <div className="detail-info-section">
        {/* Description */}
        {manga.description && (
          <div className="detail-description-block">
            <p className="detail-description">{manga.description}</p>
          </div>
        )}

        {/* Tags */}
        {(manga.tags?.length > 0 || onAddTag) && (
          <div className="detail-tag-pills">
            <TagIcon size={14} />
            {manga.tags?.map((tag) => (
              <span key={tag.id} className="manga-tag-pill" style={{ '--tag-color': tag.color }}>{tag.name}</span>
            ))}
            {onAddTag && (
              <button className="ghost-button detail-tag-add-btn" onClick={() => onAddTag(manga.id)} title="Gérer les tags">
                <PlusIcon size={12} />
              </button>
            )}
          </div>
        )}

        {/* Collections */}
        {(mangaCollections.length > 0 || onAddToCollection) && (
          <div className="detail-collections">
            <LayersIcon size={14} />
            {mangaCollections.map((col) => (
              <span key={col.id} className="badge-pill badge-pill-collection">{col.name}</span>
            ))}
            {onAddToCollection && (
              <button className="ghost-button detail-collection-add-btn" onClick={() => onAddToCollection(manga.id)} title="Gérer les collections">
                <PlusIcon size={12} />
              </button>
            )}
          </div>
        )}

        {/* Dates */}
        <div className="detail-dates">
          {manga.addedAt && <span className="muted-text">Ajouté {formatDate(manga.addedAt)}</span>}
          {manga.lastReadAt && <span className="muted-text">Dernière lecture {formatDate(manga.lastReadAt)}</span>}
        </div>
      </div>

      {/* Chapters */}
      <div className="section-header">
        <h2>Chapitres</h2>
        <span>{manga.chapters.length} élément{manga.chapters.length > 1 ? 's' : ''}</span>
      </div>

      <div className="chapter-grid">
        {manga.chapters.map((chapter, index) => (
          <button
            key={chapter.id}
            className={`chapter-card ${chapter.isRead ? 'chapter-card-read' : ''}`}
            onClick={() => onOpenChapter(chapter.id)}
            onMouseDown={middleMouseDown}
            onMouseUp={(event) => middleMouseUp(event, () => onOpenChapterInBackgroundTab(chapter.id))}
            onContextMenu={(event) => onContextMenu(event, { type: 'chapter', manga, chapter })}
          >
            <div className="chapter-cover-wrap">
              {chapter.previewSrc
                ? <img src={chapter.previewSrc} alt={chapter.name} className="chapter-cover" loading="lazy" />
                : <div className="cover-fallback">{index + 1}</div>
              }
              <span className={getChapterDotClass(chapter)} />
            </div>
            <div className="chapter-card-body">
              <strong>{chapter.name}</strong>
              <span>{chapter.pageCount} p. · {chapter.isRead ? 'Lu' : `${getProgressPercent(chapter.progress)}%`}</span>
            </div>
          </button>
        ))}
      </div>

      {showOnlineSearch && (
        <OnlineMetadataModal
          manga={manga}
          onClose={() => setShowOnlineSearch(false)}
          onImport={onImportOnlineMetadata}
        />
      )}
    </section>
  );
}

export default memo(MangaDetailView);
