import { memo, useMemo } from 'react';
import { ArrowLeft, BookOpen, Clock3, Play } from 'lucide-react';
import MediaAsset from '../../components/MediaAsset.jsx';
import { resolveTabOpenIntent } from './tabInteractions.js';

function KavitaChapterView({ manga, chapter, annotations = [], onBack, onReadFrom, onReadFromInNewTab }) {
  const pages = chapter.pages || [];
  const preview = pages[0];
  const title = chapter.displayTitle || chapter.name || 'Chapitre';
  const minutes = Math.max(1, Math.round(Number(chapter.pageCount || pages.length || 0) * 0.55));
  const chapterAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.chapterId === chapter.id),
    [annotations, chapter.id]
  );

  return (
    <section className="kv-series-view kv-chapter-view">
      <button type="button" className="kv-back-button" onClick={onBack}><ArrowLeft size={17} /> Retour</button>
      <div className="kv-series-hero">
        <div className="kv-series-cover kv-chapter-cover">
          {preview?.src || preview?.sourceType === 'pdf' ? (
            <MediaAsset
              src={preview.src}
              alt={title}
              className="kv-series-cover-image"
              mediaType={preview.sourceType || 'image'}
              filePath={preview.path}
              pageNumber={preview.pdfPageNumber || 1}
              maxWidth={520}
              maxHeight={780}
            />
          ) : manga.coverSrc ? <MediaAsset src={manga.coverSrc} alt={title} className="kv-series-cover-image" /> : <div className="kv-cover-fallback">?</div>}
        </div>
        <div className="kv-series-info">
          <p className="kv-series-subtitle">{manga.displayTitle || manga.name}</p>
          <h1>{title}</h1>
          <div className="kv-series-facts">
            <span><BookOpen size={15} /> {chapter.pageCount || pages.length || 0} pages</span>
            <span><Clock3 size={15} /> {minutes} min</span>
          </div>
          <div className="kv-series-actions">
            <button type="button" className="kv-primary-action" onClick={() => onReadFrom?.(chapter.progress?.pageIndex || 0)}>
              <Play size={17} /> {chapter.progress?.pageIndex > 0 ? 'Continuer' : 'Lire'}
            </button>
          </div>
          <p className="kv-series-summary">{chapter.description || manga.description || 'Aucun resume disponible pour ce chapitre.'}</p>
          <div className="kv-metadata-columns">
            <dl>
              <dt>Serie</dt>
              <dd>{manga.displayTitle || manga.name}</dd>
              <dt>Statut</dt>
              <dd>{chapter.isRead ? 'Lu' : chapter.progress?.pageIndex > 0 ? 'En cours' : 'Non lu'}</dd>
            </dl>
            <dl>
              <dt>Annotations</dt>
              <dd>{chapterAnnotations.length}</dd>
              <dt>Source</dt>
              <dd>{chapter.path || 'Bibliotheque locale'}</dd>
            </dl>
          </div>
        </div>
      </div>
      <nav className="kv-detail-tabs">
        <button type="button" className="is-active">Pages</button>
        <button type="button">Details</button>
        <button type="button">Annotations {chapterAnnotations.length}</button>
      </nav>
      <div className="kv-page-preview-grid">
        {pages.slice(0, 60).map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={(event) => {
              const intent = resolveTabOpenIntent(event, false);
              if (intent === 'current') onReadFrom?.(page.index);
              else onReadFromInNewTab?.(page.index, { activate: intent === 'foreground' });
            }}
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault();
            }}
            onMouseUp={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              event.stopPropagation();
              onReadFromInNewTab?.(page.index, { activate: false });
            }}
          >
            <MediaAsset
              src={page.src}
              alt={`Page ${page.index + 1}`}
              className="kv-page-preview"
              mediaType={page.sourceType || 'image'}
              filePath={page.path}
              pageNumber={page.pdfPageNumber || page.index + 1}
              maxWidth={260}
              maxHeight={360}
            />
            <span>Page {page.index + 1}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default memo(KavitaChapterView);
