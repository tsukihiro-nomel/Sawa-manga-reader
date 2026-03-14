import { memo, useEffect, useRef, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeftIcon, ChevronRightIcon, CloseIcon, CopyIcon,
  LayoutGridIcon, LibraryIcon, MaximizeIcon, MinimizeIcon,
  PanelCollapseIcon, PanelExpandIcon, PinIcon, PlusIcon, ScrollIcon
} from './Icons.jsx';

function iconFor(kind) {
  if (kind === 'reader') return <ScrollIcon size={14} />;
  if (kind === 'manga' || kind === 'preview') return <LayoutGridIcon size={14} />;
  return <LibraryIcon size={14} />;
}

function SortableTab({ tab, active, onSelectTab, onCloseTab, onContextMenu }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      data-tab-id={tab.id}
      className={`browser-tab ${active ? 'browser-tab-active' : ''} ${isDragging ? 'browser-tab-dragging' : ''} ${tab.pinned ? 'browser-tab-pinned' : ''}`}
      onClick={() => onSelectTab(tab.id)}
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
      onMouseUp={(e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); onCloseTab(tab.id); } }}
      onContextMenu={(e) => onContextMenu(e, { type: 'tab', tab })}
      title={tab.subtitle ? `${tab.label} — ${tab.subtitle}` : tab.label}
      {...attributes}
      {...listeners}
    >
      {tab.pinned && <span className="browser-tab-pin"><PinIcon size={10} /></span>}
      <span className="browser-tab-icon">{iconFor(tab.kind)}</span>
      {!tab.pinned && (
        <span className="browser-tab-copy">
          <strong>{tab.label}</strong>
          <small>{tab.subtitle}</small>
        </span>
      )}
      {!tab.pinned && (
        <span
          className="browser-tab-close"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
          role="button"
          aria-label={`Fermer ${tab.label}`}
        >
          <CloseIcon size={12} />
        </span>
      )}
    </button>
  );
}

function TitleBar({
  sidebarCollapsed = false, onToggleSidebar,
  tabs = [], activeTabId, onSelectTab, onCloseTab, onNewTab,
  onContextMenu, onReorderTabs
}) {
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const sync = () => {
      setCanScrollLeft(track.scrollLeft > 4);
      setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
    };
    sync();
    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => { track.removeEventListener('scroll', sync); window.removeEventListener('resize', sync); };
  }, [tabs.length]);

  useEffect(() => {
    const el = trackRef.current?.querySelector(`[data-tab-id="${activeTabId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  function handleWheel(e) {
    const track = trackRef.current;
    if (!track) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      track.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorderTabs((curr) => {
      const oldIdx = curr.findIndex((t) => t.id === active.id);
      const newIdx = curr.findIndex((t) => t.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return curr;
      return arrayMove(curr, oldIdx, newIdx);
    });
  }

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <button
          className="window-button titlebar-sidebar-toggle no-drag"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Afficher la barre latérale' : 'Replier la barre latérale'}
          title={sidebarCollapsed ? 'Afficher la barre latérale' : 'Replier la barre latérale'}
        >
          {sidebarCollapsed ? <PanelExpandIcon size={15} /> : <PanelCollapseIcon size={15} />}
        </button>
        <span className="brand-dot" />
        <span>Sawa</span>
      </div>

      <div className="titlebar-tabs-area">
        {canScrollLeft && (
          <button
            className="tabsbar-scroll"
            onClick={() => trackRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
            title="Défiler gauche"
          >
            <ChevronLeftIcon size={14} />
          </button>
        )}

        <div className="tabsbar-track" ref={trackRef} onWheel={handleWheel}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
              <div className="tabsbar-track-inner">
                {tabs.map((tab) => (
                  <SortableTab key={tab.id} tab={tab} active={tab.id === activeTabId} onSelectTab={onSelectTab} onCloseTab={onCloseTab} onContextMenu={onContextMenu} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <button className="tabsbar-new" onClick={onNewTab} title="Nouvel onglet">
          <PlusIcon size={14} />
        </button>

        {canScrollRight && (
          <button
            className="tabsbar-scroll"
            onClick={() => trackRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
            title="Défiler droite"
          >
            <ChevronRightIcon size={14} />
          </button>
        )}
      </div>

      <div className="titlebar-actions">
        <button className="window-button" onClick={() => window.mangaAPI.minimizeWindow()} aria-label="Minimiser">
          <MinimizeIcon size={16} />
        </button>
        <button className="window-button" onClick={() => window.mangaAPI.toggleMaximizeWindow()} aria-label="Agrandir">
          <MaximizeIcon size={14} />
        </button>
        <button className="window-button window-button-close" onClick={() => window.mangaAPI.closeWindow()} aria-label="Fermer">
          <CloseIcon size={14} />
        </button>
      </div>
    </header>
  );
}

export default memo(TitleBar);
