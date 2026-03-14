import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, EditIcon, HeartIcon, LayersIcon, PlayIcon, PlusIcon, ScrollIcon, SearchIcon, SparklesIcon, TagIcon, BookIcon, ClockIcon, ZapIcon } from './Icons.jsx';
import { getProgressPercent } from '../utils/reader.js';

// ---------------------------------------------------------------------------
// Scroll restoration
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

  const stopRestoring = () => { userInteracted = true; };

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
// Helpers
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

function getReadingStateLabel(state) {
  switch (state) {
    case 'read': return 'Lu';
    case 'in-progress': return 'En cours';
    case 'to-resume': return 'À reprendre';
    case 'never':
    default: return 'Non lu';
  }
}

function getReadingStateClass(state) {
  switch (state) {
    case 'read': return 'detail-badge-read';
    case 'in-progress': return 'detail-badge-progress';
    default: return 'detail-badge-unread';
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
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} sem.`;
    return formatDate(dateStr);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Online Metadata Modal
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
      setError("Erreur lors de l'import");
      setImporting(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel modal-panel-wide" onClick={(e) => e.stopPropagation()}>
        <h3><SearchIcon size={18} /> Rechercher des métadonnées en ligne</h3>
        <p className="muted-text">Les données importées sont copiées localement et restent disponibles hors ligne.</p>
        <form onSubmit={handleSearch} className="online-search-form">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un manga…" autoFocus />
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

// ---------------------------------------------------------------------------
// MangaDetailView — MangaDex-like layout
// ---------------------------------------------------------------------------

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
  const [chaptersExpanded, setChaptersExpanded] = useState(false);
  const [chapterSort, setChapterSort] = useState('asc'); // 'asc' | 'desc'

  useEffect(() => () => {
    if (containerRef.current) onScrollPositionChange?.(containerRef.current.scrollTop);
  }, [onScrollPositionChange]);

  useLayoutEffect(
    () => restoreScrollPosition(containerRef.current, initialScrollTop),
    [initialScrollTop, manga.id]
  );

  const resumeChapterId = useMemo(() => {
    if (manga.progress?.lastChapterId) return manga.progress.lastChapterId;
    const ch = manga.chapters?.find((c) => !c.isRead);
    return ch?.id ?? manga.chapters?.[0]?.id ?? null;
  }, [manga]);

  const mangaCollections = useMemo(() => {
    if (!allCollections || !manga.collectionIds?.length) return [];
    const idSet = new Set(manga.collectionIds);
    return allCollections.filter((c) => idSet.has(c.id));
  }, [allCollections, manga.collectionIds]);

  const progressPercent = manga.progressPercent ?? manga.progress?.percent ?? 0;
  const readingState = manga.readingState || (manga.isRead ? 'read' : progressPercent > 0 ? 'in-progress' : 'never');
  const totalChapters = manga.chapters?.length ?? 0;
  const readChapters = manga.completedChapterCount ?? 0;

  const sortedChapters = useMemo(() => {
    if (!manga.chapters) return [];
    if (chapterSort === 'desc') return [...manga.chapters].reverse();
    return manga.chapters;
  }, [manga.chapters, chapterSort]);

  const displayedChapters = chaptersExpanded ? sortedChapters : sortedChapters.slice(0, 30);

  const handleScroll = useCallback((event) => {
    onScrollPositionChange?.(event.currentTarget.scrollTop);
  }, [onScrollPositionChange]);

  // Aliases display
  const aliases = manga.aliases?.filter(Boolean) ?? [];

  return (
    <section className="detail-view" ref={containerRef} onScroll={handleScroll}>
      {/* Back navigation */}
      <button className="ghost-button back-button" onClick={onBack}>
        <ChevronLeftIcon size={16} /> Retour
      </button>

      {/* Hero banner — MangaDex style */}
      <div className="detail-hero detail-hero-mdx" onContextMenu={(event) => onContextMenu(event, { type: 'manga', manga })}>
        <div className="detail-cover-card">
          {manga.coverSrc
            ? <img src={manga.coverSrc} alt={manga.displayTitle} className="detail-cover" loading="lazy" />
            : <div className="cover-fallback detail-cover-fallback">{manga.displayTitle[0]}</div>
          }
        </div>

        <div className="detail-copy">
          {/* Title area */}
          <div className="detail-title-row">
            <div className="detail-title-block">
              <h1 className="detail-title-ellipsis" title={manga.displayTitle}>{manga.displayTitle}</h1>
              {manga.author && <p className="detail-author">{manga.author}</p>}
              {aliases.length > 0 && (
                <p className="detail-aliases">{aliases.join(' · ')}</p>
              )}
            </div>
            <button
              className={`favorite-toggle detail-favorite ${manga.isFavorite ? 'favorite-toggle-active' : ''}`}
              onClick={() => onToggleFavorite(manga.id)}
              title={manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <HeartIcon size={20} filled={manga.isFavorite} />
            </button>
          </div>

          {/* Reading state badge row */}
          <div className="detail-badge-row">
            <span className={`detail-badge ${getReadingStateClass(readingState)}`}>{getReadingStateLabel(readingState)}</span>
            <span className="detail-badge detail-badge-neutral">{totalChapters} chapitre{totalChapters > 1 ? 's' : ''}</span>
            <span className="detail-badge detail-badge-neutral">{readChapters}/{totalChapters} lus</span>
            <span className="detail-badge detail-badge-neutral">{progressPercent}%</span>
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
              <EditIcon size={14} /> Éditer
            </button>
            <button className="ghost-button" onClick={() => setShowOnlineSearch(true)}>
              <SearchIcon size={14} /> Métadonnées
            </button>
            <button className="ghost-button" onClick={() => onPickCover(manga.id)}>
              <SparklesIcon size={14} /> Couverture
            </button>
          </div>
        </div>
      </div>

      {/* Info panels — compact 2-column layout */}
      <div className="detail-panels">
        {/* Row 1: Description + Informations side by side */}
        <div className="detail-panels-row">
          <div className="detail-panel">
            <h3 className="detail-panel-title">Description</h3>
            {manga.description ? (
              <p className="detail-description">{manga.description}</p>
            ) : (
              <p className="detail-description muted-text">Aucune description. Utilise la recherche en ligne pour en importer une.</p>
            )}
          </div>

          <div className="detail-panel">
            <h3 className="detail-panel-title">Informations</h3>
            <div className="detail-info-grid">
              <div className="detail-info-item">
                <span className="detail-info-label">Auteur</span>
                <span className="detail-info-value">{manga.author || '—'}</span>
              </div>
              <div className="detail-info-item">
                <span className="detail-info-label">Statut</span>
                <span className="detail-info-value">{getReadingStateLabel(readingState)}</span>
              </div>
              <div className="detail-info-item">
                <span className="detail-info-label">Chapitres</span>
                <span className="detail-info-value">{totalChapters}</span>
              </div>
              <div className="detail-info-item">
                <span className="detail-info-label">Progression</span>
                <span className="detail-info-value">{readChapters}/{totalChapters} ({progressPercent}%)</span>
              </div>
              {manga.categoryName && (
                <div className="detail-info-item">
                  <span className="detail-info-label">Catégorie</span>
                  <span className="detail-info-value">{manga.categoryName}</span>
                </div>
              )}
              {manga.addedAt && (
                <div className="detail-info-item">
                  <span className="detail-info-label">Ajouté</span>
                  <span className="detail-info-value">{formatDate(manga.addedAt)}</span>
                </div>
              )}
              {manga.lastReadAt && (
                <div className="detail-info-item">
                  <span className="detail-info-label">Lu</span>
                  <span className="detail-info-value">{formatRelativeDate(manga.lastReadAt)}</span>
                </div>
              )}
            </div>
            {manga.path && (
              <div className="detail-info-item" style={{ marginTop: 8 }}>
                <span className="detail-info-label">Chemin</span>
                <span className="detail-info-value detail-info-path">{manga.path}</span>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Tags + Collections side by side */}
        <div className="detail-panels-row">
          <div className="detail-panel">
            <h3 className="detail-panel-title">
              <TagIcon size={16} /> Tags
              {onAddTag && (
                <button className="ghost-button detail-panel-action" onClick={() => onAddTag(manga.id)}>
                  <PlusIcon size={14} /> Gérer
                </button>
              )}
            </h3>
            {manga.tags?.length > 0 ? (
              <div className="detail-tag-pills">
                {manga.tags.map((tag) => (
                  <span key={tag.id} className="manga-tag-pill" style={{ '--tag-color': tag.color }}>{tag.name}</span>
                ))}
              </div>
            ) : (
              <p className="muted-text" style={{ margin: 0, fontSize: '0.85rem' }}>Aucun tag.</p>
            )}
          </div>

          <div className="detail-panel">
            <h3 className="detail-panel-title">
              <LayersIcon size={16} /> Collections
              {onAddToCollection && (
                <button className="ghost-button detail-panel-action" onClick={() => onAddToCollection(manga.id)}>
                  <PlusIcon size={14} /> Gérer
                </button>
              )}
            </h3>
            {mangaCollections.length > 0 ? (
              <div className="detail-collections-list">
                {mangaCollections.map((col) => (
                  <span key={col.id} className="badge-pill badge-pill-collection">{col.name}</span>
                ))}
              </div>
            ) : (
              <p className="muted-text" style={{ margin: 0, fontSize: '0.85rem' }}>Aucune collection.</p>
            )}
          </div>
        </div>
      </div>

      {/* Chapters section */}
      <div className="detail-chapters-section">
        <div className="section-header">
          <h2>{totalChapters} Chapitre{totalChapters > 1 ? 's' : ''}</h2>
          <div className="detail-chapter-controls">
            <button
              className={`ghost-button detail-chapter-sort ${chapterSort === 'asc' ? 'active' : ''}`}
              onClick={() => setChapterSort('asc')}
            >
              1→{totalChapters}
            </button>
            <button
              className={`ghost-button detail-chapter-sort ${chapterSort === 'desc' ? 'active' : ''}`}
              onClick={() => setChapterSort('desc')}
            >
              {totalChapters}→1
            </button>
          </div>
        </div>

        <div className="chapter-grid">
          {displayedChapters.map((chapter, index) => {
            const realIndex = chapterSort === 'desc' ? totalChapters - 1 - index : index;
            return (
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
                    : <div className="cover-fallback">{realIndex + 1}</div>
                  }
                  <span className={getChapterDotClass(chapter)} />
                </div>
                <div className="chapter-card-body">
                  <strong>{chapter.name}</strong>
                  <span>{chapter.pageCount} p. · {chapter.isRead ? 'Lu' : `${getProgressPercent(chapter.progress)}%`}</span>
                </div>
              </button>
            );
          })}
        </div>

        {sortedChapters.length > 30 && !chaptersExpanded && (
          <button className="ghost-button detail-show-all-chapters" onClick={() => setChaptersExpanded(true)}>
            Afficher les {sortedChapters.length - 30} chapitres restants
          </button>
        )}
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
