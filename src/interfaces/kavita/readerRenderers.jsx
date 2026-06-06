import { memo, useCallback, useEffect, useRef } from 'react';
import MediaAsset from '../../components/MediaAsset.jsx';
import { measureVisibleWebtoonPage } from './webtoonMeasurement.js';

function PageAsset({ page, index, className = '', style }) {
  if (!page) return <div className={`kv-reader-missing-page ${className}`}>Page indisponible</div>;
  return (
    <MediaAsset
      src={page.src}
      alt={`Page ${index + 1}`}
      className={className}
      style={style}
      mediaType={page.sourceType || 'image'}
      filePath={page.path}
      pageNumber={page.pdfPageNumber || index + 1}
      maxWidth={2000}
      maxHeight={2600}
      lazy={false}
    />
  );
}

export const SinglePageRenderer = memo(function SinglePageRenderer({ pages, pageIndex, fitMode, imageStyle }) {
  return <div className={`kv-reader-single is-${fitMode}`}><PageAsset page={pages[pageIndex]} index={pageIndex} className="kv-reader-page" style={imageStyle} /></div>;
});

export const DoublePageRenderer = memo(function DoublePageRenderer({ pages, pageIndex, fitMode, rtl = false, pageOffset = false, emulateBook = false, imageStyle }) {
  const offset = pageOffset ? 1 : 0;
  const firstIndex = Math.max(0, pageIndex + offset);
  const secondIndex = firstIndex + 1;
  const entries = [
    { page: pages[firstIndex], index: firstIndex },
    { page: pages[secondIndex], index: secondIndex }
  ].filter((entry) => entry.page);
  if (rtl) entries.reverse();

  return (
    <div className={`kv-reader-double is-${fitMode} ${rtl ? 'is-rtl' : ''} ${emulateBook ? 'is-book' : ''}`}>
      {entries.map((entry) => <PageAsset key={entry.page.id || entry.index} page={entry.page} index={entry.index} className="kv-reader-page" style={imageStyle} />)}
    </div>
  );
});

export const SplitPageRenderer = memo(function SplitPageRenderer({ pages, pageIndex, fitMode, direction = 'left', imageStyle }) {
  const page = pages[pageIndex];
  const orderedHalves = direction === 'right' ? ['right', 'left'] : ['left', 'right'];
  return (
    <div className={`kv-reader-split is-${fitMode}`}>
      {orderedHalves.map((half) => (
        <div key={half} className={`kv-reader-split-half is-${half}`}>
          <PageAsset page={page} index={pageIndex} className="kv-reader-page" style={imageStyle} />
        </div>
      ))}
    </div>
  );
});

export const WebtoonRenderer = memo(function WebtoonRenderer({ pages, fitMode, imageStyle, onVisiblePageChange, rootRef: externalRootRef }) {
  const frameRef = useRef(null);
  const internalRootRef = useRef(null);
  const rootRef = externalRootRef || internalRootRef;
  const onScroll = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const visiblePage = measureVisibleWebtoonPage(rootRef.current);
      if (visiblePage !== null) onVisiblePageChange?.(visiblePage);
    });
  }, [onVisiblePageChange]);

  useEffect(() => () => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  return (
    <div ref={rootRef} className={`kv-reader-webtoon is-${fitMode}`} onScroll={onScroll}>
      {pages.map((page, index) => (
        <div key={page.id || index} data-kv-page-index={index}>
          <PageAsset page={page} index={index} className="kv-reader-page" style={imageStyle} />
        </div>
      ))}
    </div>
  );
});

export const ReaderRenderer = memo(function ReaderRenderer({
  pages,
  pageIndex,
  mode,
  fitMode,
  zoom,
  brightness,
  widthOverride,
  splitDirection,
  pageOffset,
  emulateBook,
  onVisiblePageChange,
  webtoonRootRef
}) {
  const normalizedZoom = Number.isFinite(Number(zoom)) ? Math.max(0.5, Number(zoom)) : 1;
  const imageStyle = {
    '--kv-reader-brightness': `${brightness}%`,
    '--kv-reader-max-width': `calc(${100 * normalizedZoom}vw - ${48 * normalizedZoom}px)`,
    '--kv-reader-max-height': `calc(${100 * normalizedZoom}vh - ${48 * normalizedZoom}px)`,
    '--kv-reader-double-max-width': `calc(${50 * normalizedZoom}vw - ${25 * normalizedZoom}px)`,
    '--kv-reader-webtoon-width': `min(calc(${100 * normalizedZoom}vw - ${32 * normalizedZoom}px), ${1000 * normalizedZoom}px)`,
    ...(widthOverride > 0 ? { '--kv-reader-width': `${widthOverride}%` } : {})
  };
  const shared = { pages, pageIndex, imageStyle };
  if (mode === 'webtoon') {
    return (
      <WebtoonRenderer
        pages={pages}
        fitMode={fitMode}
        imageStyle={imageStyle}
        onVisiblePageChange={onVisiblePageChange}
        rootRef={webtoonRootRef}
      />
    );
  }
  if (mode === 'double-ltr') return <DoublePageRenderer {...shared} fitMode={fitMode} pageOffset={pageOffset} emulateBook={emulateBook} />;
  if (mode === 'double-rtl') return <DoublePageRenderer {...shared} fitMode={fitMode} rtl pageOffset={pageOffset} emulateBook={emulateBook} />;
  if (mode === 'split' || splitDirection !== 'none') return <SplitPageRenderer {...shared} fitMode={fitMode} direction={splitDirection === 'none' ? 'left' : splitDirection} />;
  return <SinglePageRenderer {...shared} fitMode={fitMode} />;
});
