import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons.jsx';
import MangaCard from './MangaCard.jsx';
import MediaAsset from './MediaAsset.jsx';

function makeCarouselPicks(mangas, seed) {
  const key = `${seed}:${mangas.length}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(index);
    hash |= 0;
  }
  const decorated = mangas.map((manga, index) => ({ manga, score: Math.abs(((hash ^ (index * 2654435761)) >>> 0) + index * 17) }));
  return decorated.sort((a, b) => a.score - b.score).slice(0, Math.min(12, mangas.length)).map((entry) => entry.manga);
}

function HeroCarousel({ mangas, onOpen, onContextMenu }) {
  const seedRef = useRef(Math.random().toString(36).slice(2));
  const picks = useMemo(() => makeCarouselPicks(mangas, seedRef.current), [mangas]);
  const viewportRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const featured = picks[activeIdx] ?? picks[0] ?? null;

  function move(direction) {
    if (!picks.length) return;
    const next = (activeIdx + direction + picks.length) % picks.length;
    setActiveIdx(next);
    const viewport = viewportRef.current;
    if (!viewport) return;
    const card = viewport.querySelector(`[data-cidx="${next}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  if (!picks.length) return null;

  return (
    <div className="hero-card hero-card-carousel hero-card-carousel-spotlight">
      <div className="hero-carousel-copy">
        <div className="hero-carousel-copy-topline">A la une</div>
        <h2>Bienvenue dans ta bibliotheque.</h2>
        <p>{featured?.description ? `${featured.description.slice(0, 180)}${featured.description.length > 180 ? '...' : ''}` : 'Reprends un chapitre, decouvre une serie ou explore ta collection.'}</p>
        <div className="hero-carousel-copy-meta">
          <span className="status-pill">{featured?.chapterCount ?? 0} chapitre{(featured?.chapterCount ?? 0) > 1 ? 's' : ''}</span>
          {featured?.author ? <span className="status-pill">{featured.author}</span> : null}
          <span className="status-pill">{featured?.completedChapterCount ?? 0}/{featured?.chapterCount ?? 0} lus</span>
        </div>
      </div>
      <div className="hero-carousel-premium">
        <button type="button" className="hero-carousel-nav hero-carousel-nav-left" onClick={() => move(-1)}><ChevronLeftIcon size={18} /></button>
        <div ref={viewportRef} className="hero-carousel-shell">
          <div className="hero-carousel-track">
            {picks.map((manga, index) => (
              <button
                key={manga.id}
                type="button"
                data-cidx={index}
                className={`hero-carousel-card ${index === activeIdx ? 'hero-carousel-card-active' : ''}`}
                onClick={() => onOpen(manga.id)}
                onFocus={() => setActiveIdx(index)}
                onContextMenu={(event) => onContextMenu(event, { type: 'manga', manga })}
                title={manga.displayTitle}
              >
                {manga.coverSrc || manga.coverMediaType === 'pdf' ? (
                  <MediaAsset
                    src={manga.coverSrc}
                    alt={manga.displayTitle}
                    loading="lazy"
                    className="thumb-smooth thumb-media"
                    mediaType={manga.coverMediaType || 'image'}
                    filePath={manga.coverFilePath}
                    pageNumber={manga.coverPageNumber || 1}
                    maxWidth={320}
                    maxHeight={480}
                  />
                ) : <div className="cover-fallback">{manga.displayTitle[0]}</div>}
                <span className="hero-carousel-overlay">
                  <strong>{manga.displayTitle.length > 34 ? `${manga.displayTitle.slice(0, 33)}...` : manga.displayTitle}</strong>
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

function LibraryView({
  mangas,
  cardSize = 'comfortable',
  initialScrollTop = 0,
  scrollKey,
  onScrollPositionChange,
  onOpenManga,
  onOpenMangaInBackgroundTab,
  onToggleFavorite,
  onContextMenu,
  showHero = true,
  selectionMode = false,
  selectedIds = new Set(),
  onToggleSelect
}) {
  const containerRef = useRef(null);
  const restoredRef = useRef(false);
  const savingBlockedRef = useRef(false);
  const minCard = cardSize === 'compact' ? 180 : cardSize === 'large' ? 320 : 240;
  const [columns, setColumns] = useState(5);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const width = entry.contentRect.width - 48;
        setColumns(Math.max(2, Math.floor(width / minCard)));
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [minCard]);

  const rows = useMemo(() => {
    const result = [];
    for (let index = 0; index < mangas.length; index += columns) {
      result.push(mangas.slice(index, index + columns));
    }
    return result;
  }, [mangas, columns]);

  const rowHeight = cardSize === 'compact' ? 460 : cardSize === 'large' ? 620 : 540;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
    measureElement: (element) => element?.getBoundingClientRect().height ?? rowHeight
  });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || !initialScrollTop) return undefined;
    restoredRef.current = false;
    savingBlockedRef.current = true;
    virtualizer.scrollToOffset(initialScrollTop, { align: 'start' });

    const apply = () => {
      if (restoredRef.current) return;
      virtualizer.scrollToOffset(initialScrollTop, { align: 'start' });
      if (element.scrollHeight > initialScrollTop) element.scrollTop = initialScrollTop;
      if (Math.abs(element.scrollTop - initialScrollTop) < 10) restoredRef.current = true;
    };

    const raf1 = requestAnimationFrame(apply);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(apply));
    const timers = [30, 80, 160].map((delay) => window.setTimeout(apply, delay));
    const releaseTimer = window.setTimeout(() => {
      apply();
      savingBlockedRef.current = false;
    }, 300);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(releaseTimer);
      savingBlockedRef.current = false;
    };
  }, [scrollKey, initialScrollTop, virtualizer]);

  const handleScroll = useCallback(() => {
    if (savingBlockedRef.current) return;
    const element = containerRef.current;
    if (element) onScrollPositionChange?.(element.scrollTop);
  }, [onScrollPositionChange]);

  useEffect(() => () => {
    const element = containerRef.current;
    if (element) onScrollPositionChange?.(element.scrollTop);
  }, [onScrollPositionChange]);

  return (
    <section className="library-view" ref={containerRef} onScroll={handleScroll}>
      {showHero && mangas.length > 0 && !selectionMode ? (
        <HeroCarousel mangas={mangas} onOpen={onOpenManga} onContextMenu={onContextMenu} />
      ) : null}

      {mangas.length === 0 ? (
        <div className="empty-card">
          <h3>Aucun manga a afficher</h3>
          <p>Ajoute des categories, change de filtre ou verifie tes categories masquees.</p>
        </div>
      ) : (
        <div className="manga-grid-virtual" style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="manga-grid-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                '--grid-columns': columns
              }}
            >
              {rows[virtualRow.index]?.map((manga) => (
                <MangaCard
                  key={manga.id}
                  manga={manga}
                  onOpen={onOpenManga}
                  onOpenBackground={onOpenMangaInBackgroundTab}
                  onToggleFavorite={onToggleFavorite}
                  onContextMenu={onContextMenu}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(manga.id)}
                  onToggleSelect={onToggleSelect}
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
