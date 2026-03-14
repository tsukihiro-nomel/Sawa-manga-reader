import { memo, useCallback } from 'react';
import { HeartIcon } from './Icons.jsx';

/**
 * Unified MangaCard — overlay-on-cover style.
 * Title, meta, tags and progress are overlaid on the cover via a gradient.
 * Used consistently across Library, Dashboard, and Collection detail views.
 */
const MangaCard = memo(function MangaCard({
  manga,
  onOpen,
  onOpenBackground,
  onToggleFavorite,
  onContextMenu,
  compact = false
}) {
  const handleClick = useCallback(() => onOpen(manga.id), [manga.id, onOpen]);
  const handleMiddleUp = useCallback((e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    onOpenBackground?.(manga.id);
  }, [manga.id, onOpenBackground]);
  const handleMiddleDown = useCallback((e) => { if (e.button === 1) e.preventDefault(); }, []);
  const handleFav = useCallback((e) => { e.stopPropagation(); onToggleFavorite?.(manga.id); }, [manga.id, onToggleFavorite]);
  const handleCtx = useCallback((e) => onContextMenu?.(e, { type: 'manga', manga }), [manga, onContextMenu]);

  const pct = manga.progressPercent ?? 0;
  const stateLabel = manga.isRead ? 'Lu' : pct > 0 ? 'En cours' : null;

  return (
    <article
      className={`manga-card manga-card-overlay ${compact ? 'manga-card-compact' : ''}`}
      onClick={handleClick}
      onMouseDown={handleMiddleDown}
      onMouseUp={handleMiddleUp}
      onContextMenu={handleCtx}
    >
      <div className="manga-cover-wrap">
        {manga.coverSrc
          ? <img className="manga-cover" src={manga.coverSrc} alt={manga.displayTitle} loading="lazy" />
          : <div className="cover-fallback">{(manga.displayTitle || '?')[0]}</div>
        }

        {/* Top-left badges */}
        {stateLabel && (
          <div className={`manga-card-badge manga-card-badge-state ${manga.isRead ? 'manga-card-badge-read' : ''}`}>
            {stateLabel}
          </div>
        )}
        {manga.hasNewChapters && !stateLabel && (
          <div className="manga-card-badge manga-card-badge-new">Nouveau</div>
        )}
        {manga.hasNewChapters && stateLabel && (
          <div className="manga-card-badge manga-card-badge-new manga-card-badge-new-offset">Nouveau</div>
        )}

        {/* Favorite button top-right */}
        {onToggleFavorite && (
          <button
            className={`favorite-toggle ${manga.isFavorite ? 'favorite-toggle-active' : ''}`}
            onClick={handleFav}
            title={manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <HeartIcon size={14} filled={manga.isFavorite} />
          </button>
        )}

        {/* Bottom gradient overlay with info */}
        <div className="manga-card-overlay-info">
          <div className="manga-card-overlay-content">
            <h3 title={manga.displayTitle}>{manga.displayTitle}</h3>
            <div className="manga-card-overlay-meta">
              <span>{manga.chapterCount} ch.</span>
              {manga.author && <span>{manga.author}</span>}
              {pct > 0 && <span>{pct}%</span>}
            </div>
            {!compact && manga.tags && manga.tags.length > 0 && (
              <div className="manga-card-overlay-tags">
                {manga.tags.slice(0, 3).map((t) => (
                  <span key={t.id} className="manga-tag-pill" style={{ '--tag-color': t.color }}>{t.name}</span>
                ))}
              </div>
            )}
          </div>
          {/* Progress bar at very bottom of overlay */}
          {pct > 0 && !manga.isRead && (
            <div className="manga-card-overlay-progress">
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
});

export default MangaCard;
