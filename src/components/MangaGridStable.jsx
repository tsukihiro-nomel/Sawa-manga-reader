import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HeartIcon } from './Icons.jsx';

const OVERSCAN_PX = 600;
const HYDRATION_BATCH = 8;
const HYDRATION_DELAY = 80;
const RESIZE_DEBOUNCE = 120;

const hydrationCache = new Map();

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

function findScrollRoot(element) {
  return element?.closest('.curved-scroll-content') || null;
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

function PlaceholderCard() {
  return (
    <article className="manga-card manga-card-stable manga-card-pending" aria-hidden="true">
      <div className="manga-cover-wrap manga-cover-wrap-stable">
        <div className="cover-fallback manga-cover-fallback-stable" />
      </div>
      <div className="manga-card-body manga-card-body-stable">
        <div className="manga-card-topline manga-card-topline-stable">
          <span>&nbsp;</span>
        </div>
        <h3>&nbsp;</h3>
        <p className="manga-card-loading-copy">&nbsp;</p>
        <div className="manga-card-tags-stable manga-card-tags-placeholder" aria-hidden="true">
          <span className="manga-tag-skeleton" />
          <span className="manga-tag-skeleton short" />
        </div>
      </div>
    </article>
  );
}

const MemoPlaceholder = memo(PlaceholderCard);

function useGridLayout(shellRef) {
  const [layout, setLayout] = useState({ columns: 4, rowHeight: 480, gap: 20 });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;

    let timer = 0;

    function measure() {
      const grid = shell.querySelector('.manga-grid-stable');
      if (!grid) return;
      const style = window.getComputedStyle(grid);
      const cols = style.gridTemplateColumns.split(' ').filter((s) => s.trim()).length || 4;
      const gapValue = parseFloat(style.gap) || 20;

      const firstCard = grid.querySelector('.manga-card-stable');
      const cardHeight = firstCard ? firstCard.getBoundingClientRect().height : 480;

      setLayout((prev) => {
        if (prev.columns === cols && Math.abs(prev.rowHeight - cardHeight) < 2 && prev.gap === gapValue) return prev;
        return { columns: cols, rowHeight: cardHeight, gap: gapValue };
      });
    }

    measure();

    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(measure, RESIZE_DEBOUNCE);
    });
    observer.observe(shell);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [shellRef]);

  return layout;
}

function useVirtualWindow(scrollRoot, totalItems, layout) {
  const { columns, rowHeight, gap } = layout;
  const totalRows = Math.ceil(totalItems / columns);
  const totalHeight = totalRows > 0 ? totalRows * rowHeight + (totalRows - 1) * gap : 0;

  const [range, setRange] = useState({ startRow: 0, endRow: Math.min(6, totalRows) });

  useEffect(() => {
    const root = scrollRoot;
    if (!root) {
      setRange({ startRow: 0, endRow: Math.min(6, totalRows) });
      return undefined;
    }

    let rafId = 0;

    function compute() {
      const scrollTop = root.scrollTop || 0;
      const viewportHeight = root.clientHeight || 800;
      const effectiveRowHeight = rowHeight + gap;

      if (effectiveRowHeight <= 0) {
        setRange({ startRow: 0, endRow: totalRows });
        return;
      }

      const overscanTop = Math.max(0, scrollTop - OVERSCAN_PX);
      const overscanBottom = scrollTop + viewportHeight + OVERSCAN_PX;

      const startRow = Math.max(0, Math.floor(overscanTop / effectiveRowHeight));
      const endRow = Math.min(totalRows, Math.ceil(overscanBottom / effectiveRowHeight));

      setRange((prev) => {
        if (prev.startRow === startRow && prev.endRow === endRow) return prev;
        return { startRow, endRow };
      });
    }

    compute();

    function onScroll() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(compute);
    }

    root.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(compute);
    });
    resizeObserver.observe(root);

    return () => {
      cancelAnimationFrame(rafId);
      root.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, [scrollRoot, totalRows, rowHeight, gap]);

  const startIndex = range.startRow * columns;
  const endIndex = Math.min(totalItems, range.endRow * columns);

  const topPadding = range.startRow * (rowHeight + gap);
  const bottomRows = Math.max(0, totalRows - range.endRow);
  const bottomPadding = bottomRows * (rowHeight + gap);

  return { startIndex, endIndex, topPadding, bottomPadding, totalHeight };
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
  const shellRef = useRef(null);
  const scrollRootRef = useRef(null);
  const [scrollRoot, setScrollRoot] = useState(null);
  const hydrationTimerRef = useRef(0);
  const hydrationLoadingRef = useRef(new Set());
  const total = mangas.length;

  const layout = useGridLayout(shellRef);

  const [hydratedMap, setHydratedMap] = useState(() => {
    const initial = {};
    for (const manga of mangas) {
      const cached = hydrationCache.get(manga.id);
      if (cached) initial[manga.id] = cached;
    }
    return initial;
  });

  useLayoutEffect(() => {
    const root = findScrollRoot(shellRef.current);
    scrollRootRef.current = root;
    setScrollRoot(root);
  }, []);

  const { startIndex, endIndex, topPadding, bottomPadding } = useVirtualWindow(
    scrollRoot,
    total,
    layout
  );

  const visibleMangas = useMemo(() => {
    const slice = [];
    for (let i = startIndex; i < endIndex && i < total; i++) {
      const summary = mangas[i];
      const cached = hydratedMap[summary.id] || hydrationCache.get(summary.id) || null;
      if (cached) {
        slice.push({
          ...summary,
          ...cached,
          tagIds: cached.tagIds || summary.tagIds || [],
          collectionIds: cached.collectionIds || summary.collectionIds || [],
          resumeChapter: cached.resumeChapter || summary.resumeChapter || null,
          chapterIds: cached.chapterIds || summary.chapterIds || []
        });
      } else {
        slice.push(summary);
      }
    }
    return slice;
  }, [mangas, startIndex, endIndex, total, hydratedMap]);

  useEffect(() => {
    if (!window.mangaAPI?.getMangaCardBatch) return undefined;

    const idsToHydrate = [];
    for (let i = startIndex; i < endIndex && i < total; i++) {
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

        const entries = {};
        for (const manga of result.mangas) {
          hydrationCache.set(manga.id, manga);
          entries[manga.id] = manga;
        }
        if (Object.keys(entries).length) {
          setHydratedMap((prev) => ({ ...prev, ...entries }));
        }
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
  }, [startIndex, endIndex, mangas, total]);

  if (total === 0) {
    return (
      <div className="empty-card">
        <h3>{emptyTitle}</h3>
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div ref={shellRef} className="manga-grid-stable-shell">
      {topPadding > 0 && <div style={{ height: topPadding, flexShrink: 0 }} aria-hidden="true" />}

      <div className="manga-grid manga-grid-stable">
        {visibleMangas.map((manga, i) => (
          <MangaCard
            key={manga.id}
            manga={manga}
            priority={startIndex + i < 6}
            onOpenManga={onOpenManga}
            onOpenMangaInBackgroundTab={onOpenMangaInBackgroundTab}
            onToggleFavorite={onToggleFavorite}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>

      {bottomPadding > 0 && <div style={{ height: bottomPadding, flexShrink: 0 }} aria-hidden="true" />}
    </div>
  );
}

export default memo(MangaGridStable);
