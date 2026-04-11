import { memo, useMemo, useState } from 'react';
import { CheckIcon, PlusIcon, SearchIcon } from './Icons.jsx';

function BatchPickerModal({
  title,
  subtitle,
  items,
  itemLabel,
  itemMeta,
  createLabel,
  newItemPlaceholder,
  onCreate,
  onPick,
  onClose
}) {
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const label = String(itemLabel(item) || '').toLowerCase();
      const meta = String(itemMeta?.(item) || '').toLowerCase();
      return label.includes(needle) || meta.includes(needle);
    });
  }, [items, query, itemLabel, itemMeta]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel batch-picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="batch-picker-head">
          <div>
            <h3>{title}</h3>
            <p className="muted-text">{subtitle}</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Fermer</button>
        </div>

        <div className="modal-search-row">
          <SearchIcon size={15} />
          <input className="modal-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher" />
        </div>

        <div className="batch-picker-list">
          {filteredItems.map((item) => (
            <button key={item.id} type="button" className="batch-picker-item" onClick={() => onPick(item)}>
              <span className="batch-picker-copy">
                <strong>{itemLabel(item)}</strong>
                {itemMeta ? <small>{itemMeta(item)}</small> : null}
              </span>
              <span className="batch-picker-check"><CheckIcon size={14} /></span>
            </button>
          ))}
          {filteredItems.length === 0 ? <p className="muted-text modal-empty-state">Aucun resultat.</p> : null}
        </div>

        {onCreate ? (
          <div className="batch-picker-create">
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={newItemPlaceholder} />
            <button
              type="button"
              className="primary-button"
              disabled={!newName.trim()}
              onClick={async () => {
                await onCreate(newName.trim());
                setNewName('');
              }}
            >
              <PlusIcon size={14} /> {createLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(BatchPickerModal);
