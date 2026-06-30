import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { renderPdfPageToCanvas } from '../utils/pdf.js';

const DEFAULT_ROOT_MARGIN = '400px';

export function buildOptimizedImageSrc(src, options = {}) {
  if (!src || !options.thumbnail || !/^manga:\/\/(local|cbz)\//i.test(String(src))) return src;
  const width = Math.max(32, Math.min(1024, Math.floor(Number(options.maxWidth) || 360)));
  const height = Math.max(32, Math.min(1024, Math.floor(Number(options.maxHeight) || 540)));
  const separator = String(src).includes('?') ? '&' : '?';
  return `${src}${separator}thumbnail=1&w=${width}&h=${height}`;
}

function PdfCanvasAsset({
  filePath,
  pageNumber = 1,
  alt = '',
  className = '',
  style,
  maxWidth = 1200,
  maxHeight = 1600,
  lazy = true,
  thumbnail = false,
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
  thumbnail = false,
  rootMargin = DEFAULT_ROOT_MARGIN,
  ...rest
}) {
  const resolvedMediaType = useMemo(() => {
    if (mediaType) return mediaType;
    return filePath?.toLowerCase?.().endsWith('.pdf') ? 'pdf' : 'image';
  }, [mediaType, filePath]);
  const optimizedSrc = useMemo(() => buildOptimizedImageSrc(src, {
    thumbnail,
    maxWidth,
    maxHeight
  }), [src, thumbnail, maxWidth, maxHeight]);

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
      src={optimizedSrc}
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
