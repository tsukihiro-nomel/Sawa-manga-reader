import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { ChevronLeftIcon, EditIcon, HeartIcon, LayersIcon, PlayIcon, PlusIcon, ScrollIcon, TagIcon } from './Icons.jsx';
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
  onContextMenu
}) {
  const containerRef = useRef(null);

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
      <button className="ghost-button back-button" onClick={onBack}>
        <ChevronLeftIcon size={16} /> Retour bibliothèque
      </button>

      <div className="detail-hero" onContextMenu={(event) => onContextMenu(event, { type: 'manga', manga })}>
        <div className="detail-cover-card">
          {manga.coverSrc
            ? <img src={manga.coverSrc} alt={manga.displayTitle} className="detail-cover" loading="lazy" />
            : <div className="cover-fallback detail-cover-fallback">{manga.displayTitle[0]}</div>
          }
          {manga.coverType && (
            <span className="detail-cover-type-badge">{getCoverTypeLabel(manga.coverType)}</span>
          )}
          <div className="detail-cover-actions">
            <button className="ghost-button" onClick={() => onPickCover(manga.id)}>Changer la couverture</button>
            <button className="ghost-button" onClick={onOpenMetadataEditor}>
              <EditIcon size={16} /> Éditer les infos
            </button>
          </div>
        </div>

        <div className="detail-copy">
          {/* Title row with ellipsis + tooltip for long titles */}
          <div className="detail-title-row">
            <div className="detail-title-block">
              <h1 className="detail-title-ellipsis" title={manga.displayTitle}>{manga.displayTitle}</h1>
              {manga.author ? <p className="muted-text">{manga.author}</p> : null}
            </div>
            <button
              className={`favorite-toggle detail-favorite ${manga.isFavorite ? 'favorite-toggle-active' : ''}`}
              onClick={() => onToggleFavorite(manga.id)}
              title={manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <HeartIcon size={18} filled={manga.isFavorite} />
            </button>
          </div>

          {/* Stats badges */}
          <div className="detail-tags">
            <span className="badge-pill">{manga.chapterCount} chapitres</span>
            <span className="badge-pill">{manga.pageCount} pages</span>
            <span className="badge-pill">{manga.completedChapterCount ?? 0}/{manga.chapterCount} chapitres lus</span>
            <span className="badge-pill badge-pill-state">{getReadingStateLabel(readingState)}</span>
          </div>

          {/* Progression bar */}
          <div className="detail-progress-bar-wrap">
            <div className="detail-progress-bar">
              <div className="detail-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="detail-progress-label">Progression {progressPercent}%</span>
          </div>

          {/* Description */}
          <p className="detail-description">
            {manga.description || 'Aucune description pour le moment. Tu peux en ajouter une depuis le bouton éditer.'}
          </p>

          {/* Tags as colored pills */}
          {(manga.tags?.length > 0 || onAddTag) && (
            <div className="detail-tag-pills">
              <TagIcon size={14} />
              {manga.tags?.map((tag) => (
                <span key={tag.id} className="manga-tag-pill" style={{ '--tag-color': tag.color }}>
                  {tag.name}
                </span>
              ))}
              {onAddTag && (
                <button
                  className="ghost-button detail-tag-add-btn"
                  onClick={() => onAddTag(manga.id)}
                  title="Ajouter un tag"
                >
                  <PlusIcon size={12} />
                </button>
              )}
            </div>
          )}

          {/* Collections this manga belongs to */}
          {(mangaCollections.length > 0 || onAddToCollection) && (
            <div className="detail-collections">
              <LayersIcon size={14} />
              {mangaCollections.map((col) => (
                <span key={col.id} className="badge-pill badge-pill-collection">{col.name}</span>
              ))}
              {onAddToCollection && (
                <button
                  className="ghost-button detail-collection-add-btn"
                  onClick={() => onAddToCollection(manga.id)}
                  title="Ajouter à une collection"
                >
                  <PlusIcon size={12} />
                </button>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="detail-dates">
            {manga.addedAt && <span className="muted-text">Ajouté le {formatDate(manga.addedAt)}</span>}
            {manga.lastReadAt && <span className="muted-text">Lu pour la dernière fois le {formatDate(manga.lastReadAt)}</span>}
          </div>

          {/* Quick actions */}
          <div className="detail-actions-row">
            {resumeChapterId && (
              <button className="primary-button" onClick={() => onOpenChapter(resumeChapterId)}>
                <PlayIcon size={16} /> Reprendre la lecture
              </button>
            )}
            {manga.chapters[0] && (
              <>
                <button className="ghost-button" onClick={() => onOpenChapter(manga.chapters[0].id)}>
                  <ScrollIcon size={16} /> Premier chapitre
                </button>
                <button className="ghost-button" onClick={() => onOpenChapterInNewTab(manga.chapters[0].id)}>
                  <PlusIcon size={16} /> Nouvel onglet
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chapter list header */}
      <div className="section-header">
        <h2>Chapitres</h2>
        <span>{manga.chapters.length} élément{manga.chapters.length > 1 ? 's' : ''}</span>
      </div>

      {/* Chapter grid with per-chapter reading state dot */}
      <div className="chapter-grid">
        {manga.chapters.map((chapter, index) => (
          <button
            key={chapter.id}
            className="chapter-card"
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
              <span className="chapter-index">{String(index + 1).padStart(2, '0')}</span>
              <span className={getChapterDotClass(chapter)} />
            </div>
            <div className="chapter-card-body">
              <strong>{chapter.name}</strong>
              <span>
                {chapter.pageCount} pages
                {' · '}
                {chapter.isRead
                  ? 'Lu'
                  : `${getProgressPercent(chapter.progress)}%`
                }
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export default memo(MangaDetailView);
