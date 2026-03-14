import { memo, useCallback } from 'react';
import { HeartIcon } from './Icons.jsx';

/**
 * Unified MangaCard — cover + info card style.
 * Cover image on top with overlay badges, info section below with
 * title, author, chapter count, progress, and tags.
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
      className={`mc ${compact ? 'mc-compact' : ''}`}
      onClick={handleClick}
      onMouseDown={handleMiddleDown}
      onMouseUp={handleMiddleUp}
      onContextMenu={handleCtx}
    >
      {/* Cover section */}
      <div className="mc-cover">
        {manga.coverSrc
          ? <img src={manga.coverSrc} alt={manga.displayTitle} loading="lazy" draggable={false} />
          : <div className="mc-cover-fallback">{(manga.displayTitle || '?')[0]}</div>
        }

        {/* Progress bar on cover */}
        {pct > 0 && !manga.isRead && (
          <div className="mc-progress">
            <div className="mc-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Top badges */}
        <div className="mc-badges">
          {stateLabel && (
            <span className={`mc-badge ${manga.isRead ? 'mc-badge-read' : 'mc-badge-progress'}`}>
              {stateLabel}
            </span>
          )}
          {manga.hasNewChapters && (
            <span className="mc-badge mc-badge-new">Nouveau</span>
          )}
        </div>

        {/* Favorite heart */}
        {onToggleFavorite && (
          <button
            className={`mc-fav ${manga.isFavorite ? 'mc-fav-active' : ''}`}
            onClick={handleFav}
            title={manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <HeartIcon size={14} filled={manga.isFavorite} />
          </button>
        )}
      </div>

      {/* Info section below cover */}
      <div className="mc-info">
        <h3 className="mc-title" title={manga.displayTitle}>{manga.displayTitle}</h3>

        {!compact && manga.author && (
          <p className="mc-author">{manga.author}</p>
        )}

        <div className="mc-stats">
          <span className="mc-stat">{manga.chapterCount} ch.</span>
          {pct > 0 && <span className="mc-stat mc-stat-progress">{pct}%</span>}
          {!compact && manga.completedChapterCount > 0 && (
            <span className="mc-stat">{manga.completedChapterCount}/{manga.chapterCount}</span>
          )}
        </div>

        {!compact && manga.tags && manga.tags.length > 0 && (
          <div className="mc-tags">
            {manga.tags.slice(0, 3).map((t) => (
              <span key={t.id} className="mc-tag" style={{ '--tc': t.color || 'var(--accent)' }}>{t.name}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});

export default MangaCard;
