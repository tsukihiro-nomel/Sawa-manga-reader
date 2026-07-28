import { useEffect, useMemo, useState } from 'react';
import MediaAsset from './MediaAsset.jsx';
import { createCropPersistenceController } from '../utils/cropPersistence.js';

function localSrc(filePath) {
  return filePath ? `manga://local/${encodeURIComponent(filePath)}` : null;
}

function CoverTile({ entry, active, onSelect, onAdopt }) {
  const src = entry.src || localSrc(entry.path);
  return (
    <article className={`cover-manager-tile ${active ? 'is-active' : ''}`}>
      <button type="button" className="cover-manager-image-button" onClick={onSelect || onAdopt}>
        {src || entry.mediaType === 'pdf' ? (
          <MediaAsset
            src={src}
            filePath={entry.filePath || entry.path}
            mediaType={entry.mediaType || 'image'}
            pageNumber={entry.pageNumber || 1}
            alt={entry.label}
            className="cover-manager-tile-image"
            maxWidth={240}
            maxHeight={360}
          />
        ) : <div className="cover-fallback cover-manager-tile-image">?</div>}
      </button>
      <div>
        <strong>{entry.label}</strong>
        <small>{entry.kind === 'managed' ? 'Copie gérée par Sawa' : entry.kind?.startsWith('legacy') ? 'Fichier historique conservé' : 'Source automatique'}</small>
      </div>
      {onAdopt ? <button type="button" className="ghost-button" onClick={onAdopt}>Utiliser cette page</button> : null}
      {active ? <span className="cover-manager-active-label">Active</span> : null}
    </article>
  );
}

export default function CoverManagerModal({ manga, onClose, onChanged }) {
  const [gallery, setGallery] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [format, setFormat] = useState('portrait');

  async function loadGallery() {
    setError('');
    const result = await window.mangaAPI.listCovers(manga.id);
    setGallery(result?.gallery || null);
  }

  const cropPersistence = useMemo(() => createCropPersistenceController({
    persist: (value) => window.mangaAPI.updateCoverCrop({
      mangaId: manga.id,
      format: value.format,
      crop: value.crop
    }),
    onApplied: async () => {
      setBusy(false);
      await loadGallery();
      await onChanged?.();
    },
    onError: (saveError) => {
      setBusy(false);
      setError(saveError?.message || 'Impossible d’enregistrer le cadrage.');
    }
  }), [manga.id]);

  useEffect(() => {
    let active = true;
    window.mangaAPI.listCovers(manga.id)
      .then((result) => {
        if (active) setGallery(result?.gallery || null);
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'Impossible de charger les couvertures.');
      });
    return () => { active = false; };
  }, [manga.id]);

  const crop = useMemo(
    () => gallery?.profile?.crops?.[format] || { x: 0, y: 0, zoom: 1 },
    [format, gallery?.profile?.crops]
  );
  const activeEntry = useMemo(() => {
    const activeId = gallery?.profile?.activeVariantId || 'auto';
    return activeId === 'auto'
      ? gallery?.auto
      : gallery?.profile?.variants?.find((variant) => variant.id === activeId);
  }, [gallery]);
  const activeSrc = activeEntry?.src || localSrc(activeEntry?.path);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (result?.ok === false) throw new Error(result.error || 'Action impossible.');
      await loadGallery();
      await onChanged?.();
    } catch (actionError) {
      setError(actionError?.message || 'Impossible de modifier la couverture.');
    } finally {
      setBusy(false);
    }
  }

  function updateCrop(patch) {
    const nextCrop = { ...crop, ...patch };
    setGallery((current) => current ? {
      ...current,
      profile: {
        ...current.profile,
        crops: { ...current.profile.crops, [format]: nextCrop }
      }
    } : current);
  }

  function scheduleCrop(nextCrop) {
    setBusy(true);
    cropPersistence.schedule({ format, crop: nextCrop });
  }

  async function persistCrop(nextCrop) {
    setBusy(true);
    await cropPersistence.flush(nextCrop ? { format, crop: nextCrop } : undefined);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel modal-panel-wide cover-manager-modal" onClick={(event) => event.stopPropagation()}>
        <header className="cover-manager-head">
          <div>
            <span className="vault-kicker">Gestionnaire de couvertures</span>
            <h3>{manga.displayTitle}</h3>
            <p>L’original reste intact. Sawa copie les images importées dans ses données locales.</p>
          </div>
          <div className="cover-manager-head-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => run(() => window.mangaAPI.importCover(manga.id))}>
              Importer une image
            </button>
            <button type="button" className="ghost-button" onClick={onClose}>Fermer</button>
          </div>
        </header>

        {error ? <div className="metadata-editor-status" role="alert">{error}</div> : null}
        {!gallery ? <div className="cover-manager-loading">Chargement de la galerie…</div> : (
          <div className="cover-manager-layout">
            <div className="cover-manager-gallery">
              <h4>Galerie</h4>
              <div className="cover-manager-grid">
                <CoverTile
                  entry={gallery.auto}
                  active={gallery.profile.activeVariantId === 'auto'}
                  onSelect={() => run(() => window.mangaAPI.selectCover({ mangaId: manga.id, variantId: 'auto' }))}
                />
                {gallery.profile.variants.map((variant) => (
                  <CoverTile
                    key={variant.id}
                    entry={variant}
                    active={gallery.profile.activeVariantId === variant.id}
                    onSelect={() => run(() => window.mangaAPI.selectCover({ mangaId: manga.id, variantId: variant.id }))}
                  />
                ))}
              </div>

              {gallery.pageCandidates.length ? (
                <>
                  <h4>Pages candidates</h4>
                  <div className="cover-manager-grid">
                    {gallery.pageCandidates.map((candidate) => (
                      <CoverTile
                        key={candidate.id}
                        entry={candidate}
                        onAdopt={candidate.path && candidate.mediaType !== 'pdf'
                          ? () => run(() => window.mangaAPI.adoptCoverCandidate({
                              mangaId: manga.id,
                              sourcePath: candidate.path
                            }))
                          : null}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <aside className="cover-crop-editor">
              <div className="cover-crop-format">
                <button type="button" className={format === 'portrait' ? 'active' : ''} onClick={() => setFormat('portrait')}>Portrait</button>
                <button type="button" className={format === 'banner' ? 'active' : ''} onClick={() => setFormat('banner')}>Bannière</button>
              </div>
              <div className={`cover-crop-stage is-${format}`}>
                {activeSrc || activeEntry?.mediaType === 'pdf' ? (
                  <MediaAsset
                    src={activeSrc}
                    filePath={activeEntry?.filePath || activeEntry?.path}
                    mediaType={activeEntry?.mediaType || 'image'}
                    pageNumber={activeEntry?.pageNumber || 1}
                    alt="Aperçu du cadrage"
                    style={{ transform: `translate(${crop.x * 22}%, ${crop.y * 22}%) scale(${crop.zoom})` }}
                  />
                ) : <div className="cover-fallback">?</div>}
              </div>
              <label>Horizontal
                <input type="range" min="-1" max="1" step="0.01" value={crop.x} onChange={(event) => {
                  const next = { ...crop, x: Number(event.target.value) };
                  updateCrop(next);
                  scheduleCrop(next);
                }} onPointerUp={() => persistCrop()} onBlur={() => persistCrop()} />
              </label>
              <label>Vertical
                <input type="range" min="-1" max="1" step="0.01" value={crop.y} onChange={(event) => {
                  const next = { ...crop, y: Number(event.target.value) };
                  updateCrop(next);
                  scheduleCrop(next);
                }} onPointerUp={() => persistCrop()} onBlur={() => persistCrop()} />
              </label>
              <label>Zoom
                <input type="range" min="1" max="4" step="0.05" value={crop.zoom} onChange={(event) => {
                  const next = { ...crop, zoom: Number(event.target.value) };
                  updateCrop(next);
                  scheduleCrop(next);
                }} onPointerUp={() => persistCrop()} onBlur={() => persistCrop()} />
              </label>
              <button type="button" className="ghost-button" disabled={busy} onClick={() => persistCrop({ x: 0, y: 0, zoom: 1 })}>Réinitialiser le cadrage</button>
              <small>Cadrage enregistré uniquement pour le format {format === 'portrait' ? 'portrait' : 'bannière'}.</small>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
