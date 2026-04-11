import { memo } from 'react';
import MediaAsset from './MediaAsset.jsx';
import {
  AlertIcon,
  BookIcon,
  DatabaseIcon,
  ImageIcon,
  RefreshIcon,
  SearchIcon,
  SparklesIcon,
  TrendingUpIcon,
  ArchiveIcon
} from './Icons.jsx';

function formatBytes(value = 0) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function SummaryTile({ icon, label, value, hint }) {
  return (
    <div className="maintenance-summary-tile">
      <span className="maintenance-summary-icon">{icon}</span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
    </div>
  );
}

function IssueRow({ manga, subtitle, actionLabel, onAction, secondaryActionLabel, onSecondaryAction }) {
  return (
    <div className="maintenance-issue-row">
      <div className="maintenance-issue-cover">
        {manga.coverSrc || manga.coverMediaType === 'pdf' ? (
          <MediaAsset
            src={manga.coverSrc}
            alt={manga.displayTitle}
            className="thumb-smooth thumb-media"
            loading="lazy"
            mediaType={manga.coverMediaType || 'image'}
            filePath={manga.coverFilePath}
            pageNumber={manga.coverPageNumber || 1}
            maxWidth={120}
            maxHeight={180}
          />
        ) : (
          <div className="maintenance-issue-fallback">{(manga.displayTitle || '?')[0]}</div>
        )}
      </div>

      <div className="maintenance-issue-copy">
        <strong>{manga.displayTitle}</strong>
        <span>{subtitle}</span>
      </div>

      <div className="maintenance-issue-actions">
        {secondaryActionLabel ? (
          <button type="button" className="ghost-button" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </button>
        ) : null}
        <button type="button" className="primary-button" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function DuplicateRow({ group, onOpenManga }) {
  return (
    <div className="maintenance-duplicate-row">
      <div>
        <strong>{group.label}</strong>
        <span>{group.mangas.length} titres tres proches</span>
      </div>
      <div className="maintenance-duplicate-actions">
        {group.mangas.slice(0, 3).map((manga) => (
          <button key={manga.id} type="button" className="ghost-button" onClick={() => onOpenManga(manga.id)}>
            {manga.displayTitle}
          </button>
        ))}
      </div>
    </div>
  );
}

function IssueSection({ title, description, icon, count, children, action }) {
  return (
    <section className="maintenance-section-card">
      <div className="maintenance-section-head">
        <div>
          <div className="maintenance-section-eyebrow">{icon} {count}</div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {action}
      </div>
      <div className="maintenance-section-body">{children}</div>
    </section>
  );
}

function MaintenanceView({
  issues,
  stats,
  workbenchCount,
  vaultCount,
  onOpenManga,
  onForceRescan,
  onQueueIssue,
  onPickCover,
  onOpenWorkbench,
  onOpenVault
}) {
  const missingCover = issues?.missingCover || [];
  const missingMetadata = issues?.missingMetadata || [];
  const sparseChapters = issues?.sparseChapters || [];
  const duplicateGroups = issues?.duplicateGroups || [];
  const totalIssues = missingCover.length + missingMetadata.length + sparseChapters.length + duplicateGroups.length;

  return (
    <section className="maintenance-view">
      <div className="maintenance-hero">
        <div className="maintenance-hero-copy">
          <span className="maintenance-kicker">Centre d'entretien</span>
          <h1>Une vue propre sur ce qui merite un petit soin.</h1>
          <p>
            Rien d'agressif ni de bruyant: juste les mangas a completer, les dossiers a verifier
            et les lots a traiter pour garder une bibliotheque nickel.
          </p>
        </div>

        <div className="maintenance-hero-actions">
          <button type="button" className="primary-button" onClick={onOpenWorkbench}>
            <SparklesIcon size={16} /> Ouvrir l'atelier metadata
          </button>
          <button type="button" className="ghost-button" onClick={onForceRescan}>
            <RefreshIcon size={16} /> Relancer un scan propre
          </button>
        </div>
      </div>

      <div className="maintenance-summary-grid">
        <SummaryTile icon={<AlertIcon size={18} />} label="Points a revoir" value={totalIssues} hint="discrets mais utiles" />
        <SummaryTile icon={<ImageIcon size={18} />} label="Sans cover" value={missingCover.length} hint="atelier + cover locale" />
        <SummaryTile icon={<DatabaseIcon size={18} />} label="Sans metadata" value={missingMetadata.length} hint="auteur, synopsis, source" />
        <SummaryTile icon={<SparklesIcon size={18} />} label="Queue atelier" value={workbenchCount || 0} hint="lots en attente" />
        <SummaryTile icon={<ArchiveIcon size={18} />} label="Coffre" value={vaultCount || 0} hint="titres proteges" />
        <SummaryTile icon={<TrendingUpIcon size={18} />} label="Memoire app" value={formatBytes(stats?.memoryUsage?.heapUsed)} hint={stats?.lastScanTime ? 'scan recent memorise' : 'pas de scan memorise'} />
      </div>

      <div className="maintenance-grid">
        <IssueSection
          title="Covers a harmoniser"
          description="Les series sans couverture ressortent vite. Tu peux les envoyer d'un coup dans l'atelier ou corriger au cas par cas."
          icon={<ImageIcon size={16} />}
          count={missingCover.length}
          action={missingCover.length ? (
            <button type="button" className="ghost-button" onClick={() => onQueueIssue('missingCover')}>
              <SparklesIcon size={14} /> Envoyer en lot
            </button>
          ) : null}
        >
          {missingCover.length === 0 ? <p className="maintenance-empty">Toutes les covers sont remplies.</p> : null}
          {missingCover.slice(0, 8).map((manga) => (
            <IssueRow
              key={manga.id}
              manga={manga}
              subtitle={`${manga.chapterCount} ch. · couverture locale absente`}
              actionLabel="Ouvrir"
              onAction={() => onOpenManga(manga.id)}
              secondaryActionLabel="Choisir cover"
              onSecondaryAction={() => onPickCover(manga.id)}
            />
          ))}
        </IssueSection>

        <IssueSection
          title="Metadata a completer"
          description="Auteur, synopsis et sources en ligne. Parfait pour les gros imports pas encore polis."
          icon={<DatabaseIcon size={16} />}
          count={missingMetadata.length}
          action={missingMetadata.length ? (
            <button type="button" className="ghost-button" onClick={() => onQueueIssue('missingMetadata')}>
              <SparklesIcon size={14} /> Envoyer en lot
            </button>
          ) : null}
        >
          {missingMetadata.length === 0 ? <p className="maintenance-empty">Les metadata principales sont deja en place.</p> : null}
          {missingMetadata.slice(0, 8).map((manga) => (
            <IssueRow
              key={manga.id}
              manga={manga}
              subtitle="Auteur ou description encore incomplets"
              actionLabel="Ouvrir"
              onAction={() => onOpenManga(manga.id)}
              secondaryActionLabel="Atelier"
              onSecondaryAction={() => onQueueIssue('single', [manga.id])}
            />
          ))}
        </IssueSection>

        <IssueSection
          title="Chapitres a verifier"
          description="Ces series ont des chapitres vides ou une structure trop legere. Un rescannage ou une verification de dossier peut aider."
          icon={<BookIcon size={16} />}
          count={sparseChapters.length}
        >
          {sparseChapters.length === 0 ? <p className="maintenance-empty">Aucun chapitre suspect detecte.</p> : null}
          {sparseChapters.slice(0, 8).map(({ manga, reason }) => (
            <IssueRow
              key={manga.id}
              manga={manga}
              subtitle={reason}
              actionLabel="Ouvrir"
              onAction={() => onOpenManga(manga.id)}
            />
          ))}
        </IssueSection>

        <IssueSection
          title="Doublons probables"
          description="Une detection legere sur les titres proches. C'est volontairement calme pour eviter les faux positifs trop intrusifs."
          icon={<SearchIcon size={16} />}
          count={duplicateGroups.length}
          action={vaultCount ? (
            <button type="button" className="ghost-button" onClick={onOpenVault}>
              <ArchiveIcon size={14} /> Ouvrir le coffre
            </button>
          ) : null}
        >
          {duplicateGroups.length === 0 ? <p className="maintenance-empty">Aucun doublon probable ne ressort pour l'instant.</p> : null}
          {duplicateGroups.slice(0, 8).map((group) => (
            <DuplicateRow key={group.key} group={group} onOpenManga={onOpenManga} />
          ))}
        </IssueSection>
      </div>
    </section>
  );
}

export default memo(MaintenanceView);
