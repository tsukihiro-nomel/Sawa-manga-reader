import { memo, useMemo } from 'react';
import { resolveSmartCollection } from '../utils/reader.js';
import {
  BookIcon, ChevronRightIcon, ClockIcon, HeartIcon,
  LayersIcon, PlayIcon, PlusIcon, SparklesIcon, ZapIcon
} from './Icons.jsx';

function truncate(value, max) {
  if (!value) return '';
  return value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value;
}

function MiniCard({ manga, onOpen, onContextMenu }) {
  return (
    <button
      className="dash-mini-card"
      onClick={() => onOpen(manga.id)}
      onContextMenu={(e) => onContextMenu?.(e, { type: 'manga', manga })}
      title={manga.displayTitle}
    >
      <div className="dash-mini-cover">
        {manga.coverSrc
          ? <img src={manga.coverSrc} alt={manga.displayTitle} loading="lazy" />
          : <div className="cover-fallback">{(manga.displayTitle || '?')[0]}</div>
        }
        {manga.progressPercent > 0 && manga.progressPercent < 100 && (
          <div className="dash-mini-progress">
            <span style={{ width: `${manga.progressPercent}%` }} />
          </div>
        )}
        {manga.isRead && <span className="dash-mini-badge dash-mini-badge-read">Lu</span>}
        {manga.hasNewChapters && <span className="dash-mini-badge dash-mini-badge-new">Nouveau</span>}
      </div>
      <div className="dash-mini-info">
        <strong>{truncate(manga.displayTitle, 40)}</strong>
        <small>{manga.chapterCount} ch. · {manga.progressPercent ?? 0}%</small>
      </div>
    </button>
  );
}

function DashSection({ title, icon, mangas, onOpen, onContextMenu, onViewAll, emptyText }) {
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
          <MiniCard key={m.id} manga={m} onOpen={onOpen} onContextMenu={onContextMenu} />
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

function Dashboard({
  allMangas = [],
  favorites = [],
  persisted = {},
  onOpenManga,
  onNavigateTo,
  onContextMenu
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

  return (
    <section className="dashboard-view">
      <div className="dash-hero">
        <div className="dash-hero-content">
          <div className="dash-hero-badge">Sawa Manga Library v2</div>
          <h1>Ta bibliothèque manga locale, premium et intelligente.</h1>
          <p>
            Reprends ta lecture, découvre tes nouveaux chapitres, organise tes collections
            et profite d'une expérience entièrement hors ligne.
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
        <div className="dash-hero-stats">
          <StatCard label="Mangas" value={totalMangas} icon={<BookIcon size={16} />} />
          <StatCard label="À reprendre" value={totalInProgress} icon={<ClockIcon size={16} />} />
          <StatCard label="Non lus" value={totalUnread} icon={<ZapIcon size={16} />} />
          <StatCard label="Favoris" value={totalFavorites} icon={<HeartIcon size={16} filled />} />
        </div>
      </div>

      <DashSection
        title="Continuer la lecture"
        icon={<PlayIcon size={18} />}
        mangas={continueReading}
        onOpen={onOpenManga}
        onContextMenu={onContextMenu}
        onViewAll={() => onNavigateTo('smart-continue')}
      />

      <DashSection
        title="Ajoutés récemment"
        icon={<PlusIcon size={18} />}
        mangas={recentlyAdded}
        onOpen={onOpenManga}
        onContextMenu={onContextMenu}
        onViewAll={() => onNavigateTo('smart-recent-added')}
      />

      {newChapters.length > 0 && (
        <DashSection
          title="Nouveaux chapitres détectés"
          icon={<SparklesIcon size={18} />}
          mangas={newChapters}
          onOpen={onOpenManga}
          onContextMenu={onContextMenu}
          onViewAll={() => onNavigateTo('smart-new-chapters')}
        />
      )}

      <DashSection
        title="Favoris"
        icon={<HeartIcon size={18} filled />}
        mangas={favorites}
        onOpen={onOpenManga}
        onContextMenu={onContextMenu}
        onViewAll={() => onNavigateTo('favorites')}
      />

      <DashSection
        title="Lus récemment"
        icon={<ClockIcon size={18} />}
        mangas={recentlyRead}
        onOpen={onOpenManga}
        onContextMenu={onContextMenu}
        onViewAll={() => onNavigateTo('smart-recent-read')}
      />
    </section>
  );
}

export default memo(Dashboard);
