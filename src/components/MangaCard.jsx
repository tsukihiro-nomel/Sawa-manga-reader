import { memo, useCallback, useRef } from 'react';
import { ArchiveIcon, CheckIcon, HeartIcon } from './Icons.jsx';
import MediaAsset from './MediaAsset.jsx';

const MangaCard = memo(function MangaCard({
  manga,
  onOpen,
  onOpenBackground,
  onToggleFavorite,
  onContextMenu,
  compact = false,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  privateBlur = false
}) {
  const cardRef = useRef(null);

  const handleClick = useCallback(() => {
    if (selectionMode) {
      onToggleSelect?.(manga.id);
      return;
    }
    onOpen?.(manga.id);
  }, [selectionMode, onToggleSelect, manga.id, onOpen]);

  const handleMiddleUp = useCallback((event) => {
    if (selectionMode || event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenBackground?.(manga.id);
  }, [selectionMode, manga.id, onOpenBackground]);

  const handleMiddleDown = useCallback((event) => {
    if (event.button === 1) event.preventDefault();
  }, []);

  const handleFavorite = useCallback((event) => {
    event.stopPropagation();
    onToggleFavorite?.(manga.id);
  }, [manga.id, onToggleFavorite]);

  const handleSelectButton = useCallback((event) => {
    event.stopPropagation();
    onToggleSelect?.(manga.id);
  }, [manga.id, onToggleSelect]);

  const handleContext = useCallback((event) => onContextMenu?.(event, { type: 'manga', manga }), [manga, onContextMenu]);

  const handlePointerMove = useCallback((event) => {
    if (compact || selectionMode) return;
    const node = cardRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const tiltX = (0.5 - py) * 4.2;
    const tiltY = (px - 0.5) * 4.8;
    node.style.setProperty('--mc-tilt-x', `${tiltX.toFixed(2)}deg`);
    node.style.setProperty('--mc-tilt-y', `${tiltY.toFixed(2)}deg`);
    node.style.setProperty('--mc-shine-x', `${(px * 100).toFixed(1)}%`);
    node.style.setProperty('--mc-shine-y', `${(py * 100).toFixed(1)}%`);
  }, [compact, selectionMode]);

  const handlePointerLeave = useCallback(() => {
    const node = cardRef.current;
    if (!node) return;
    node.style.removeProperty('--mc-tilt-x');
    node.style.removeProperty('--mc-tilt-y');
    node.style.removeProperty('--mc-shine-x');
    node.style.removeProperty('--mc-shine-y');
  }, []);

  const progressPercent = manga.progressPercent ?? 0;
  const stateLabel = manga.isRead ? 'Lu' : progressPercent > 0 ? 'En cours' : null;
  const allTags = manga.tags || [];
  const visibleTags = compact ? [] : allTags.slice(0, 3);
  const extraCount = Math.max(0, allTags.length - 3);
  const infoFragments = [`${manga.chapterCount} ch.`];
  if (!compact && manga.author) infoFragments.push(manga.author);
  if (progressPercent > 0) infoFragments.push(`${progressPercent}%`);

  return (
    <article
      ref={cardRef}
      className={[
        'mc',
        compact ? 'mc-compact' : '',
        selectionMode ? 'mc-select-mode' : '',
        selected ? 'mc-selected' : '',
        privateBlur ? 'mc-private' : ''
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      onMouseDown={handleMiddleDown}
      onMouseUp={handleMiddleUp}
      onContextMenu={handleContext}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="mc-chrome" aria-hidden="true" />
      <div className="mc-rim" aria-hidden="true" />
      <div className="mc-ambient" aria-hidden="true" />

      <div className="mc-cover-shell">
        <div className="mc-cover">
          {manga.coverSrc || manga.coverMediaType === 'pdf' ? (
            <MediaAsset
              src={manga.coverSrc}
              alt={manga.displayTitle}
              loading="lazy"
              draggable={false}
              className="thumb-smooth thumb-media"
              mediaType={manga.coverMediaType || 'image'}
              filePath={manga.coverFilePath}
              pageNumber={manga.coverPageNumber || 1}
              maxWidth={560}
              maxHeight={840}
            />
          ) : (
            <div className="mc-cover-fallback">{(manga.displayTitle || '?')[0]}</div>
          )}

          <div className="mc-cover-glow" aria-hidden="true" />
          <div className="mc-cover-shade" aria-hidden="true" />
          <div className="mc-cover-border" aria-hidden="true" />

          {progressPercent > 0 && !manga.isRead ? (
            <div className="mc-progress">
              <div className="mc-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          ) : null}

          <div className="mc-badges">
            {stateLabel ? (
              <span className={`mc-badge ${manga.isRead ? 'mc-badge-read' : 'mc-badge-progress'}`}>
                {stateLabel}
              </span>
            ) : null}
            {manga.hasNewChapters ? <span className="mc-badge mc-badge-new">Nouveau</span> : null}
            {manga.isPrivate ? <span className="mc-badge mc-badge-private"><ArchiveIcon size={11} /> Prive</span> : null}
          </div>

          {selectionMode ? (
            <button type="button" className={`mc-select-toggle ${selected ? 'mc-select-toggle-active' : ''}`} onClick={handleSelectButton} title={selected ? 'Retirer de la selection' : 'Ajouter a la selection'}>
              <CheckIcon size={14} />
            </button>
          ) : onToggleFavorite ? (
            <button
              type="button"
              className={`mc-fav ${manga.isFavorite ? 'mc-fav-active' : ''}`}
              onClick={handleFavorite}
              title={manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <HeartIcon size={14} filled={manga.isFavorite} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mc-info">
        <h3 className="mc-title" title={manga.displayTitle}>{manga.displayTitle}</h3>

        {visibleTags.length > 0 ? (
          <div className="mc-tags">
            {visibleTags.map((tag) => (
              <span key={tag.id} className="mc-tag" style={{ '--tc': tag.color || 'var(--accent)' }}>{tag.name}</span>
            ))}
            {extraCount > 0 ? <span className="mc-tag mc-tag-extra">+{extraCount}</span> : null}
          </div>
        ) : null}

        <div className="mc-meta-line">
          {infoFragments.map((fragment, index) => (
            <span key={`${fragment}-${index}`}>
              {index > 0 ? <span className="mc-meta-sep">&#9702;</span> : null}
              <span className={fragment.endsWith('%') ? 'mc-meta-accent' : ''}>{fragment}</span>
            </span>
          ))}
        </div>
      </div>
    </article>
  );
});

export default MangaCard;
