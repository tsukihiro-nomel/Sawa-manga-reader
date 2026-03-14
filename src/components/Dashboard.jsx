import { memo, useMemo } from 'react';
import { resolveSmartCollection } from '../utils/reader.js';
import MangaCard from './MangaCard.jsx';
import {
  BookIcon, ChevronRightIcon, ClockIcon, HeartIcon,
  LayersIcon, PlayIcon, PlusIcon, SparklesIcon, ZapIcon,
  TrendingUpIcon
} from './Icons.jsx';

function DashSection({ title, icon, mangas, onOpen, onToggleFavorite, onContextMenu, onViewAll, emptyText }) {
  if (!mangas || mangas.length === 0) return null;
  return (
    <div className="dash-section">
      <div className="dash-section-header">
        <h3>{icon} {title}</h3>
        {onViewAll && mangas.length > 6 && (
          <button className="ghost-button dash-view-all" onClick={onViewAll}>
            Voir tout <ChevronRightIcon size={14} />
          </button>
        )}
      </div>
      <div className="dash-section-grid">
        {mangas.slice(0, 12).map((m) => (
          <MangaCard
            key={m.id}
            manga={m}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            onContextMenu={onContextMenu}
            compact
          />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="dash-stat">
      <span className="dash-stat-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function QuickAction({ label, icon, onClick }) {
  return (
    <button className="dash-quick-action" onClick={onClick}>
      <span className="dash-quick-action-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Dashboard({
  allMangas = [],
  favorites = [],
  persisted = {},
  onOpenManga,
  onToggleFavorite,
  onNavigateTo,
  onContextMenu,
  onOpenSettings
}) {
  const continueReading = useMemo(() => resolveSmartCollection(allMangas, 'smart-continue', persisted), [allMangas, persisted]);
  const recentlyAdded = useMemo(() => resolveSmartCollection(allMangas, 'smart-recent-added', persisted), [allMangas, persisted]);
  const recentlyRead = useMemo(() => resolveSmartCollection(allMangas, 'smart-recent-read', persisted), [allMangas, persisted]);
  const newChapters = useMemo(() => resolveSmartCollection(allMangas, 'smart-new-chapters', persisted), [allMangas, persisted]);
  const unread = useMemo(() => resolveSmartCollection(allMangas, 'smart-unread', persisted), [allMangas, persisted]);
  const completed = useMemo(() => resolveSmartCollection(allMangas, 'smart-completed', persisted), [allMangas, persisted]);
  const inProgress = useMemo(() => resolveSmartCollection(allMangas, 'smart-in-progress', persisted), [allMangas, persisted]);

  const totalMangas = allMangas.length;
  const totalFavorites = favorites.length;
  const totalUnread = unread.length;
  const totalInProgress = inProgress.length;
  const totalCompleted = completed.length;
  const totalChapters = allMangas.reduce((sum, m) => sum + (m.chapterCount || 0), 0);
  const totalReadChapters = allMangas.reduce((sum, m) => sum + (m.completedChapterCount || 0), 0);
  const overallProgress = totalChapters > 0 ? Math.round((totalReadChapters / totalChapters) * 100) : 0;

  // Collections count
  const collectionsCount = Object.keys(persisted?.collections ?? {}).length;

  return (
    <section className="dashboard-view">
      {/* Hero */}
      <div className="dash-hero">
        <div className="dash-hero-content">
          <div className="dash-hero-badge">Sawa Manga Reader v2</div>
          <h1>Bienvenue dans ta bibliothèque.</h1>
          <p>
            Reprends ta lecture, découvre tes nouveaux chapitres, organise tes collections
            et profite d'une expérience manga premium, entièrement hors ligne.
          </p>
          <div className="dash-hero-actions">
            {continueReading.length > 0 && (
              <button className="primary-button" onClick={() => onOpenManga(continueReading[0].id)}>
                <PlayIcon size={16} /> Reprendre la lecture
              </button>
            )}
            <button className="ghost-button" onClick={() => onNavigateTo('library')}>
              <LayersIcon size={16} /> Bibliothèque
            </button>
          </div>
        </div>
      </div>

      {/* Stats overview */}
      <div className="dash-stats-grid">
        <StatCard label="Mangas" value={totalMangas} icon={<BookIcon size={18} />} />
        <StatCard label="En cours" value={totalInProgress} icon={<ClockIcon size={18} />} />
        <StatCard label="Non lus" value={totalUnread} icon={<ZapIcon size={18} />} />
        <StatCard label="Terminés" value={totalCompleted} icon={<BookIcon size={18} />} />
        <StatCard label="Favoris" value={totalFavorites} icon={<HeartIcon size={18} filled />} />
        <StatCard label="Collections" value={collectionsCount} icon={<LayersIcon size={18} />} />
        <StatCard label="Chapitres lus" value={`${totalReadChapters}/${totalChapters}`} icon={<TrendingUpIcon size={18} />} />
        <StatCard label="Progression" value={`${overallProgress}%`} icon={<SparklesIcon size={18} />} />
      </div>

      {/* Quick actions */}
      <div className="dash-section">
        <div className="dash-section-header">
          <h3>Accès rapide</h3>
        </div>
        <div className="dash-quick-actions">
          <QuickAction label="Bibliothèque" icon={<LayersIcon size={18} />} onClick={() => onNavigateTo('library')} />
          <QuickAction label="Collections" icon={<BookIcon size={18} />} onClick={() => onNavigateTo('collections')} />
          <QuickAction label="Favoris" icon={<HeartIcon size={18} filled />} onClick={() => onNavigateTo('favorites')} />
          <QuickAction label="Non lus" icon={<ZapIcon size={18} />} onClick={() => onNavigateTo('smart-unread')} />
          {onOpenSettings && <QuickAction label="Paramètres" icon={<SparklesIcon size={18} />} onClick={onOpenSettings} />}
        </div>
      </div>

      {/* Manga sections */}
      <DashSection
        title="Continuer la lecture"
        icon={<PlayIcon size={18} />}
        mangas={continueReading}
        onOpen={onOpenManga}
        onToggleFavorite={onToggleFavorite}
        onContextMenu={onContextMenu}
        onViewAll={() => onNavigateTo('smart-continue')}
      />

      <DashSection
        title="Ajoutés récemment"
        icon={<PlusIcon size={18} />}
        mangas={recentlyAdded}
        onOpen={onOpenManga}
        onToggleFavorite={onToggleFavorite}
        onContextMenu={onContextMenu}
        onViewAll={() => onNavigateTo('smart-recent-added')}
      />

      {newChapters.length > 0 && (
        <DashSection
          title="Nouveaux chapitres détectés"
          icon={<SparklesIcon size={18} />}
          mangas={newChapters}
          onOpen={onOpenManga}
          onToggleFavorite={onToggleFavorite}
          onContextMenu={onContextMenu}
          onViewAll={() => onNavigateTo('smart-new-chapters')}
        />
      )}

      <DashSection
        title="Favoris"
        icon={<HeartIcon size={18} filled />}
        mangas={favorites}
        onOpen={onOpenManga}
        onToggleFavorite={onToggleFavorite}
        onContextMenu={onContextMenu}
        onViewAll={() => onNavigateTo('favorites')}
      />

      <DashSection
        title="Lus récemment"
        icon={<ClockIcon size={18} />}
        mangas={recentlyRead}
        onOpen={onOpenManga}
        onToggleFavorite={onToggleFavorite}
        onContextMenu={onContextMenu}
        onViewAll={() => onNavigateTo('smart-recent-read')}
      />

      {completed.length > 0 && (
        <DashSection
          title="Terminés"
          icon={<BookIcon size={18} />}
          mangas={completed}
          onOpen={onOpenManga}
          onToggleFavorite={onToggleFavorite}
          onContextMenu={onContextMenu}
          onViewAll={() => onNavigateTo('smart-completed')}
        />
      )}
    </section>
  );
}

export default memo(Dashboard);
