import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeartIcon } from './Icons.jsx';

const HYDRATION_BATCH = 20;
const HYDRATION_DELAY = 40;
const OVERSCAN_ROWS = 4;
const CARD_GAP = 20;
const DEFAULT_CARD_MIN = 215;
const CARD_BODY_EST = 200;
const hydrationCache = new Map();
const mergedCardCache = new Map();

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

function readStateLabel(readState) {
  if (readState === 'read') return 'Lu';
  if (readState === 'to-resume') return 'À reprendre';
  if (readState === 'in-progress') return 'En cours';
  return 'Jamais ouvert';
}

const MangaCard = memo(function MangaCard({
  manga,
  onOpenManga,
  onOpenMangaInBackgroundTab,
  onToggleFavorite,
  onContextMenu,
  priority = false
}) {
  const hydrated = Boolean(manga.cardHydrated);
  const description = hydrated
    ? (manga.description || 'Pas encore de description. Tu peux en ajouter une dans la fiche manga ou via l\u2019assistant optionnel.')
    : 'Chargement progressif des informations\u2026';
  const tags = hydrated ? (manga.tags || []) : [];

  return (
    <article
      className={`manga-card manga-card-stable ${hydrated ? '' : 'manga-card-pending'}`.trim()}
      onClick={() => onOpenManga(manga.id)}
      onMouseDown={middleMouseDown}
      onMouseUp={(event) => middleMouseUp(event, () => onOpenMangaInBackgroundTab?.(manga.id))}
      onContextMenu={(event) => onContextMenu(event, { type: 'manga', manga })}
    >
      <div className="manga-cover-wrap manga-cover-wrap-stable">
        {manga.coverSrc ? (
          <img
            className="manga-cover manga-cover-stable"
            src={manga.coverSrc}
            alt={manga.displayTitle}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            draggable={false}
          />
        ) : (
          <div className="cover-fallback manga-cover-fallback-stable">{manga.displayTitle?.[0] || '?'}</div>
        )}
        <button
          className={`favorite-toggle ${manga.isFavorite ? 'favorite-toggle-active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(manga.id);
          }}
          title={manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <HeartIcon size={18} filled={manga.isFavorite} />
        </button>
        <div className="progress-chip">{manga.progressPercent}%</div>
      </div>

      <div className="manga-card-body manga-card-body-stable">
        <div className="manga-card-topline manga-card-topline-stable">
          <span>{manga.chapterCount} chap.</span>
          <span>{readStateLabel(manga.readState)}</span>
        </div>
        <h3>{manga.displayTitle}</h3>
        <p className={hydrated ? '' : 'manga-card-loading-copy'}>{description}</p>
        {tags.length ? (
          <div className="detail-tags manga-card-tags-stable">
            {tags.slice(0, 4).map((tag) => (
              <span key={tag.id} className="badge-pill">#{tag.name}</span>
            ))}
          </div>
        ) : (
          <div className="manga-card-tags-stable manga-card-tags-placeholder" aria-hidden="true">
            <span className="manga-tag-skeleton" />
            <span className="manga-tag-skeleton short" />
          </div>
        )}
      </div>
    </article>
  );
});

function computeGridLayout(containerWidth) {
  if (containerWidth <= 0) return { columns: 4, rowHeight: 500 };
  const cols = Math.max(1, Math.floor((containerWidth + CARD_GAP) / (DEFAULT_CARD_MIN + CARD_GAP)));
  const cardWidth = (containerWidth - (cols - 1) * CARD_GAP) / cols;
  const coverHeight = cardWidth / 0.72;
  const rowHeight = coverHeight + CARD_BODY_EST + CARD_GAP;
  return { columns: cols, rowHeight };
}

function MangaGridStable({
  mangas,
  progressive = false,
  emptyTitle = 'Aucun manga \u00e0 afficher',
  emptyText = 'Ajoute des cat\u00e9gories, change de filtre ou v\u00e9rifie si une cat\u00e9gorie n\u2019est pas masqu\u00e9e.',
  onOpenManga,
  onOpenMangaInBackgroundTab,
  onToggleFavorite,
  onContextMenu
}) {
  const gridRef = useRef(null);
  const hydrationTimerRef = useRef(0);
  const hydrationLoadingRef = useRef(new Set());
  const total = mangas.length;

  const stableOpenManga = useCallback((id) => onOpenManga(id), [onOpenManga]);
  const stableOpenBg = useCallback((id) => onOpenMangaInBackgroundTab?.(id), [onOpenMangaInBackgroundTab]);
  const stableToggleFav = useCallback((id) => onToggleFavorite(id), [onToggleFavorite]);
  const stableContextMenu = useCallback((e, d) => onContextMenu(e, d), [onContextMenu]);

  const [hydrationVersion, setHydrationVersion] = useState(0);
  const [layout, setLayout] = useState({ columns: 4, rowHeight: 500 });
  const [visibleWindow, setVisibleWindow] = useState({ startRow: 0, endRow: 10 });

  // Measure grid width → compute columns and row height
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const ro = new ResizeObserver(([entry]) => {
      setLayout(computeGridLayout(entry.contentRect.width));
    });
    ro.observe(grid);
    return () => ro.disconnect();
  }, []);

  // Track parent scroll container → compute visible row range
  useEffect(() => {
    if (!progressive || total === 0) return;
    const grid = gridRef.current;
    if (!grid) return;
    const scrollContainer = grid.closest('.curved-scroll-content');
    if (!scrollContainer) return;

    let rafId = 0;

    function update() {
      const st = scrollContainer.scrollTop;
      const vh = scrollContainer.clientHeight;
      const gridRect = grid.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const gridTop = gridRect.top - containerRect.top + st;
      const relScroll = Math.max(0, st - gridTop);
      const { columns, rowHeight } = layout;
      if (rowHeight <= 0 || columns <= 0) return;
      const totalRows = Math.ceil(total / columns);
      const firstRow = Math.floor(relScroll / rowHeight);
      const lastRow = Math.min(totalRows - 1, Math.ceil((relScroll + vh) / rowHeight));
      const sRow = Math.max(0, firstRow - OVERSCAN_ROWS);
      const eRow = Math.min(totalRows - 1, lastRow + OVERSCAN_ROWS);
      setVisibleWindow((prev) => {
        if (prev.startRow === sRow && prev.endRow === eRow) return prev;
        return { startRow: sRow, endRow: eRow };
      });
    }

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    update();
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });

    const sizeObs = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    });
    sizeObs.observe(scrollContainer);

    return () => {
      scrollContainer.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
      sizeObs.disconnect();
    };
  }, [progressive, total, layout]);

  // Cleanup hydration timers on unmount
  useEffect(() => {
    return () => {
      window.clearTimeout(hydrationTimerRef.current);
      hydrationLoadingRef.current.clear();
    };
  }, []);

  // Merge summary data with hydrated card data
  const allCards = useMemo(() => {
    return mangas.map((summary) => {
      const hydrated = hydrationCache.get(summary.id);
      if (hydrated) {
        const existing = mergedCardCache.get(summary.id);
        if (existing && existing._src === summary && existing._hyd === hydrated) {
          return existing;
        }
        const merged = {
          ...summary,
          ...hydrated,
          tagIds: hydrated.tagIds || summary.tagIds || [],
          collectionIds: hydrated.collectionIds || summary.collectionIds || [],
          resumeChapter: hydrated.resumeChapter || summary.resumeChapter || null,
          chapterIds: hydrated.chapterIds || summary.chapterIds || [],
          _src: summary,
          _hyd: hydrated
        };
        mergedCardCache.set(summary.id, merged);
        return merged;
      }
      return summary;
    });
  }, [mangas, hydrationVersion]);

  // Hydration: fetch card details in batches
  useEffect(() => {
    if (!window.mangaAPI?.getMangaCardBatch) return undefined;

    const idsToHydrate = [];
    for (let i = 0; i < total; i++) {
      const id = mangas[i].id;
      if (!hydrationCache.has(id) && !hydrationLoadingRef.current.has(id)) {
        idsToHydrate.push(id);
      }
    }

    if (!idsToHydrate.length) return undefined;

    let cancelled = false;
    const queue = [...idsToHydrate];

    async function flushBatch() {
      if (cancelled || !queue.length) return;
      const batch = queue.splice(0, HYDRATION_BATCH);
      batch.forEach((id) => hydrationLoadingRef.current.add(id));

      try {
        const result = await window.mangaAPI.getMangaCardBatch(batch);
        if (cancelled || !result?.ok || !Array.isArray(result.mangas)) return;

        for (const manga of result.mangas) {
          hydrationCache.set(manga.id, manga);
        }
        setHydrationVersion((v) => v + 1);
      } catch {
        // noop
      } finally {
        batch.forEach((id) => hydrationLoadingRef.current.delete(id));
      }

      if (!cancelled && queue.length) {
        hydrationTimerRef.current = window.setTimeout(flushBatch, HYDRATION_DELAY);
      }
    }

    hydrationTimerRef.current = window.setTimeout(flushBatch, 16);

    return () => {
      cancelled = true;
      window.clearTimeout(hydrationTimerRef.current);
    };
  }, [mangas, total]);

  if (total === 0) {
    return (
      <div className="empty-card">
        <h3>{emptyTitle}</h3>
        <p>{emptyText}</p>
      </div>
    );
  }

  // Non-progressive: render all items (dashboard sections with few items)
  if (!progressive) {
    return (
      <div ref={gridRef} className="manga-grid manga-grid-stable">
        {allCards.map((manga, i) => (
          <MangaCard
            key={manga.id}
            manga={manga}
            priority={i < 8}
            onOpenManga={stableOpenManga}
            onOpenMangaInBackgroundTab={stableOpenBg}
            onToggleFavorite={stableToggleFav}
            onContextMenu={stableContextMenu}
          />
        ))}
      </div>
    );
  }

  // Virtual grid: only render visible rows + overscan
  const { columns, rowHeight } = layout;
  const totalRows = Math.ceil(total / columns);
  const totalHeight = totalRows * rowHeight;
  const { startRow, endRow } = visibleWindow;
  const startIdx = startRow * columns;
  const endIdx = Math.min(total, (endRow + 1) * columns);
  const visibleCards = allCards.slice(startIdx, endIdx);
  const offsetTop = startRow * rowHeight;

  return (
    <div
      ref={gridRef}
      className="manga-grid manga-grid-stable manga-grid-virtual"
      style={{ height: totalHeight }}
    >
      <div
        className="manga-grid-virtual-window"
        style={{
          transform: `translateY(${offsetTop}px)`,
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: `${CARD_GAP}px`,
        }}
      >
        {visibleCards.map((manga, i) => (
          <MangaCard
            key={manga.id}
            manga={manga}
            priority={startIdx + i < 8}
            onOpenManga={stableOpenManga}
            onOpenMangaInBackgroundTab={stableOpenBg}
            onToggleFavorite={stableToggleFav}
            onContextMenu={stableContextMenu}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(MangaGridStable);
