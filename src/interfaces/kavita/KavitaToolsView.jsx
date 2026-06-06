import { memo } from 'react';
import { Database, FolderSearch, Play, RefreshCw, Wrench } from 'lucide-react';
import { resolveTabOpenIntent } from './tabInteractions.js';

function Metric({ label, value }) {
  return <div className="kv-metric"><strong>{value}</strong><span>{label}</span></div>;
}

function KavitaToolsView({
  screen,
  library,
  collections = [],
  maintenanceIssues,
  maintenanceStats,
  workbenchMangas = [],
  plugins = [],
  migrationStatus,
  onOpenManga,
  onOpenMangaInNewTab,
  onContextMenu,
  onForceRescan,
  onRunDeepScan,
  onRebuildDerivedData,
  onAnalyzeMigration,
  onRunMigration,
  onOpenSettings
}) {
  function openManga(event, mangaId) {
    const intent = resolveTabOpenIntent(event, false);
    if (intent === 'current') onOpenManga?.(mangaId);
    else onOpenMangaInNewTab?.(mangaId, { activate: intent === 'foreground' });
  }

  function openMangaOnMiddleClick(event, mangaId) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenMangaInNewTab?.(mangaId, { activate: false });
  }

  if (screen === 'collections') {
    return (
      <section className="kv-tool-view">
        <header className="kv-page-heading"><div><h1>Collections</h1><p>{collections.length} collection(s)</p></div></header>
        <div className="kv-flat-list">
          {collections.map((collection) => (
            <article key={collection.id} onContextMenu={(event) => onContextMenu?.(event, { type: 'collection', collection })}>
              <div><strong>{collection.name}</strong><span>{collection.description || 'Collection locale'}</span></div>
              <span>{collection.mangaIds?.length || 0} manga(s)</span>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (screen === 'maintenance') {
    return (
      <section className="kv-tool-view">
        <header className="kv-page-heading"><div><h1>Maintenance</h1><p>Diagnostic, index et migration locale</p></div></header>
        <div className="kv-metric-strip">
          <Metric label="Couvertures manquantes" value={maintenanceIssues?.missingCoverCount || 0} />
          <Metric label="Metadata incompletes" value={maintenanceIssues?.missingMetadataCount || 0} />
          <Metric label="Groupes dupliques" value={maintenanceIssues?.duplicateGroupCount || 0} />
          <Metric label="Series indexees" value={maintenanceStats?.mangaCount || library.allMangas?.length || 0} />
        </div>
        <div className="kv-action-table">
          <button type="button" onClick={onForceRescan}><RefreshCw size={17} /><span><strong>Rescan rapide</strong><small>Relit les bibliotheques configurees.</small></span></button>
          <button type="button" onClick={onRunDeepScan}><FolderSearch size={17} /><span><strong>Analyse profonde</strong><small>Recalcule les informations de fichiers.</small></span></button>
          <button type="button" onClick={onRebuildDerivedData}><Database size={17} /><span><strong>Reconstruire les index</strong><small>Reconstruit les donnees derivees.</small></span></button>
          <button type="button" onClick={onAnalyzeMigration}><Wrench size={17} /><span><strong>Analyser la migration</strong><small>Etat: {migrationStatus?.status || 'non analysee'}.</small></span></button>
          <button type="button" onClick={onRunMigration}><Play size={17} /><span><strong>Lancer la migration v2</strong><small>Backup et transaction avant ecriture.</small></span></button>
        </div>
      </section>
    );
  }

  if (screen === 'workbench') {
    return (
      <section className="kv-tool-view">
        <header className="kv-page-heading"><div><h1>Atelier metadata</h1><p>{workbenchMangas.length} element(s) en attente</p></div></header>
        <div className="kv-flat-list">
          {workbenchMangas.map((manga) => (
            <button
              key={manga.id}
              type="button"
              onClick={(event) => openManga(event, manga.id)}
              onMouseDown={(event) => {
                if (event.button === 1) event.preventDefault();
              }}
              onMouseUp={(event) => openMangaOnMiddleClick(event, manga.id)}
            >
              <div><strong>{manga.displayTitle}</strong><span>{manga.author || 'Auteur non renseigne'}</span></div>
              <span>Ouvrir</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (screen === 'sources') {
    return (
      <section className="kv-tool-view">
        <header className="kv-page-heading"><div><h1>Sources</h1><p>Extensions et imports web</p></div><button type="button" className="kv-secondary-action" onClick={onOpenSettings}>Gerer</button></header>
        <div className="kv-flat-list">
          {plugins.map((plugin) => (
            <article key={plugin.id}>
              <div><strong>{plugin.name || plugin.id}</strong><span>{plugin.description || 'Extension Sawa'}</span></div>
              <span>{plugin.enabled ? 'Active' : plugin.installed ? 'Desactivee' : 'Non installee'}</span>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const recentCount = library.recents?.length || 0;
  return (
    <section className="kv-tool-view">
      <header className="kv-page-heading"><div><h1>Accueil</h1><p>Vue d ensemble de la bibliotheque</p></div></header>
      <div className="kv-metric-strip">
        <Metric label="Series" value={library.allMangas?.length || 0} />
        <Metric label="Favoris" value={library.favorites?.length || 0} />
        <Metric label="Lectures recentes" value={recentCount} />
        <Metric label="Collections" value={collections.length} />
      </div>
      <div className="kv-section-heading"><h2>Reprendre la lecture</h2></div>
      <div className="kv-flat-list">
        {(library.recents || []).slice(0, 12).map((entry) => (
          <button
            key={`${entry.mangaId}-${entry.chapterId}`}
            type="button"
            onClick={(event) => openManga(event, entry.mangaId)}
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
            onMouseUp={(event) => openMangaOnMiddleClick(event, entry.mangaId)}
          >
            <div><strong>{entry.mangaTitle}</strong><span>{entry.chapterName || 'Derniere lecture'}</span></div>
            <span>Page {Number(entry.pageIndex || 0) + 1}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default memo(KavitaToolsView);
