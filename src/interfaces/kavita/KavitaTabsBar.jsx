import { memo, useEffect, useRef } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { reorderTabsPreservingPins } from './tabInteractions.js';

function SortableKavitaTab({
  tab,
  active,
  tabCount,
  onSelectTab,
  onCloseTab,
  onContextMenu
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: tab.id });

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-kv-tab-id={tab.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`kv-tab ${active ? 'is-active' : ''} ${tab.pinned ? 'is-pinned' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onClick={() => onSelectTab?.(tab.id)}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onMouseUp={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          event.stopPropagation();
          onCloseTab?.(tab.id);
        }
      }}
      onContextMenu={(event) => onContextMenu?.(event, { type: 'tab', tab })}
      title={tab.subtitle ? `${tab.label} - ${tab.subtitle}` : tab.label}
      {...attributes}
      {...listeners}
    >
      <span>{tab.label}</span>
      {tabCount > 1 && !tab.pinned ? (
        <X
          size={13}
          role="button"
          aria-label={`Fermer ${tab.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onCloseTab?.(tab.id);
          }}
        />
      ) : null}
    </button>
  );
}

function KavitaTabsBar({
  tabs = [],
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onContextMenu,
  onReorderTabs,
  compact = false
}) {
  const trackRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const activeTab = trackRef.current?.querySelector(`[data-kv-tab-id="${activeTabId}"]`);
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  function scrollByPage(direction) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(160, track.clientWidth * 0.65), behavior: 'smooth' });
  }

  function handleWheel(event) {
    const track = trackRef.current;
    if (!track || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    track.scrollLeft += event.deltaY;
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    onReorderTabs?.((currentTabs) => reorderTabsPreservingPins(currentTabs, active.id, over.id));
  }

  return (
    <div className={`kv-tabsbar ${compact ? 'is-reader-tabs' : ''}`}>
      <button type="button" className="kv-tab-scroll" title="Onglets precedents" onClick={() => scrollByPage(-1)}>
        <ChevronLeft size={15} />
      </button>
      <div ref={trackRef} className="kv-tabs-scroll" onWheel={handleWheel}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
            <div className="kv-tabs-sortable">
              {tabs.map((tab) => (
                <SortableKavitaTab
                  key={tab.id}
                  tab={tab}
                  active={activeTabId === tab.id}
                  tabCount={tabs.length}
                  onSelectTab={onSelectTab}
                  onCloseTab={onCloseTab}
                  onContextMenu={onContextMenu}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <button type="button" className="kv-tab-scroll" title="Nouvel onglet" onClick={onNewTab}>
        <Plus size={15} />
      </button>
      <button type="button" className="kv-tab-scroll" title="Onglets suivants" onClick={() => scrollByPage(1)}>
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

export default memo(KavitaTabsBar);
