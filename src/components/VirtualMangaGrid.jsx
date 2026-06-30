import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import MangaCard from './MangaCard.jsx';
import { chunkMangas, resolveVirtualGridMetrics } from './VirtualMangaGrid.js';

function VirtualMangaGrid({
  mangas = [],
  className = '',
  cardSize = 'comfortable',
  header = null,
  headerEstimateSize = 360,
  initialScrollTop = 0,
  scrollKey = '',
  onScrollPositionChange,
  onOpen,
  onOpenBackground,
  onToggleFavorite,
  onContextMenu,
  selectionMode = false,
  selectedIds = new Set(),
  onToggleSelect,
  privateBlur = false
}) {
  const containerRef = useRef(null);
  const restoringRef = useRef(false);
  const [columns, setColumns] = useState(4);
  const { minCard, rowHeight, performanceMode, overscan } = resolveVirtualGridMetrics(cardSize, mangas.length);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const update = () => setColumns(Math.max(1, Math.floor(Math.max(0, node.clientWidth - 48) / minCard)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [minCard]);

  const rows = useMemo(() => chunkMangas(mangas, columns), [mangas, columns]);
  const headerOffset = header ? 1 : 0;
  const virtualizer = useVirtualizer({
    count: rows.length + headerOffset,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => (headerOffset && index === 0 ? headerEstimateSize : rowHeight),
    overscan
  });

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    restoringRef.current = true;
    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToOffset(Math.max(0, Number(initialScrollTop) || 0), { align: 'start' });
      restoringRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [initialScrollTop, scrollKey, virtualizer]);

  const handleScroll = useCallback(() => {
    if (restoringRef.current) return;
    onScrollPositionChange?.(containerRef.current?.scrollTop || 0);
  }, [onScrollPositionChange]);

  return (
    <div ref={containerRef} className={`virtual-manga-grid-scroll ${className}`.trim()} onScroll={handleScroll}>
      <div className="virtual-manga-grid-canvas" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          if (headerOffset && virtualRow.index === 0) {
            return (
              <div
                key="virtual-grid-header"
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className="virtual-manga-grid-header"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {header}
              </div>
            );
          }

          const rowIndex = virtualRow.index - headerOffset;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              className="manga-grid-row virtual-manga-grid-row"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${rowHeight}px`,
                transform: `translateY(${virtualRow.start}px)`,
                '--grid-columns': columns
              }}
            >
            {rows[rowIndex]?.map((manga) => (
              <MangaCard
                key={manga.id}
                manga={manga}
                onOpen={onOpen}
                onOpenBackground={onOpenBackground}
                onToggleFavorite={onToggleFavorite}
                onContextMenu={onContextMenu}
                selectionMode={selectionMode}
                selected={selectedIds.has(manga.id)}
                onToggleSelect={onToggleSelect}
                privateBlur={privateBlur}
                performanceMode={performanceMode}
              />
            ))}
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(VirtualMangaGrid);
