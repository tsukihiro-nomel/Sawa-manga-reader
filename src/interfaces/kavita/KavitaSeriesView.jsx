import { memo, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock3,
  Edit3,
  Heart,
  MoreHorizontal,
  Play,
  Plus,
  Tag
} from 'lucide-react';
import MediaAsset from '../../components/MediaAsset.jsx';
import { resolveTabOpenIntent } from './tabInteractions.js';

function formatDuration(pageCount) {
  const minutes = Math.max(1, Math.round(Number(pageCount || 0) * 0.55));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function chapterProgress(chapter) {
  if (chapter.isRead) return 100;
  const count = Number(chapter.pageCount || chapter.pages?.length || 0);
  const index = Number(chapter.progress?.pageIndex || 0);
  return count > 1 ? Math.round((index / (count - 1)) * 100) : 0;
}

function ChapterTile({ manga, chapter, index, onOpen, onOpenInNewTab, onContextMenu }) {
  const pages = chapter.pages || [];
  const preview = pages[0];
  const progress = chapterProgress(chapter);
  const title = chapter.displayTitle || chapter.name || `Chapitre ${index + 1}`;

  return (
    <article
      className="kv-chapter-tile"
      onClick={(event) => {
        const intent = resolveTabOpenIntent(event, false);
        if (intent === 'current') onOpen?.(chapter.id);
        else onOpenInNewTab?.(chapter.id, { activate: intent === 'foreground' });
      }}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onMouseUp={(event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenInNewTab?.(chapter.id, { activate: false });
      }}
      onContextMenu={(event) => onContextMenu?.(event, { type: 'chapter', manga, chapter })}
    >
      <div className="kv-chapter-thumb">
        {preview?.src || preview?.sourceType === 'pdf' ? (
          <MediaAsset
            src={preview.src}
            alt={title}
            className="kv-chapter-thumb-image"
            mediaType={preview.sourceType || 'image'}
            filePath={preview.path}
            pageNumber={preview.pdfPageNumber || 1}
            maxWidth={320}
            maxHeight={220}
          />
        ) : manga.coverSrc ? (
          <MediaAsset src={manga.coverSrc} alt={title} className="kv-chapter-thumb-image" />
        ) : (
          <div className="kv-cover-fallback">{index + 1}</div>
        )}
        {progress > 0 ? <div className="kv-cover-progress"><span style={{ width: `${progress}%` }} /></div> : null}
        {chapter.isRead ? <span className="kv-read-corner"><Check size={13} /></span> : null}
      </div>
      <div className="kv-chapter-caption">
        <div>
          <strong>{title}</strong>
          <span>{chapter.pageCount || pages.length || 0} pages</span>
        </div>
        <button
          type="button"
          className="kv-icon-button"
          title="Actions"
          onClick={(event) => {
            event.stopPropagation();
            onContextMenu?.(event, { type: 'chapter', manga, chapter });
          }}
        ><MoreHorizontal size={17} /></button>
      </div>
    </article>
  );
}

function KavitaSeriesView({
  manga,
  annotations = [],
  collections = [],
  onBack,
  onResume,
  onOpenChapter,
  onOpenChapterInNewTab,
  onToggleFavorite,
  onEditMetadata,
  onManageTags,
  onAddToCollection,
  onContextMenu
}) {
  const [tab, setTab] = useState('storyline');
  const chapters = manga.chapters || [];
  const pageCount = useMemo(
    () => chapters.reduce((total, chapter) => total + Number(chapter.pageCount || chapter.pages?.length || 0), 0),
    [chapters]
  );
  const tags = manga.tags || [];
  const genres = manga.genres || manga.metadata?.genres || [];
  const description = manga.description || manga.summary || manga.metadata?.summary || 'Aucun resume disponible.';
  const author = manga.author || manga.metadata?.author || manga.metadata?.writers || 'Non renseigne';
  const publication = manga.status || manga.metadata?.status || 'Non renseignee';
  const tabs = [
    ['storyline', 'Storyline'],
    ['chapters', `Chapitres ${chapters.length}`],
    ['specials', 'Speciaux'],
    ['activity', 'Activite'],
    ['details', 'Details'],
    ['annotations', `Annotations ${annotations.length}`]
  ];

  return (
    <section className="kv-series-view">
      <button type="button" className="kv-back-button" onClick={onBack}><ArrowLeft size={17} /> Retour</button>
      <div className="kv-series-hero">
        <div className="kv-series-cover">
          {manga.coverSrc || manga.coverMediaType === 'pdf' ? (
            <MediaAsset
              src={manga.coverSrc}
              alt={manga.displayTitle}
              className="kv-series-cover-image"
              mediaType={manga.coverMediaType || 'image'}
              filePath={manga.coverFilePath}
              pageNumber={manga.coverPageNumber || 1}
              maxWidth={520}
              maxHeight={780}
            />
          ) : <div className="kv-cover-fallback">{manga.displayTitle?.slice(0, 1) || '?'}</div>}
          {manga.progressPercent > 0 ? (
            <div className="kv-series-progress">
              <span style={{ width: `${manga.progressPercent}%` }} />
              <strong>{manga.progressPercent}%</strong>
            </div>
          ) : null}
        </div>
        <div className="kv-series-info">
          <h1>{manga.displayTitle || manga.name}</h1>
          <p className="kv-series-subtitle">{manga.subtitle || manga.originalTitle || manga.categoryName || 'Manga local'}</p>
          <div className="kv-series-facts">
            <span><BookOpen size={15} /> {pageCount} pages</span>
            <span><Clock3 size={15} /> {formatDuration(pageCount)}</span>
            <span>{chapters.length} chapitre(s)</span>
          </div>
          <div className="kv-series-actions">
            <button type="button" className="kv-primary-action" onClick={onResume}><Play size={17} /> {manga.progressPercent > 0 ? 'Continuer' : 'Lire'}</button>
            <button type="button" className={`kv-action-icon ${manga.isFavorite ? 'is-active' : ''}`} onClick={() => onToggleFavorite?.(manga.id)} title="Favori">
              <Heart size={18} fill={manga.isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="kv-action-icon" onClick={onEditMetadata} title="Modifier"><Edit3 size={18} /></button>
            <button type="button" className="kv-action-icon" onClick={onManageTags} title="Tags"><Tag size={18} /></button>
            <button type="button" className="kv-action-icon" onClick={onAddToCollection} title="Ajouter a une collection"><Plus size={18} /></button>
            <button type="button" className="kv-action-icon" onClick={(event) => onContextMenu?.(event, { type: 'manga', manga })} title="Plus"><MoreHorizontal size={18} /></button>
          </div>
          <p className="kv-series-summary">{description}</p>
          <div className="kv-metadata-columns">
            <dl>
              <dt>Auteurs</dt>
              <dd>{Array.isArray(author) ? author.join(', ') : author}</dd>
              <dt>Genres</dt>
              <dd>{Array.isArray(genres) && genres.length ? genres.map((genre) => genre.name || genre).join(', ') : 'Non renseignes'}</dd>
            </dl>
            <dl>
              <dt>Publication</dt>
              <dd>{publication}</dd>
              <dt>Tags</dt>
              <dd>
                <div className="kv-series-tag-list">
                  {tags.length ? tags.map((entry) => (
                    <span key={entry.id || entry.name || entry} style={{ '--tag-color': entry.color || '#45c99a' }}>
                      {entry.name || entry}
                    </span>
                  )) : <span className="is-empty">Aucun tag</span>}
                  <button type="button" onClick={onManageTags}>Gerer</button>
                </div>
              </dd>
              <dt>Collections</dt>
              <dd>
                <div className="kv-series-collection-list">
                  {collections.length ? collections.map((collection) => (
                    <span key={collection.id}>{collection.name}</span>
                  )) : <span className="is-empty">Aucune collection</span>}
                  <button type="button" onClick={onAddToCollection}>Gerer</button>
                </div>
              </dd>
            </dl>
          </div>
        </div>
      </div>

      <nav className="kv-detail-tabs" aria-label="Sections du manga">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      <div className="kv-detail-content">
        {tab === 'storyline' || tab === 'chapters' ? (
          <div className="kv-chapter-grid">
            {chapters.map((chapter, index) => (
              <ChapterTile
                key={chapter.id}
                manga={manga}
                chapter={chapter}
                index={index}
                onOpen={onOpenChapter}
                onOpenInNewTab={onOpenChapterInNewTab}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        ) : null}
        {tab === 'specials' ? <div className="kv-flat-message">Les chapitres speciaux apparaitront ici lorsqu ils seront detectes.</div> : null}
        {tab === 'activity' ? <div className="kv-flat-message">Progression actuelle: {manga.progressPercent || 0}%.</div> : null}
        {tab === 'details' ? (
          <div className="kv-details-table">
            <div><span>Chemin</span><strong>{manga.path || 'Non disponible'}</strong></div>
            <div><span>Categorie</span><strong>{manga.categoryName || 'Bibliotheque'}</strong></div>
            <div><span>Identifiant</span><strong>{manga.contentId || manga.id}</strong></div>
          </div>
        ) : null}
        {tab === 'annotations' ? (
          <div className="kv-annotation-list">
            {annotations.length ? annotations.map((annotation) => (
              <article key={annotation.id}>
                <strong>{annotation.label || `Page ${Number(annotation.pageIndex || 0) + 1}`}</strong>
                <p>{annotation.note || 'Repere sans note.'}</p>
              </article>
            )) : <div className="kv-flat-message">Aucune annotation.</div>}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default memo(KavitaSeriesView);
