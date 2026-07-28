import { memo } from 'react';
import MediaAsset from './MediaAsset.jsx';
import { normalizeCollectionAppearance, resolveCollectionCoverMangas } from '../utils/collectionAppearance.js';

function cropStyle(manga, format) {
  const crop = manga?.coverProfile?.crops?.[format] || { x: 0, y: 0, zoom: 1 };
  const x = Math.max(-1, Math.min(1, Number(crop.x) || 0));
  const y = Math.max(-1, Math.min(1, Number(crop.y) || 0));
  const zoom = Math.max(1, Math.min(4, Number(crop.zoom) || 1));
  return {
    transform: `translate(${x * 18}%, ${y * 18}%) scale(${zoom})`
  };
}

function CollectionCoverPreview({ collection, mangas = [], compact = false }) {
  const appearance = normalizeCollectionAppearance(collection?.appearance);
  const covers = resolveCollectionCoverMangas(collection, mangas);
  const format = appearance.type === 'banner' ? 'banner' : 'portrait';

  return (
    <div
      className={`collection-cover-preview collection-cover-preview-${appearance.type} ${compact ? 'is-compact' : ''}`}
      data-appearance={appearance.type}
      aria-label={`Aperçu ${appearance.type}`}
    >
      {covers.map((manga, index) => (
        <div key={manga.id} className="collection-cover-preview-item" style={{ '--cover-index': index }}>
          {manga.coverSrc || manga.coverMediaType === 'pdf' ? (
            <MediaAsset
              src={manga.coverSrc}
              alt={manga.displayTitle || manga.name}
              loading="lazy"
              className="thumb-media"
              style={cropStyle(manga, format)}
              mediaType={manga.coverMediaType || 'image'}
              filePath={manga.coverFilePath}
              pageNumber={manga.coverPageNumber || 1}
              maxWidth={appearance.type === 'banner' ? 520 : 180}
              maxHeight={appearance.type === 'banner' ? 220 : 270}
            />
          ) : <div className="cover-fallback cover-fallback-sm">{(manga.displayTitle || manga.name || '?')[0]}</div>}
        </div>
      ))}
      {covers.length === 0 ? <div className="collection-cover-preview-empty">Aucune couverture</div> : null}
    </div>
  );
}

export default memo(CollectionCoverPreview);
