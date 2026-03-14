import { memo, useCallback } from 'react';
import { HeartIcon } from './Icons.jsx';

/**
 * Unified MangaCard — premium overlay-on-cover style.
 * Large cover image with a strong gradient overlay at the bottom.
 * Title, meta, tags overlaid on the gradient. Glass-like border glow on hover.
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
      {/* Cover image */}
      <div className="mc-cover">
        {manga.coverSrc
          ? <img src={manga.coverSrc} alt={manga.displayTitle} loading="lazy" draggable={false} />
          : <div className="mc-cover-fallback">{(manga.displayTitle || '?')[0]}</div>
        }
      </div>

      {/* Top badges row */}
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

      {/* Bottom overlay */}
      <div className="mc-overlay">
        {/* Progress bar */}
        {pct > 0 && !manga.isRead && (
          <div className="mc-progress">
            <div className="mc-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        <h3 className="mc-title" title={manga.displayTitle}>{manga.displayTitle}</h3>

        {!compact && (
          <p className="mc-meta">
            {manga.chapterCount} ch.
            {manga.author ? ` · ${manga.author}` : ''}
            {pct > 0 ? ` · ${pct}%` : ''}
          </p>
        )}
        {compact && (
          <p className="mc-meta">
            {manga.chapterCount} ch.{pct > 0 ? ` · ${pct}%` : ''}
          </p>
        )}

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
