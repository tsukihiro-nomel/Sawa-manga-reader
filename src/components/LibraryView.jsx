import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeftIcon, ChevronRightIcon, HeartIcon } from './Icons.jsx';

// ---------------------------------------------------------------------------
// Manga Card (memoized, lightweight)
// ---------------------------------------------------------------------------

const MangaCard = memo(function MangaCard({
  manga,
  onOpen,
  onOpenBackground,
  onToggleFavorite,
  onContextMenu
}) {
  const handleClick = useCallback(() => onOpen(manga.id), [manga.id, onOpen]);
  const handleMiddleUp = useCallback((e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    onOpenBackground?.(manga.id);
  }, [manga.id, onOpenBackground]);
  const handleMiddleDown = useCallback((e) => { if (e.button === 1) e.preventDefault(); }, []);
  const handleFav = useCallback((e) => { e.stopPropagation(); onToggleFavorite(manga.id); }, [manga.id, onToggleFavorite]);
  const handleCtx = useCallback((e) => onContextMenu(e, { type: 'manga', manga }), [manga, onContextMenu]);

  return (
    <article className="manga-card" onClick={handleClick} onMouseDown={handleMiddleDown} onMouseUp={handleMiddleUp} onContextMenu={handleCtx}>
      <div className="manga-cover-wrap">
        {manga.coverSrc
          ? <img className="manga-cover" src={manga.coverSrc} alt={manga.displayTitle} loading="lazy" />
          : <div className="cover-fallback">{(manga.displayTitle || '?')[0]}</div>
        }
        <button
          className={`favorite-toggle ${manga.isFavorite ? 'favorite-toggle-active' : ''}`}
          onClick={handleFav}
          onContextMenu={handleCtx}
          title={manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <HeartIcon size={16} filled={manga.isFavorite} />
        </button>
        <div className="progress-chip">{manga.progressPercent ?? 0}%</div>
        {manga.hasNewChapters && <div className="new-chapter-chip">Nouveau</div>}
        {manga.isRead && <div className="read-chip">Lu</div>}
      </div>
      <div className="manga-card-body">
        <div className="manga-card-meta-top">
          <span>{manga.chapterCount} ch{manga.chapterCount > 1 ? '.' : '.'}</span>
          {manga.author && <span>{manga.author}</span>}
          <span>{manga.completedChapterCount ?? 0}/{manga.chapterCount} lus</span>
        </div>
        <h3>{manga.displayTitle}</h3>
        {manga.tags && manga.tags.length > 0 && (
          <div className="manga-card-tags">
            {manga.tags.slice(0, 3).map((t) => (
              <span key={t.id} className="manga-tag-pill" style={{ '--tag-color': t.color }}>{t.name}</span>
            ))}
          </div>
        )}
        <p className="manga-description-clamp">{manga.description || 'Pas de description.'}</p>
        <div className="progress-line"><span style={{ width: `${manga.progressPercent ?? 0}%` }} /></div>
      </div>
    </article>
  );
});

// ---------------------------------------------------------------------------
// Hero Carousel (simplified for v2)
// ---------------------------------------------------------------------------

function makeCarouselPicks(mangas, seed) {
  const key = `${seed}:${mangas.length}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) { hash = ((hash << 5) - hash) + key.charCodeAt(i); hash |= 0; }
  const decorated = mangas.map((m, i) => ({ m, score: Math.abs(((hash ^ (i * 2654435761)) >>> 0) + i * 17) }));
  return decorated.sort((a, b) => a.score - b.score).slice(0, Math.min(12, mangas.length)).map((e) => e.m);
}

function HeroCarousel({ mangas, onOpen, onContextMenu }) {
  const seedRef = useRef(Math.random().toString(36).slice(2));
  const picks = useMemo(() => makeCarouselPicks(mangas, seedRef.current), [mangas]);
  const viewportRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const featured = picks[activeIdx] ?? picks[0] ?? null;

  function move(dir) {
    if (!picks.length) return;
    const next = (activeIdx + dir + picks.length) % picks.length;
    setActiveIdx(next);
    const vp = viewportRef.current;
    if (vp) {
      const card = vp.querySelector(`[data-cidx="${next}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  if (!picks.length) return null;

  return (
    <div className="hero-card hero-card-carousel hero-card-carousel-spotlight">
      <div className="hero-carousel-copy">
        <div className="hero-carousel-copy-topline">À la une</div>
        <h2>Bienvenue dans ta bibliothèque.</h2>
        <p>{featured?.description ? featured.description.slice(0, 180) + (featured.description.length > 180 ? '…' : '') : 'Reprends un chapitre, découvre une série ou explore ta collection.'}</p>
        <div className="hero-carousel-copy-meta">
          <span className="status-pill">{featured?.chapterCount ?? 0} chapitre{(featured?.chapterCount ?? 0) > 1 ? 's' : ''}</span>
          {featured?.author && <span className="status-pill">{featured.author}</span>}
          <span className="status-pill">{featured?.completedChapterCount ?? 0}/{featured?.chapterCount ?? 0} lus</span>
        </div>
      </div>
      <div className="hero-carousel-premium">
        <button type="button" className="hero-carousel-nav hero-carousel-nav-left" onClick={() => move(-1)}><ChevronLeftIcon size={18} /></button>
        <div ref={viewportRef} className="hero-carousel-shell">
          <div className="hero-carousel-track">
            {picks.map((manga, idx) => (
              <button
                key={manga.id}
                type="button"
                data-cidx={idx}
                className={`hero-carousel-card ${idx === activeIdx ? 'hero-carousel-card-active' : ''}`}
                onClick={() => onOpen(manga.id)}
                onFocus={() => setActiveIdx(idx)}
                onContextMenu={(e) => onContextMenu(e, { type: 'manga', manga })}
                title={manga.displayTitle}
              >
                {manga.coverSrc
                  ? <img src={manga.coverSrc} alt={manga.displayTitle} loading="lazy" />
                  : <div className="cover-fallback">{manga.displayTitle[0]}</div>
                }
                <span className="hero-carousel-overlay">
                  <strong>{manga.displayTitle.length > 34 ? manga.displayTitle.slice(0, 33) + '…' : manga.displayTitle}</strong>
                  <small>{manga.chapterCount} ch.</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="hero-carousel-nav hero-carousel-nav-right" onClick={() => move(1)}><ChevronRightIcon size={18} /></button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Virtualized Library Grid
// ---------------------------------------------------------------------------

function LibraryView({
  mangas,
  activeShelf,
  categories,
  cardSize = 'comfortable',
  initialScrollTop = 0,
  scrollKey,
  onScrollPositionChange,
  onOpenManga,
  onOpenMangaInBackgroundTab,
  onToggleFavorite,
  onContextMenu,
  showHero = true
}) {
  const containerRef = useRef(null);
  const restoredRef = useRef(false);
  const savingBlockedRef = useRef(false);

  // Calculate columns based on container width and card size setting
  const minCard = cardSize === 'compact' ? 190 : cardSize === 'large' ? 250 : 215;
  const [columns, setColumns] = useState(5);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width - 48; // padding
        setColumns(Math.max(2, Math.floor(w / minCard)));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minCard]);

  const rows = useMemo(() => {
    const result = [];
    for (let i = 0; i < mangas.length; i += columns) {
      result.push(mangas.slice(i, i + columns));
    }
    return result;
  }, [mangas, columns]);

  const ROW_HEIGHT = cardSize === 'compact' ? 440 : cardSize === 'large' ? 580 : 520;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
    measureElement: (el) => el?.getBoundingClientRect().height ?? ROW_HEIGHT
  });

  // Scroll restoration: one-shot, context-aware
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !initialScrollTop) return;
    restoredRef.current = false;
    savingBlockedRef.current = true;

    const apply = () => {
      if (restoredRef.current) return;
      if (el.scrollHeight >= initialScrollTop) {
        el.scrollTop = initialScrollTop;
        restoredRef.current = true;
        setTimeout(() => { savingBlockedRef.current = false; }, 100);
      }
    };

    apply();
    const raf = requestAnimationFrame(apply);
    const t1 = setTimeout(apply, 80);
    const t2 = setTimeout(() => { apply(); savingBlockedRef.current = false; }, 200);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      savingBlockedRef.current = false;
    };
  }, [scrollKey, initialScrollTop]);

  // Save scroll position on scroll
  const handleScroll = useCallback(() => {
    if (savingBlockedRef.current) return;
    const el = containerRef.current;
    if (el) onScrollPositionChange?.(el.scrollTop);
  }, [onScrollPositionChange]);

  // Save on unmount
  useEffect(() => () => {
    const el = containerRef.current;
    if (el) onScrollPositionChange?.(el.scrollTop);
  }, [onScrollPositionChange]);

  return (
    <section className="library-view" ref={containerRef} onScroll={handleScroll}>
      {showHero && mangas.length > 0 && (
        <HeroCarousel mangas={mangas} onOpen={onOpenManga} onContextMenu={onContextMenu} />
      )}

      {mangas.length === 0 ? (
        <div className="empty-card">
          <h3>Aucun manga à afficher</h3>
          <p>Ajoute des catégories, change de filtre ou vérifie tes catégories masquées.</p>
        </div>
      ) : (
        <div
          className="manga-grid-virtual"
          style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((vRow) => (
            <div
              key={vRow.key}
              ref={virtualizer.measureElement}
              data-index={vRow.index}
              className="manga-grid-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vRow.start}px)`
              }}
            >
              {rows[vRow.index]?.map((manga) => (
                <MangaCard
                  key={manga.id}
                  manga={manga}
                  onOpen={onOpenManga}
                  onOpenBackground={onOpenMangaInBackgroundTab}
                  onToggleFavorite={onToggleFavorite}
                  onContextMenu={onContextMenu}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default memo(LibraryView);
