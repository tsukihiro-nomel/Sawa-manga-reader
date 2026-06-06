import { memo, useEffect, useMemo } from 'react';
import { FolderPlusIcon, SearchIcon } from './Icons.jsx';

function AddEntryMenu({
  open,
  anchor = null,
  showWebSources = false,
  onClose,
  onAddCategories,
  onOpenWebSources
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const position = useMemo(() => {
    if (!open) return null;
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    const width = 320;
    const left = anchor
      ? Math.max(16, Math.min(anchor.left, viewportWidth - width - 16))
      : Math.max(16, viewportWidth - width - 24);
    const top = anchor
      ? Math.max(76, Math.min(anchor.bottom + 10, viewportHeight - 220))
      : 92;
    return { left, top };
  }, [anchor, open]);

  if (!open || !position) return null;

  return (
    <div className="add-entry-menu-layer" onClick={onClose}>
      <div className="add-entry-menu" style={position} onClick={(event) => event.stopPropagation()}>
        <div className="add-entry-menu-head">
          <span className="add-entry-menu-kicker">Ajouter</span>
          <strong>Choisis un point d'entree</strong>
          <span>On garde une seule action visible, puis on detaille seulement si l'addon est actif.</span>
        </div>

        <button type="button" className="add-entry-menu-item" onClick={onAddCategories}>
          <span className="add-entry-menu-icon"><FolderPlusIcon size={18} /></span>
          <span className="add-entry-menu-copy">
            <strong>Ajouter des categories</strong>
            <small>Brancher un dossier local a la bibliotheque.</small>
          </span>
        </button>

        {showWebSources ? (
          <button type="button" className="add-entry-menu-item" onClick={onOpenWebSources}>
            <span className="add-entry-menu-icon"><SearchIcon size={18} /></span>
            <span className="add-entry-menu-copy">
              <strong>Sources web</strong>
              <small>Rechercher puis importer dans une categorie locale.</small>
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default memo(AddEntryMenu);
