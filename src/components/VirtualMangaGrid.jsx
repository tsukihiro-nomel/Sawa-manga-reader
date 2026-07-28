import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import MangaCard from './MangaCard.jsx';
import { chunkMangas, resolveVirtualGridMetrics } from './VirtualMangaGrid.js';
import {
  getScrollOffset,
  makeAnchoredScrollPosition,
  normalizeScrollPosition,
  resolveAnchoredScrollOffset
} from '../utils/scrollPositions.js';

function VirtualMangaGrid({
  mangas = [],
  className = '',
  cardSize = 'comfortable',
  header = null,
  headerEstimateSize = 360,
  initialScrollTop = 0,
  initialScrollPosition = null,
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
  const restoringRef = useRef(true);
  const restoredRef = useRef('');
  const virtualizerRef = useRef(null);
  const [columns, setColumns] = useState(4);
  const [columnsMeasured, setColumnsMeasured] = useState(false);
  const { minCard, rowHeight, performanceMode, overscan } = resolveVirtualGridMetrics(cardSize, mangas.length);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const update = () => {
      setColumns(Math.max(1, Math.floor(Math.max(0, node.clientWidth - 48) / minCard)));
      setColumnsMeasured(true);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [minCard]);

  const rows = useMemo(() => chunkMangas(mangas, columns), [mangas, columns]);
  const selectionOrder = useMemo(() => mangas.map((manga) => manga.id), [mangas]);
  const headerOffset = header ? 1 : 0;
  const initialPosition = normalizeScrollPosition(initialScrollPosition ?? initialScrollTop);
  const virtualizer = useVirtualizer({
    count: rows.length + headerOffset,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => (headerOffset && index === 0 ? headerEstimateSize : rowHeight),
    getItemKey: (index) => {
      if (headerOffset && index === 0) return 'virtual-grid-header';
      const row = rows[index - headerOffset];
      return row?.map((manga) => manga.id || manga.contentId).join('|') || `row-${index}`;
    },
    initialOffset: () => getScrollOffset(initialPosition),
    overscan
  });
  virtualizerRef.current = virtualizer;
  const restoreToken = `${scrollKey || 'grid'}:${columns}:${initialPosition.anchorId || 'offset'}:${cardSize}:${headerOffset}`;

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || !columnsMeasured || restoredRef.current === restoreToken) return undefined;
    restoredRef.current = restoreToken;
    restoringRef.current = true;
    const frame = requestAnimationFrame(() => {
      const headerSize = headerOffset
        ? (virtualizerRef.current?.getMeasurements?.()[0]?.size || headerEstimateSize)
        : 0;
      const target = resolveAnchoredScrollOffset({
        position: initialPosition,
        mangas,
        columns,
        rowHeight,
        contentOffset: headerSize
      });
      virtualizerRef.current?.scrollToOffset(target, { align: 'start' });
      node.scrollTop = Math.min(target, Math.max(0, node.scrollHeight - node.clientHeight));
      requestAnimationFrame(() => {
        restoringRef.current = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [columnsMeasured, restoreToken]);

  const handleScroll = useCallback(() => {
    if (restoringRef.current) return;
    const node = containerRef.current;
    if (!node) return;
    const headerSize = headerOffset
      ? (virtualizerRef.current?.getMeasurements?.()[0]?.size || headerEstimateSize)
      : 0;
    onScrollPositionChange?.(makeAnchoredScrollPosition({
      mangas,
      columns,
      rowHeight,
      scrollTop: node.scrollTop,
      contentOffset: headerSize,
      layoutKey: `${cardSize}:${columns}:${rowHeight}:${headerOffset}`
    }));
  }, [cardSize, columns, headerEstimateSize, headerOffset, mangas, onScrollPositionChange, rowHeight]);

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
                selectionOrder={selectionOrder}
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
