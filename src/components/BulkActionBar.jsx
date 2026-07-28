import { memo, useState } from 'react';
import {
  BookIcon,
  HeartIcon,
  LayersIcon,
  SparklesIcon,
  TagIcon,
  TrashIcon,
  ArchiveIcon,
  CheckIcon
} from './Icons.jsx';

function BulkActionButton({ icon, label, onClick, danger = false, disabled = false }) {
  return (
    <button
      type="button"
      className={`bulk-action-button ${danger ? 'bulk-action-button-danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BulkActionBar({
  selectionCount,
  hiddenCount = 0,
  onClear,
  onExit,
  onSelectAll,
  onInvert,
  onMarkRead,
  onMarkUnread,
  onFavorite,
  onUnfavorite,
  onOpenCollectionPicker,
  onOpenTagPicker,
  onQueueWorkbench,
  onVaultToggle,
  onGroupEditions,
  onTrash,
  trashJob = null,
  onCancelTrash,
  onUndo,
  undoLabel = '',
  vaultActionLabel = 'Envoyer au coffre'
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const actionsDisabled = selectionCount === 0;

  return (
    <div className="bulk-action-bar" role="toolbar" aria-label="Actions sur la selection">
      <div className="bulk-action-copy">
        <div className="bulk-action-copy-badge">
          <CheckIcon size={14} /> {selectionCount} selection{selectionCount > 1 ? 's' : ''}
        </div>
        {hiddenCount > 0 ? <p>{hiddenCount} masquee{hiddenCount > 1 ? 's' : ''} par le filtre actuel.</p> : null}
        {trashJob && !trashJob.terminal ? (
          <p>
            Corbeille {trashJob.completed || 0}/{trashJob.total || 0}
            {trashJob.status === 'queued' ? ' · en attente' : ' · en cours'}
            {onCancelTrash ? (
              <button type="button" className="ghost-button" onClick={onCancelTrash}>Annuler</button>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="bulk-selection-tools">
        <button type="button" className="ghost-button" onClick={onSelectAll}>Tout</button>
        <button type="button" className="ghost-button" onClick={onInvert}>Inverser</button>
        <button type="button" className="ghost-button" onClick={onClear}>Vider</button>
      </div>
      <div className="bulk-action-buttons">
        <BulkActionButton icon={<BookIcon size={15} />} label="Lu" onClick={onMarkRead} disabled={actionsDisabled} />
        <BulkActionButton icon={<HeartIcon size={15} filled />} label="Favori" onClick={onFavorite} disabled={actionsDisabled} />
        <BulkActionButton icon={<LayersIcon size={15} />} label="Collection" onClick={onOpenCollectionPicker} disabled={actionsDisabled} />
        <BulkActionButton icon={<TagIcon size={15} />} label="Tags" onClick={onOpenTagPicker} disabled={actionsDisabled} />
        <div className="bulk-more-shell">
          <button type="button" className="bulk-action-button" disabled={actionsDisabled} onClick={() => setMoreOpen((open) => !open)}>
            <SparklesIcon size={15} /><span>Plus</span>
          </button>
          {moreOpen ? (
            <div className="bulk-more-menu">
              <button type="button" onClick={onMarkUnread}><BookIcon size={14} /> Marquer non lu</button>
              <button type="button" onClick={onUnfavorite}><HeartIcon size={14} /> Retirer des favoris</button>
              <button type="button" onClick={onQueueWorkbench}><SparklesIcon size={14} /> Atelier metadata</button>
              <button type="button" onClick={onVaultToggle}><ArchiveIcon size={14} /> {vaultActionLabel}</button>
              <button type="button" disabled={selectionCount < 2} onClick={onGroupEditions}><LayersIcon size={14} /> Grouper comme editions</button>
              <button type="button" className="bulk-more-danger" onClick={onTrash}><TrashIcon size={14} /> Supprimer physiquement</button>
            </div>
          ) : null}
        </div>
      </div>

      <button type="button" className="ghost-button bulk-action-clear" onClick={onExit}>
        Quitter <kbd>Esc</kbd>
      </button>
      {onUndo && undoLabel ? (
        <button type="button" className="ghost-button bulk-action-undo" onClick={onUndo}>
          {undoLabel}
        </button>
      ) : null}
    </div>
  );
}

export default memo(BulkActionBar);
