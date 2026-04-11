import { memo, useMemo } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronRightIcon,
  CloseIcon,
  ClockIcon,
  LayoutGridIcon,
  PinIcon,
  PlayIcon,
  ScrollIcon
} from './Icons.jsx';

function sourceLabel(source) {
  if (source === 'manual') return 'Manuel';
  if (source === 'quick-add') return 'Ajout rapide';
  if (source === 'end-of-chapter') return 'Fin de chapitre';
  if (source === 'next-engine') return 'Suite detectee';
  return 'Lecture';
}

function QueueItemCard({ item, onOpenItem, onRemoveItem, onTogglePinned }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`queue-item-card ${isDragging ? 'queue-item-card-dragging' : ''} ${item.pinned ? 'queue-item-card-pinned' : ''}`}
    >
      <button
        type="button"
        className="queue-item-drag-handle"
        aria-label={`Reordonner ${item.title}`}
        {...attributes}
        {...listeners}
      >
        <ChevronRightIcon size={14} />
      </button>

      <div className="queue-item-main">
        <button type="button" className="queue-item-open" onClick={() => onOpenItem(item)}>
          <span className="queue-item-kind">{item.chapterId ? <ScrollIcon size={13} /> : <LayoutGridIcon size={13} />}</span>
          <span className="queue-item-copy">
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </span>
        </button>

        <div className="queue-item-meta">
          <span className="queue-item-source">{sourceLabel(item.displaySource)}</span>
          {item.deferredUntil ? (
            <span className="queue-item-deferred">
              <ClockIcon size={12} />
              Plus tard
            </span>
          ) : null}
        </div>
      </div>

      <div className="queue-item-actions">
        <button
          type="button"
          className={`queue-item-action ${item.pinned ? 'active' : ''}`}
          onClick={() => onTogglePinned(item)}
          title={item.pinned ? 'Retirer l epingle' : 'Epingler'}
        >
          <PinIcon size={13} />
        </button>
        <button type="button" className="queue-item-action" onClick={() => onOpenItem(item)} title="Ouvrir">
          <PlayIcon size={13} />
        </button>
        <button type="button" className="queue-item-action danger" onClick={() => onRemoveItem(item)} title="Retirer">
          <CloseIcon size={13} />
        </button>
      </div>
    </article>
  );
}

function ReadingQueueDrawer({
  open = false,
  items = [],
  onClose,
  onOpenItem,
  onRemoveItem,
  onTogglePinned,
  onReorderItems,
  blocked = false
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const orderedItemIds = useMemo(() => items.map((item) => item.key), [items]);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!active?.id || !over?.id || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.key === active.id);
    const newIndex = items.findIndex((item) => item.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderItems?.(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <div className={`queue-drawer-layer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <button type="button" className="queue-drawer-scrim" onClick={onClose} tabIndex={open ? 0 : -1} />
      <aside className={`queue-drawer ${open ? 'open' : ''}`}>
        <div className="queue-drawer-head">
          <div>
            <span className="queue-drawer-kicker">Reading Queue</span>
            <h3>A lire ensuite</h3>
            <p>{items.length ? `${items.length} element${items.length > 1 ? 's' : ''} en attente.` : 'Ta file est vide pour le moment.'}</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Fermer</button>
        </div>

        {blocked ? (
          <div className="queue-drawer-empty">
            <strong>Session neutralisee</strong>
            <span>La queue reste masquee tant que le coffre n est pas deverrouille.</span>
          </div>
        ) : items.length === 0 ? (
          <div className="queue-drawer-empty">
            <strong>Rien dans la queue</strong>
            <span>Ajoute un manga, un chapitre ou la suite detectee depuis les menus rapides.</span>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedItemIds} strategy={rectSortingStrategy}>
              <div className="queue-drawer-list">
                {items.map((item) => (
                  <QueueItemCard
                    key={item.key}
                    item={item}
                    onOpenItem={onOpenItem}
                    onRemoveItem={onRemoveItem}
                    onTogglePinned={onTogglePinned}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </aside>
    </div>
  );
}

export default memo(ReadingQueueDrawer);
