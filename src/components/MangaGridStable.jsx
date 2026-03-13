import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeartIcon } from './Icons.jsx';

const HYDRATION_BATCH = 20;
const HYDRATION_DELAY = 40;
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
  const hydrationTimerRef = useRef(0);
  const hydrationLoadingRef = useRef(new Set());
  const total = mangas.length;

  const stableOpenManga = useCallback((id) => onOpenManga(id), [onOpenManga]);
  const stableOpenBg = useCallback((id) => onOpenMangaInBackgroundTab?.(id), [onOpenMangaInBackgroundTab]);
  const stableToggleFav = useCallback((id) => onToggleFavorite(id), [onToggleFavorite]);
  const stableContextMenu = useCallback((e, d) => onContextMenu(e, d), [onContextMenu]);

  const [hydrationVersion, setHydrationVersion] = useState(0);

  useEffect(() => {
    return () => {
      window.clearTimeout(hydrationTimerRef.current);
      hydrationLoadingRef.current.clear();
    };
  }, []);

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
    let pendingCount = 0;

    async function flushBatch() {
      if (cancelled || !queue.length) return;
      const batch = queue.splice(0, HYDRATION_BATCH);
      pendingCount++;
      batch.forEach((id) => hydrationLoadingRef.current.add(id));

      try {
        const result = await window.mangaAPI.getMangaCardBatch(batch);
        if (cancelled || !result?.ok || !Array.isArray(result.mangas)) return;

        for (const manga of result.mangas) {
          hydrationCache.set(manga.id, manga);
        }
      } catch {
        // noop
      } finally {
        batch.forEach((id) => hydrationLoadingRef.current.delete(id));
        pendingCount--;
      }

      if (!cancelled && queue.length) {
        hydrationTimerRef.current = window.setTimeout(flushBatch, HYDRATION_DELAY);
      } else if (!cancelled && pendingCount === 0) {
        setHydrationVersion((v) => v + 1);
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

  return (
    <div className="manga-grid manga-grid-stable">
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

export default memo(MangaGridStable);
