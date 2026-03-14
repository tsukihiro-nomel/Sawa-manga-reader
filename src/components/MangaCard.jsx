import { memo, useCallback } from 'react';
import { HeartIcon } from './Icons.jsx';

/**
 * Unified MangaCard — matches the premium reference design.
 * Cover fully visible (contain, not crop), status badge, heart,
 * title, tags with +N overflow, info line with separators.
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

  // Unified tags: manga.tags (resolved tag objects)
  const allTags = manga.tags || [];
  const visibleTags = compact ? [] : allTags.slice(0, 3);
  const extraCount = Math.max(0, allTags.length - 3);

  // Build info fragments: "X ch. ◦ Auteur ◦ Y%"
  const infoFragments = [];
  infoFragments.push(`${manga.chapterCount} ch.`);
  if (!compact && manga.author) infoFragments.push(manga.author);
  if (pct > 0) infoFragments.push(`${pct}%`);

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

        {visibleTags.length > 0 && (
          <div className="mc-tags">
            {visibleTags.map((t) => (
              <span key={t.id} className="mc-tag" style={{ '--tc': t.color || 'var(--accent)' }}>{t.name}</span>
            ))}
            {extraCount > 0 && (
              <span className="mc-tag mc-tag-extra">+{extraCount}</span>
            )}
          </div>
        )}

        <div className="mc-meta-line">
          {infoFragments.map((frag, i) => (
            <span key={i}>
              {i > 0 && <span className="mc-meta-sep">&#9702;</span>}
              <span className={frag.endsWith('%') ? 'mc-meta-accent' : ''}>{frag}</span>
            </span>
          ))}
        </div>
      </div>
    </article>
  );
});

export default MangaCard;
