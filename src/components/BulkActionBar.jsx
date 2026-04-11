import { memo } from 'react';
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

function BulkActionButton({ icon, label, onClick, danger = false }) {
  return (
    <button
      type="button"
      className={`bulk-action-button ${danger ? 'bulk-action-button-danger' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BulkActionBar({
  selectionCount,
  onClear,
  onMarkRead,
  onMarkUnread,
  onFavorite,
  onUnfavorite,
  onOpenCollectionPicker,
  onOpenTagPicker,
  onQueueWorkbench,
  onVaultToggle,
  vaultActionLabel = 'Envoyer au coffre'
}) {
  if (!selectionCount) return null;

  return (
    <div className="bulk-action-bar">
      <div className="bulk-action-copy">
        <div className="bulk-action-copy-badge">
          <CheckIcon size={14} /> {selectionCount} selection{selectionCount > 1 ? 's' : ''}
        </div>
        <p>Actions rapides pour organiser, corriger et proteger tes mangas sans casser le flux.</p>
      </div>

      <div className="bulk-action-buttons">
        <BulkActionButton icon={<BookIcon size={15} />} label="Marquer lu" onClick={onMarkRead} />
        <BulkActionButton icon={<TrashIcon size={15} />} label="Marquer non lu" onClick={onMarkUnread} />
        <BulkActionButton icon={<HeartIcon size={15} filled />} label="Favori" onClick={onFavorite} />
        <BulkActionButton icon={<HeartIcon size={15} />} label="Retirer favoris" onClick={onUnfavorite} />
        <BulkActionButton icon={<LayersIcon size={15} />} label="Ajouter collection" onClick={onOpenCollectionPicker} />
        <BulkActionButton icon={<TagIcon size={15} />} label="Ajouter tag" onClick={onOpenTagPicker} />
        <BulkActionButton icon={<SparklesIcon size={15} />} label="Atelier metadata" onClick={onQueueWorkbench} />
        <BulkActionButton icon={<ArchiveIcon size={15} />} label={vaultActionLabel} onClick={onVaultToggle} />
      </div>

      <button type="button" className="ghost-button bulk-action-clear" onClick={onClear}>
        Vider la selection
      </button>
    </div>
  );
}

export default memo(BulkActionBar);
