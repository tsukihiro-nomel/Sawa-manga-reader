import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { renderPdfPageToCanvas } from '../utils/pdf.js';

const DEFAULT_ROOT_MARGIN = '400px';

function PdfCanvasAsset({
  filePath,
  pageNumber = 1,
  alt = '',
  className = '',
  style,
  maxWidth = 1200,
  maxHeight = 1600,
  lazy = true,
  rootMargin = DEFAULT_ROOT_MARGIN,
  ...rest
}) {
  const canvasRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(!lazy);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!lazy) {
      setShouldRender(true);
      return undefined;
    }

    const element = canvasRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy, rootMargin, filePath, pageNumber]);

  useEffect(() => {
    if (!shouldRender || !canvasRef.current || !filePath) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    setHasError(false);

    renderPdfPageToCanvas({
      canvas: canvasRef.current,
      filePath,
      pageNumber,
      maxWidth,
      maxHeight,
      signal: controller.signal
    }).catch((error) => {
      const isAbort = error?.name === 'AbortError' || error?.name === 'RenderingCancelledException';
      if (isAbort || cancelled) return;
      console.error('[Sawa PDF] render failed', { filePath, pageNumber, error });
      setHasError(true);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [shouldRender, filePath, pageNumber, maxWidth, maxHeight]);

  if (hasError) {
    return <div className={`pdf-canvas-fallback ${className}`.trim()} style={style}>{alt?.[0] || 'PDF'}</div>;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`pdf-canvas-asset ${className}`.trim()}
      style={style}
      aria-label={alt}
      title={alt}
      data-pdf-page-number={pageNumber}
      {...rest}
    />
  );
}

function MediaAsset({
  src,
  alt = '',
  className = '',
  style,
  loading = 'lazy',
  draggable = false,
  mediaType = 'image',
  filePath = null,
  pageNumber = 1,
  maxWidth = 1200,
  maxHeight = 1600,
  lazy = true,
  rootMargin = DEFAULT_ROOT_MARGIN,
  ...rest
}) {
  const resolvedMediaType = useMemo(() => {
    if (mediaType) return mediaType;
    return filePath?.toLowerCase?.().endsWith('.pdf') ? 'pdf' : 'image';
  }, [mediaType, filePath]);

  if (resolvedMediaType === 'pdf' && filePath) {
    return (
      <PdfCanvasAsset
        filePath={filePath}
        pageNumber={pageNumber}
        alt={alt}
        className={className}
        style={style}
        maxWidth={maxWidth}
        maxHeight={maxHeight}
        lazy={lazy}
        rootMargin={rootMargin}
        {...rest}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      draggable={draggable}
      className={className}
      style={style}
      {...rest}
    />
  );
}

export default memo(MediaAsset);
