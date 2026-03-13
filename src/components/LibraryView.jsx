import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import CurvedScrollArea from './CurvedScrollArea.jsx';
import MangaGridStable from './MangaGridStable.jsx';

function Section({ title, subtitle, mangas, onOpenManga, onOpenMangaInBackgroundTab, onToggleFavorite, onContextMenu }) {
  if (!mangas?.length) return null;
  return (
    <section className="dashboard-section">
      <div className="dashboard-section-header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <MangaGridStable
        mangas={mangas}
        progressive={false}
        onOpenManga={onOpenManga}
        onOpenMangaInBackgroundTab={onOpenMangaInBackgroundTab}
        onToggleFavorite={onToggleFavorite}
        onContextMenu={onContextMenu}
      />
    </section>
  );
}

function DashboardStat({ value, label, helper }) {
  return (
    <div className="dashboard-mini-card">
      <strong>{value}</strong>
      <span>{label}</span>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

function LibraryView({
  mangas,
  activeShelf,
  dashboard,
  stats,
  dashboardResultMode = false,
  initialScrollTop = 0,
  onScrollPositionChange,
  onOpenManga,
  onOpenMangaInBackgroundTab,
  onToggleFavorite,
  onContextMenu
}) {
  const containerRef = useRef(null);
  const hasRestoredRef = useRef(false);
  const isRestoringRef = useRef(false);
  const visibleMangas = useMemo(() => mangas, [mangas]);
  const allowProgressiveGrid = initialScrollTop <= 8 && activeShelf !== 'dashboard';

  const restoreKey = `${activeShelf}:${dashboardResultMode}`;

  useEffect(() => {
    hasRestoredRef.current = false;
  }, [restoreKey]);

  useEffect(() => () => {
    if (containerRef.current) onScrollPositionChange?.(containerRef.current.scrollTop);
  }, [onScrollPositionChange]);

  useLayoutEffect(() => {
    if (hasRestoredRef.current) return;

    const el = containerRef.current;
    if (!el) return;

    const savedTop = Math.max(0, Number(initialScrollTop || 0));
    if (savedTop <= 0) {
      hasRestoredRef.current = true;
      return;
    }

    let raf = 0;
    let tries = 0;
    const maxTries = 40;

    const tryRestore = () => {
      const node = containerRef.current;
      if (!node) return;

      const enoughHeight = node.scrollHeight >= savedTop + node.clientHeight;
      if (enoughHeight || tries >= maxTries) {
        isRestoringRef.current = true;
        node.scrollTo({ top: savedTop, behavior: 'auto' });
        requestAnimationFrame(() => {
          isRestoringRef.current = false;
          hasRestoredRef.current = true;
        });
        return;
      }
      tries += 1;
      raf = requestAnimationFrame(tryRestore);
    };

    raf = requestAnimationFrame(tryRestore);

    return () => cancelAnimationFrame(raf);
  }, [restoreKey, initialScrollTop]);

  const handleScroll = useCallback((event) => {
    if (isRestoringRef.current) return;
    onScrollPositionChange?.(event.currentTarget.scrollTop);
  }, [onScrollPositionChange]);

  if (activeShelf === 'dashboard') {
    return (
      <CurvedScrollArea className="library-view library-view-dashboard" ref={containerRef} onScroll={handleScroll}>
        <div className="hero-card hero-card-dashboard hero-card-dashboard-refined">
          <div className="hero-carousel-copy hero-carousel-copy-dashboard">
            <div className="hero-carousel-copy-topline">Sawa Manga Library v2.0.0</div>
            <h2>Ta collection locale, mieux rangée et plus intelligente.</h2>
            <p>Retrouve vite quoi reprendre, quoi lire ensuite, où sont les nouveautés et ce qui mérite encore un peu d'organisation.</p>
            <div className="hero-carousel-copy-meta">
              <span className="status-pill">{stats?.mangaCount ?? 0} mangas visibles</span>
              <span className="status-pill">{stats?.chapterCount ?? 0} chapitres indexés</span>
              <span className="status-pill">{stats?.resumeCount ?? 0} à reprendre</span>
              <span className="status-pill">{stats?.newChaptersCount ?? 0} nouveautés locales</span>
            </div>
          </div>
          <div className="dashboard-mini-stats dashboard-mini-stats-refined">
            <DashboardStat value={stats?.resumeCount ?? 0} label="À reprendre" helper="Là où relancer tout de suite." />
            <DashboardStat value={stats?.neverOpenedCount ?? 0} label="Non lus" helper="Encore jamais ouverts." />
            <DashboardStat value={stats?.favoritesCount ?? 0} label="Favoris" helper="Tes valeurs sûres." />
            <DashboardStat value={stats?.newChaptersCount ?? 0} label="Nouveaux chapitres" helper="Repérés au scan local." />
          </div>
        </div>

        {dashboardResultMode ? (
          <section className="dashboard-section">
            <div className="dashboard-section-header">
              <div>
                <h3>Résultats du dashboard</h3>
                <p>La recherche et les filtres s'appliquent maintenant réellement à l'affichage.</p>
              </div>
            </div>
            <MangaGridStable
              mangas={visibleMangas}
              progressive={false}
              onOpenManga={onOpenManga}
              onOpenMangaInBackgroundTab={onOpenMangaInBackgroundTab}
              onToggleFavorite={onToggleFavorite}
              onContextMenu={onContextMenu}
            />
          </section>
        ) : (
          <>
            <Section title="Continuer" subtitle="Reprends exactement là où tu t'es arrêté." mangas={dashboard?.continue || []} onOpenManga={onOpenManga} onOpenMangaInBackgroundTab={onOpenMangaInBackgroundTab} onToggleFavorite={onToggleFavorite} onContextMenu={onContextMenu} />
            <Section title="Nouveaux chapitres détectés" subtitle="Repérés uniquement via le scan local." mangas={dashboard?.newChapters || []} onOpenManga={onOpenManga} onOpenMangaInBackgroundTab={onOpenMangaInBackgroundTab} onToggleFavorite={onToggleFavorite} onContextMenu={onContextMenu} />
            <Section title="Ajoutés récemment" subtitle="Les dernières séries ou dossiers détectés." mangas={dashboard?.recentlyAdded || []} onOpenManga={onOpenManga} onOpenMangaInBackgroundTab={onOpenMangaInBackgroundTab} onToggleFavorite={onToggleFavorite} onContextMenu={onContextMenu} />
            <Section title="Dernière lecture" subtitle="Tes derniers mangas ouverts." mangas={dashboard?.recentReading || []} onOpenManga={onOpenManga} onOpenMangaInBackgroundTab={onOpenMangaInBackgroundTab} onToggleFavorite={onToggleFavorite} onContextMenu={onContextMenu} />
          </>
        )}
      </CurvedScrollArea>
    );
  }

  return (
    <CurvedScrollArea className="library-view" ref={containerRef} onScroll={handleScroll}>
      <MangaGridStable
        mangas={visibleMangas}
        progressive={allowProgressiveGrid}
        onOpenManga={onOpenManga}
        onOpenMangaInBackgroundTab={onOpenMangaInBackgroundTab}
        onToggleFavorite={onToggleFavorite}
        onContextMenu={onContextMenu}
      />
    </CurvedScrollArea>
  );
}

export default memo(LibraryView);
