import React, { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { invalidatePdfDocument, renderPdfPageToCanvas } from '../utils/pdf.js';
import {
  normalizeMeasuredPreviewDimensions,
  normalizePreviewQuality,
  resolvePreviewRequest
} from '../utils/previewQuality.js';

const DEFAULT_ROOT_MARGIN = '400px';
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function buildOptimizedImageSrc(src, options = {}) {
  if (!src || !options.thumbnail || !/^manga:\/\/(local|cbz)\//i.test(String(src))) return src;
  const hasPreviewProfile = options.previewQuality != null;
  const request = hasPreviewProfile
    ? resolvePreviewRequest({
        width: options.maxWidth,
        height: options.maxHeight,
        quality: options.previewQuality,
        devicePixelRatio: options.devicePixelRatio
      })
    : {
        width: Math.max(32, Math.min(1024, Math.floor(Number(options.maxWidth) || 360))),
        height: Math.max(32, Math.min(1024, Math.floor(Number(options.maxHeight) || 540)))
      };
  const separator = String(src).includes('?') ? '&' : '?';
  const quality = hasPreviewProfile ? `&q=${encodeURIComponent(normalizePreviewQuality(options.previewQuality))}` : '';
  return `${src}${separator}thumbnail=1&w=${request.width}&h=${request.height}${quality}`;
}

export function buildRetriedMediaSrc(src, attempt) {
  if (!attempt) return src;
  const separator = String(src).includes('?') ? '&' : '?';
  return `${src}${separator}sawaRetry=${attempt}`;
}

export function retryFailedPdfAsset(filePath, setFailure, setAttempt) {
  invalidatePdfDocument(filePath);
  setFailure(null);
  setAttempt((value) => value + 1);
}

export function createMediaAssetIdentity({ src = '', filePath = '', pageNumber = 1 } = {}) {
  return JSON.stringify([String(src || ''), String(filePath || ''), Number(pageNumber) || 1]);
}

export function createMediaFailureState(identity = '') {
  return {
    identity,
    failure: null,
    attempt: 0,
    showDetails: false
  };
}

export function mediaFailureReducer(state, action = {}) {
  switch (action.type) {
    case 'identity':
      return action.identity === state.identity ? state : createMediaFailureState(action.identity);
    case 'failed':
      return { ...state, failure: action.error || new Error('Media unavailable') };
    case 'retry':
      return { ...state, failure: null, attempt: state.attempt + 1 };
    case 'toggle-details':
      return { ...state, showDetails: !state.showDetails };
    case 'succeeded':
      return state.failure ? { ...state, failure: null } : state;
    default:
      return state;
  }
}

function useMeasuredPreviewDimensions({
  elementRef,
  enabled,
  fallbackWidth,
  fallbackHeight,
  identity
}) {
  const [dimensions, setDimensions] = useState(null);

  useIsomorphicLayoutEffect(() => {
    setDimensions(null);
    if (!enabled) {
      return undefined;
    }
    const element = elementRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      setDimensions(normalizeMeasuredPreviewDimensions(0, 0, {
        width: fallbackWidth,
        height: fallbackHeight
      }));
      return undefined;
    }

    let timer = null;
    let fallbackTimer = null;
    const commit = (width, height) => {
      const next = normalizeMeasuredPreviewDimensions(width, height, {
        width: fallbackWidth,
        height: fallbackHeight
      });
      setDimensions((current) => (
        current?.width === next.width && current?.height === next.height && current?.measured === next.measured
          ? current
          : next
      ));
    };
    const rect = element.getBoundingClientRect?.();
    if (rect?.width >= 16 && rect?.height >= 16) {
      commit(rect.width, rect.height);
    } else {
      fallbackTimer = window.setTimeout(() => commit(0, 0), 120);
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        commit(entry.contentRect.width, entry.contentRect.height);
      }, 80);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [elementRef, enabled, fallbackHeight, fallbackWidth, identity]);

  return dimensions;
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
  previewQuality = 'balanced',
  rootMargin = DEFAULT_ROOT_MARGIN,
  assetIdentity,
  ...rest
}) {
  const canvasRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(!lazy);
  const [failureState, dispatchFailure] = useReducer(
    mediaFailureReducer,
    assetIdentity,
    createMediaFailureState
  );
  const { failure, attempt, showDetails } = failureState;
  const autoMeasurementEnabled = normalizePreviewQuality(previewQuality) === 'balanced';
  const measuredDimensions = useMeasuredPreviewDimensions({
    elementRef: canvasRef,
    enabled: autoMeasurementEnabled,
    fallbackWidth: maxWidth,
    fallbackHeight: maxHeight,
    identity: assetIdentity
  });
  const measurementReady = !autoMeasurementEnabled
    || measuredDimensions
    || typeof ResizeObserver === 'undefined';
  const previewRequest = useMemo(() => resolvePreviewRequest({
    width: measuredDimensions?.width || maxWidth,
    height: measuredDimensions?.height || maxHeight,
    quality: previewQuality,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1
  }), [maxHeight, maxWidth, measuredDimensions?.height, measuredDimensions?.width, previewQuality]);

  useEffect(() => {
    dispatchFailure({ type: 'identity', identity: assetIdentity });
  }, [assetIdentity]);

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
    if (!shouldRender || !measurementReady || !canvasRef.current || !filePath) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    dispatchFailure({ type: 'succeeded' });

    renderPdfPageToCanvas({
      canvas: canvasRef.current,
      filePath,
      pageNumber,
      maxWidth: measuredDimensions?.width || maxWidth,
      maxHeight: measuredDimensions?.height || maxHeight,
      pixelRatio: previewRequest.pixelRatio,
      signal: controller.signal
    }).catch((error) => {
      const isAbort = error?.name === 'AbortError' || error?.name === 'RenderingCancelledException';
      if (isAbort || cancelled) return;
      console.error('[Sawa PDF] render failed', { filePath, pageNumber, error });
      invalidatePdfDocument(filePath);
      dispatchFailure({ type: 'failed', error: error || new Error('Echec de rendu PDF.') });
      window.mangaAPI?.reportMediaFailure?.({
        kind: 'pdf',
        filePath,
        pageNumber,
        code: error?.name || 'render-failed'
      }).catch(() => {});
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    shouldRender,
    measurementReady,
    filePath,
    pageNumber,
    measuredDimensions?.width,
    measuredDimensions?.height,
    maxWidth,
    maxHeight,
    previewRequest.pixelRatio,
    attempt
  ]);

  if (failure) {
    return (
      <div className={`pdf-canvas-fallback media-asset-error ${className}`.trim()} style={style} role="alert">
        <strong>Page PDF indisponible</strong>
        <span>Page {pageNumber}</span>
        <div className="media-asset-error-actions">
          <button type="button" onClick={() => {
            invalidatePdfDocument(filePath);
            dispatchFailure({ type: 'retry' });
          }}>Reessayer</button>
          <button type="button" onClick={() => window.mangaAPI?.openMediaSource?.(filePath)}>Ouvrir</button>
          <button type="button" onClick={() => dispatchFailure({ type: 'toggle-details' })}>Details</button>
        </div>
        {showDetails ? <small>{failure?.name || 'Erreur PDF'}: {String(failure?.message || 'Rendu impossible').slice(0, 240)}</small> : null}
      </div>
    );
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

function ImageAsset({
  src,
  filePath,
  alt,
  className,
  style,
  loading,
  draggable,
  onLoad,
  thumbnail,
  maxWidth,
  maxHeight,
  previewQuality,
  assetIdentity,
  ...rest
}) {
  const imageRef = useRef(null);
  const [failureState, dispatchFailure] = useReducer(
    mediaFailureReducer,
    assetIdentity,
    createMediaFailureState
  );
  const { failure, attempt, showDetails } = failureState;
  const normalizedQuality = normalizePreviewQuality(previewQuality);
  const autoMeasurementEnabled = Boolean(thumbnail && previewQuality != null && normalizedQuality === 'balanced');
  const measuredDimensions = useMeasuredPreviewDimensions({
    elementRef: imageRef,
    enabled: autoMeasurementEnabled,
    fallbackWidth: maxWidth,
    fallbackHeight: maxHeight,
    identity: assetIdentity
  });
  const measurementReady = !autoMeasurementEnabled
    || measuredDimensions
    || typeof ResizeObserver === 'undefined';
  const optimizedSrc = useMemo(() => (
    measurementReady
      ? buildOptimizedImageSrc(src, {
          thumbnail,
          maxWidth: measuredDimensions?.width || maxWidth,
          maxHeight: measuredDimensions?.height || maxHeight,
          previewQuality,
          devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1
        })
      : ''
  ), [
    src,
    thumbnail,
    maxWidth,
    maxHeight,
    previewQuality,
    measurementReady,
    measuredDimensions?.width,
    measuredDimensions?.height
  ]);
  const retrySrc = useMemo(() => buildRetriedMediaSrc(optimizedSrc, attempt), [optimizedSrc, attempt]);
  useEffect(() => {
    dispatchFailure({ type: 'identity', identity: assetIdentity });
  }, [assetIdentity]);

  if (failure) {
    return (
      <div className={`media-asset-error ${className}`.trim()} style={style} role="alert">
        <strong>Image indisponible</strong>
        <div className="media-asset-error-actions">
          <button type="button" onClick={() => dispatchFailure({ type: 'retry' })}>Reessayer</button>
          <button type="button" disabled={!filePath} onClick={() => window.mangaAPI?.openMediaSource?.(filePath)}>Ouvrir</button>
          <button type="button" onClick={() => dispatchFailure({ type: 'toggle-details' })}>Details</button>
        </div>
        {showDetails ? <small>{String(failure?.message || 'Chargement impossible').slice(0, 240)}</small> : null}
      </div>
    );
  }
  return (
    <img
      ref={imageRef}
      src={retrySrc || undefined}
      alt={alt}
      loading={loading}
      draggable={draggable}
      className={className}
      style={style}
      {...rest}
      onError={(event) => {
        if (!retrySrc) return;
        const error = new Error(`Echec de chargement: ${event.currentTarget.currentSrc || 'image'}`);
        dispatchFailure({ type: 'failed', error });
        if (filePath) {
          window.mangaAPI?.reportMediaFailure?.({
            kind: 'image',
            filePath,
            code: 'load-failed'
          }).catch(() => {});
        }
      }}
      onLoad={(event) => {
        dispatchFailure({ type: 'succeeded' });
        onLoad?.(event);
      }}
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
  previewQuality = null,
  rootMargin = DEFAULT_ROOT_MARGIN,
  ...rest
}) {
  const resolvedMediaType = useMemo(() => {
    if (mediaType) return mediaType;
    return filePath?.toLowerCase?.().endsWith('.pdf') ? 'pdf' : 'image';
  }, [mediaType, filePath]);
  const assetIdentity = useMemo(
    () => createMediaAssetIdentity({ src, filePath, pageNumber }),
    [src, filePath, pageNumber]
  );
  if (resolvedMediaType === 'pdf' && filePath) {
    return (
      <PdfCanvasAsset
        key={assetIdentity}
        assetIdentity={assetIdentity}
        filePath={filePath}
        pageNumber={pageNumber}
        alt={alt}
        className={className}
        style={style}
        maxWidth={maxWidth}
        maxHeight={maxHeight}
        lazy={lazy}
        previewQuality={previewQuality || 'balanced'}
        rootMargin={rootMargin}
        {...rest}
      />
    );
  }

  return (
    <ImageAsset
      key={assetIdentity}
      assetIdentity={assetIdentity}
      src={src}
      filePath={filePath}
      alt={alt}
      loading={loading}
      draggable={draggable}
      className={className}
      style={style}
      thumbnail={thumbnail}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      previewQuality={previewQuality}
      {...rest}
    />
  );
}

export default memo(MediaAsset);
