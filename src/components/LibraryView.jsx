import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons.jsx';
import MangaCard from './MangaCard.jsx';

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
  const minCard = cardSize === 'compact' ? 180 : cardSize === 'large' ? 320 : 240;
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

  const ROW_HEIGHT = cardSize === 'compact' ? 460 : cardSize === 'large' ? 620 : 540;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 4,
    measureElement: (el) => el?.getBoundingClientRect().height ?? ROW_HEIGHT
  });

  // Scroll restoration using virtualizer.scrollToOffset for accuracy
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !initialScrollTop) return;
    restoredRef.current = false;
    savingBlockedRef.current = true;

    // Use the virtualizer's own scroll method for precise positioning
    virtualizer.scrollToOffset(initialScrollTop, { align: 'start' });

    const apply = () => {
      if (restoredRef.current) return;
      virtualizer.scrollToOffset(initialScrollTop, { align: 'start' });
      // Also set scrollTop directly as fallback
      if (el.scrollHeight > initialScrollTop) {
        el.scrollTop = initialScrollTop;
      }
      if (Math.abs(el.scrollTop - initialScrollTop) < 10) {
        restoredRef.current = true;
      }
    };

    const raf1 = requestAnimationFrame(apply);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(apply));
    const t1 = setTimeout(apply, 30);
    const t2 = setTimeout(apply, 80);
    const t3 = setTimeout(apply, 160);
    const t4 = setTimeout(() => { apply(); savingBlockedRef.current = false; }, 300);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      savingBlockedRef.current = false;
    };
  }, [scrollKey, initialScrollTop, virtualizer]);

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
                transform: `translateY(${vRow.start}px)`,
                '--grid-columns': columns
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
