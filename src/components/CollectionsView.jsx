import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import CurvedScrollArea from './CurvedScrollArea.jsx';
import {
  ChevronRightIcon,
  ClockIcon,
  FoldersIcon,
  LayersIcon,
  SparklesIcon,
  TrashIcon
} from './Icons.jsx';

function CollectionCard({ collection, tone = 'smart', onOpen, onDelete }) {
  const previewMangas = (collection.mangas || []).slice(0, 5);
  const isSmart = tone === 'smart';
  const Icon = isSmart ? SparklesIcon : FoldersIcon;

  return (
    <article className={`collection-card collection-card-${tone}`} onClick={() => onOpen(collection.id)}>
      <div className="collection-card-head">
        <div className="collection-card-title-wrap">
          <span className="collection-card-icon"><Icon size={18} /></span>
          <div>
            <h3>{collection.label || collection.name}</h3>
            <p>{collection.description || (isSmart ? 'Vue dynamique locale générée par l\u2019app.' : 'Collection manuelle sans déplacer les dossiers.')}</p>
          </div>
        </div>

        <div className="collection-card-actions">
          <span className="collection-count-pill">{collection.count ?? (collection.mangas || []).length} manga{(collection.count ?? (collection.mangas || []).length) > 1 ? 's' : ''}</span>
          {!isSmart && onDelete ? (
            <button
              className="icon-pill danger"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(collection.id);
              }}
              title="Supprimer la collection"
            >
              <TrashIcon size={16} />
            </button>
          ) : null}
          <span className="collection-open-indicator"><ChevronRightIcon size={18} /></span>
        </div>
      </div>

      <div className="collection-card-body">
        <div className="collection-card-covers">
          {previewMangas.length > 0 ? previewMangas.map((manga) => (
            <div key={manga.id} className="collection-cover-tile">
              {manga.coverSrc ? <img src={manga.coverSrc} alt={manga.displayTitle} loading="lazy" decoding="async" /> : <div className="cover-fallback">{manga.displayTitle?.[0] || '?'}</div>}
            </div>
          )) : (
            <div className="collection-empty-strip">Aucun manga visible pour le moment.</div>
          )}
        </div>

        <div className="collection-card-footer">
          <span className="collection-footer-item"><LayersIcon size={15} /> {previewMangas.length > 0 ? 'Prévisualisation rapide' : 'Collection vide'}</span>
          <span className="collection-footer-item"><ClockIcon size={15} /> 100 % local</span>
        </div>
      </div>
    </article>
  );
}

function CollectionsSection({ title, subtitle, collections, tone, onOpen, onDelete }) {
  return (
    <section className="collections-section">
      <div className="collections-section-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>

      {collections.length === 0 ? (
        <div className="empty-card">
          <h3>Aucune collection à afficher</h3>
          <p>{tone === 'smart' ? 'Les collections intelligentes se remplissent automatiquement selon ta bibliothèque locale.' : 'Crée une collection depuis la fiche d\u2019un manga pour commencer.'}</p>
        </div>
      ) : (
        <div className="collections-list">
          {collections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} tone={tone} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}

function CollectionsView({
  smartCollections = [],
  manualCollections = [],
  initialScrollTop = 0,
  onScrollPositionChange,
  onOpenCollection,
  onDeleteCollection
}) {
  const containerRef = useRef(null);
  const hasRestoredRef = useRef(false);
  const isRestoringRef = useRef(false);

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
  }, [initialScrollTop]);

  const handleScroll = useCallback((event) => {
    if (isRestoringRef.current) return;
    onScrollPositionChange?.(event.currentTarget.scrollTop);
  }, [onScrollPositionChange]);

  return (
    <CurvedScrollArea className="library-view collections-view" ref={containerRef} onScroll={handleScroll}>
      <div className="hero-card hero-card-dashboard collections-hero-card">
        <div className="hero-carousel-copy">
          <div className="hero-carousel-copy-topline">Collections locales</div>
          <h2>Range ta bibliothèque sans toucher à tes dossiers.</h2>
          <p>Retrouve ici toutes les collections intelligentes générées localement et tes collections perso façon MDList, mais 100 % hors ligne.</p>
        </div>
        <div className="dashboard-mini-stats collections-mini-stats">
          <div className="dashboard-mini-card"><strong>{smartCollections.length}</strong><span>intelligentes</span></div>
          <div className="dashboard-mini-card"><strong>{manualCollections.length}</strong><span>personnelles</span></div>
          <div className="dashboard-mini-card"><strong>{smartCollections.reduce((sum, collection) => sum + (collection.count ?? 0), 0)}</strong><span>apparitions manga</span></div>
        </div>
      </div>

      <CollectionsSection
        title="Collections intelligentes"
        subtitle="Des vues dynamiques locales : continuer, non lus, nouveaux chapitres, favoris, etc."
        collections={smartCollections}
        tone="smart"
        onOpen={onOpenCollection}
      />

      <CollectionsSection
        title="Collections personnelles"
        subtitle="Tes regroupements manuels, sans déplacer les dossiers du disque."
        collections={manualCollections}
        tone="manual"
        onOpen={onOpenCollection}
        onDelete={onDeleteCollection}
      />
    </CurvedScrollArea>
  );
}

export default memo(CollectionsView);
