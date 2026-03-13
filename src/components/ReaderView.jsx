import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildDoubleSpreadRanges } from '../utils/reader.js';
import CurvedScrollArea from './CurvedScrollArea.jsx';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FullscreenIcon,
  LayoutGridIcon,
  ScrollIcon,
  ZoomInIcon,
  ZoomOutIcon,
  SparklesIcon,
  BookIcon
} from './Icons.jsx';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const CONTINUOUS_SCROLL_THRESHOLD = 48;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function normalizeShortcutValue(value, fallback) {
  const raw = String(value || fallback || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized.startsWith('key') && normalized.length === 4) return normalized.slice(3);
  if (normalized.startsWith('digit') && normalized.length === 6) return normalized.slice(5);
  if (normalized === 'space' || normalized === 'spacebar') return ' ';
  if (normalized === 'numpadadd') return '+';
  if (normalized === 'numpadsubtract') return '-';
  return normalized;
}

function buildSinglePageStyle(fitMode, zoom) {
  if (fitMode === 'fit-height') {
    return { maxHeight: `calc((100dvh - 230px) * ${zoom})`, width: 'auto', maxWidth: 'none' };
  }
  if (fitMode === 'original') {
    return { width: 'auto', maxWidth: 'none', zoom };
  }
  return { width: `${Math.round(100 * zoom)}%`, maxWidth: 'none' };
}

function buildWebtoonStripStyle(fitMode, zoom) {
  const base = { zoom, width: '100%', display: 'grid', justifyItems: 'center', alignContent: 'start' };
  if (fitMode === 'fit-height') {
    return { ...base, width: 'max-content', minWidth: '100%' };
  }
  if (fitMode === 'original') {
    return { ...base, width: 'max-content', minWidth: '100%' };
  }
  return base;
}

function buildWebtoonPageStyle(fitMode) {
  if (fitMode === 'fit-height') {
    return { width: 'auto', maxWidth: 'none', maxHeight: 'calc(100dvh - 230px)' };
  }
  if (fitMode === 'original') {
    return { width: 'auto', maxWidth: 'none' };
  }
  return { width: 'min(100%, 1120px)', maxWidth: '100%' };
}

function buildDoubleFrameStyle(fitMode, zoom, pageCount) {
  const base = {
    zoom,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 0,
    width: pageCount <= 1 ? 'max-content' : 'min(100%, 1480px)',
    maxWidth: '100%',
    marginInline: 'auto'
  };

  if (fitMode === 'original') return { ...base, width: 'max-content' };
  return base;
}

function buildDoubleImageStyle(fitMode, pageCount) {
  if (pageCount <= 1) {
    if (fitMode === 'fit-height') {
      return { width: 'auto', maxWidth: 'min(100%, 1200px)', maxHeight: 'calc(100dvh - 230px)' };
    }
    return { width: 'auto', maxWidth: 'min(100%, 1200px)' };
  }

  if (fitMode === 'fit-height') {
    return { width: 'auto', maxWidth: '50%', maxHeight: 'calc(100dvh - 230px)' };
  }

  return { width: '50%', maxWidth: '50%' };
}

function getSpreadPageIndexes(currentSpread, doublePageReading = 'manga') {
  if (!currentSpread) return [];
  const indexes = [currentSpread.start, currentSpread.end]
    .filter((index, position, source) => Number.isInteger(index) && source.indexOf(index) === position);
  if (indexes.length <= 1 || indexes[0] === 0) return indexes;
  return doublePageReading === 'manga' ? [...indexes].reverse() : indexes;
}

function getNavigationDirection(mode, direction, doublePageReading) {
  if (mode === 'double') return doublePageReading === 'manga' ? 'rtl' : 'ltr';
  return direction;
}

function ReaderView({
  manga,
  chapter,
  chapters = [],
  initialPageIndex,
  initialScrollAnchor = 'top',
  preferredMode,
  preferredFit = 'fit-width',
  preferredDirection = 'rtl',
  preferredZoom = 1,
  preferredDoublePageReading = 'manga',
  autoContinue = false,
  shortcuts = {},
  onExit,
  onOpenChapter,
  onUpdateProgress,
  onContextMenu
}) {
  const [mode, setMode] = useState(preferredMode || 'single');
  const [fitMode, setFitMode] = useState(preferredFit || 'fit-width');
  const [direction, setDirection] = useState(preferredDirection || 'rtl');
  const [doublePageReading, setDoublePageReading] = useState(preferredDoublePageReading || 'manga');
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex || 0);
  const [zoom, setZoom] = useState(clampZoom(Number(preferredZoom || 1)));
  const [uiHidden, setUiHidden] = useState(false);
  const [showEndCard, setShowEndCard] = useState(false);
  const [chapterTransitionLabel, setChapterTransitionLabel] = useState('');
  const webtoonContainerRef = useRef(null);
  const singleContainerRef = useRef(null);
  const doubleContainerRef = useRef(null);
  const transitionLockRef = useRef(false);
  const shellRef = useRef(null);


  const safePages = Array.isArray(chapter.pages) ? chapter.pages : [];
  const spreads = useMemo(() => buildDoubleSpreadRanges(safePages.length), [safePages.length]);
  const chapterIndex = useMemo(() => chapters.findIndex((item) => item.id === chapter.id), [chapters, chapter.id]);
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;

  const currentSpreadIndex = useMemo(() => {
    if (currentPageIndex === 0) return 0;
    const normalizedStart = currentPageIndex % 2 === 0 ? currentPageIndex - 1 : currentPageIndex;
    return Math.max(0, spreads.findIndex((range) => range.start === normalizedStart));
  }, [currentPageIndex, spreads]);

  const currentSpread = spreads[currentSpreadIndex] || { start: 0, end: 0 };
  const doublePageIndexes = useMemo(
    () => getSpreadPageIndexes(currentSpread, doublePageReading),
    [currentSpread, doublePageReading]
  );
  const navigationDirection = useMemo(
    () => getNavigationDirection(mode, direction, doublePageReading),
    [mode, direction, doublePageReading]
  );

  useEffect(() => {
    setMode(preferredMode || 'single');
    setFitMode(preferredFit || 'fit-width');
    setDirection(preferredDirection || 'rtl');
    setDoublePageReading(preferredDoublePageReading || 'manga');
  }, [preferredMode, preferredFit, preferredDirection, preferredDoublePageReading, chapter.id]);

  useEffect(() => {
    setCurrentPageIndex(initialPageIndex || 0);
  }, [chapter.id, initialPageIndex]);

  useEffect(() => {
    setZoom(clampZoom(Number(preferredZoom || 1)));
    setUiHidden(false);
    setShowEndCard(false);
    setChapterTransitionLabel('');
    transitionLockRef.current = false;
  }, [chapter.id, preferredZoom]);

  useLayoutEffect(() => {
    const scrollTarget = mode === 'webtoon'
      ? webtoonContainerRef.current
      : mode === 'double'
        ? doubleContainerRef.current
        : singleContainerRef.current;

    if (!scrollTarget) return;

    const safeIndex = Math.max(0, Math.min(initialPageIndex || 0, Math.max(0, safePages.length - 1)));
    if (mode === 'webtoon') {
      window.requestAnimationFrame(() => {
        if (initialScrollAnchor === 'bottom') {
          scrollTarget.scrollTop = scrollTarget.scrollHeight;
          return;
        }
        const target = scrollTarget.querySelector(`[data-page-index="${safeIndex}"]`);
        if (target) {
          target.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
        } else {
          scrollTarget.scrollTop = 0;
        }
      });
      return;
    }

    scrollTarget.scrollTop = 0;
    scrollTarget.scrollLeft = 0;
  }, [chapter.id, mode, initialPageIndex, initialScrollAnchor, safePages.length]);

  useEffect(() => {
    if (!chapterTransitionLabel) return undefined;
    const timer = window.setTimeout(() => setChapterTransitionLabel(''), 1400);
    return () => window.clearTimeout(timer);
  }, [chapterTransitionLabel]);

  function next() {
    if (!safePages.length) return;
    if (mode === 'double') {
      const nextSpread = spreads[Math.min(currentSpreadIndex + 1, spreads.length - 1)];
      if (!nextSpread) return;
      const isSameSpread = nextSpread.start === currentSpread.start && nextSpread.end === currentSpread.end;
      if (isSameSpread) {
        setShowEndCard(true);
        if (autoContinue && nextChapter) {
          onOpenChapter?.(nextChapter.id, { pageIndex: 0, scrollAnchor: 'top', reason: 'continuous-next' });
        }
        return;
      }
      setCurrentPageIndex(nextSpread.start);
      return;
    }

    setCurrentPageIndex((value) => {
      const nextIndex = Math.min(value + 1, safePages.length - 1);
      if (nextIndex >= safePages.length - 1) setShowEndCard(true);
      if (value === safePages.length - 1 && nextChapter && autoContinue) {
        onOpenChapter?.(nextChapter.id, { pageIndex: 0, scrollAnchor: 'top', reason: 'continuous-next' });
      }
      return nextIndex;
    });
  }

  function previous() {
    if (mode === 'double') {
      const prevSpread = spreads[Math.max(currentSpreadIndex - 1, 0)];
      if (!prevSpread) return;
      setCurrentPageIndex(prevSpread.start);
      return;
    }
    setCurrentPageIndex((value) => Math.max(value - 1, 0));
  }

  const increaseZoom = () => setZoom((value) => clampZoom(value + ZOOM_STEP));
  const decreaseZoom = () => setZoom((value) => clampZoom(value - ZOOM_STEP));
  const resetZoom = () => setZoom(clampZoom(Number(preferredZoom || 1)));
  const toggleUiHidden = () => setUiHidden((value) => !value);

  useEffect(() => {
    const nextKey = normalizeShortcutValue(shortcuts?.readerNext, 'ArrowRight');
    const prevKey = normalizeShortcutValue(shortcuts?.readerPrevious, 'ArrowLeft');
    const fullScreenKey = normalizeShortcutValue(shortcuts?.fullScreen, 'f');
    const toggleUiKey = normalizeShortcutValue(shortcuts?.toggleUi, 'h');
    const zoomInKey = normalizeShortcutValue(shortcuts?.zoomIn, '+');
    const zoomOutKey = normalizeShortcutValue(shortcuts?.zoomOut, '-');
    const resetZoomKey = normalizeShortcutValue(shortcuts?.resetZoom, '0');

    const listener = (event) => {
      const key = normalizeShortcutValue(event.key || event.code || '', '');
      const code = normalizeShortcutValue(event.code || '', '');
      const keyMatches = (...candidates) => candidates.filter(Boolean).some((candidate) => {
        const normalized = normalizeShortcutValue(candidate, '');
        return normalized && (normalized === key || normalized === code);
      });
      const isModifierChapterNav = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (mode !== 'webtoon') {
        if (!isModifierChapterNav && keyMatches(nextKey)) navigationDirection === 'rtl' ? previous() : next();
        if (!isModifierChapterNav && keyMatches(prevKey)) navigationDirection === 'rtl' ? next() : previous();
      }
      if (isModifierChapterNav && keyMatches(nextKey) && nextChapter) {
        event.preventDefault();
        onOpenChapter?.(nextChapter.id, { pageIndex: Number(nextChapter.progress?.pageIndex || 0), scrollAnchor: 'top' });
      }
      if (isModifierChapterNav && keyMatches(prevKey) && previousChapter) {
        event.preventDefault();
        onOpenChapter?.(previousChapter.id, { pageIndex: Number(previousChapter.progress?.pageIndex || 0), scrollAnchor: 'top' });
      }
      if (keyMatches(fullScreenKey)) window.mangaAPI.toggleFullScreen();
      if (event.key === 'Escape') onExit();
      if (keyMatches(zoomInKey) || key === '=') {
        event.preventDefault();
        increaseZoom();
      }
      if (keyMatches(zoomOutKey)) {
        event.preventDefault();
        decreaseZoom();
      }
      if (keyMatches(resetZoomKey)) {
        event.preventDefault();
        resetZoom();
      }
      if (keyMatches(toggleUiKey)) {
        event.preventDefault();
        toggleUiHidden();
      }
    };
    window.addEventListener('keydown', listener, true);
    return () => {
      window.removeEventListener('keydown', listener, true);
    };
  }, [mode, chapter.id, nextChapter, onExit, onOpenChapter, previousChapter, navigationDirection, shortcuts, preferredZoom]);

  useEffect(() => {
    if (!safePages.length) return undefined;
    const timeout = window.setTimeout(() => {
      const payload = {
        mangaId: manga.id,
        chapterId: chapter.id,
        pageIndex: currentPageIndex,
        pageCount: chapter.pageCount,
        mode,
        zoom,
        fit: fitMode,
        direction,
        doublePageReading
      };
      onUpdateProgress(payload);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [manga.id, chapter.id, currentPageIndex, chapter.pageCount, mode, safePages.length, onUpdateProgress, zoom, fitMode, direction, doublePageReading]);

  useEffect(() => {
    if (mode !== 'webtoon' || !safePages.length) return undefined;
    const container = webtoonContainerRef.current;
    if (!container) return undefined;

    const handleScroll = () => {
      const images = [...container.querySelectorAll('[data-page-index]')];
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      images.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - 132);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = Number(element.dataset.pageIndex || 0);
        }
      });
      setCurrentPageIndex(bestIndex);
      if (bestIndex >= safePages.length - 1) setShowEndCard(true);
    };

    const handleWheel = (event) => {
      if (!autoContinue || transitionLockRef.current) return;
      const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - CONTINUOUS_SCROLL_THRESHOLD;
      const nearTop = container.scrollTop <= CONTINUOUS_SCROLL_THRESHOLD;

      if (event.deltaY > 0 && nearBottom && nextChapter) {
        transitionLockRef.current = true;
        setChapterTransitionLabel(`Chapitre suivant · ${nextChapter.name}`);
        onOpenChapter?.(nextChapter.id, { pageIndex: 0, scrollAnchor: 'top', reason: 'continuous-next' });
      }

      if (event.deltaY < 0 && nearTop && previousChapter) {
        transitionLockRef.current = true;
        setChapterTransitionLabel(`Chapitre précédent · ${previousChapter.name}`);
        onOpenChapter?.(previousChapter.id, {
          pageIndex: Math.max(0, Number(previousChapter.pageCount || 1) - 1),
          scrollAnchor: 'bottom',
          reason: 'continuous-previous'
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: true });
    handleScroll();
    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
    };
  }, [mode, chapter.id, zoom, safePages.length, autoContinue, nextChapter, previousChapter, onOpenChapter]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;

    function handleToggleClick(event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('button, select, option, input, textarea, a, [role="button"], label')) return;
      if (target.closest('.reader-toolbar, .reader-bottom-bar, .reader-end-card, .reader-transition-pill, .reader-chapter-nav')) return;
      setUiHidden((v) => !v);
    }

    shell.addEventListener('click', handleToggleClick, true);
    return () => shell.removeEventListener('click', handleToggleClick, true);
  }, []);

  const zoomPercent = `${Math.round(zoom * 100)}%`;
  const singleImageStyle = buildSinglePageStyle(fitMode, zoom);
  const webtoonStripStyle = buildWebtoonStripStyle(fitMode, zoom);
  const webtoonPageStyle = buildWebtoonPageStyle(fitMode);
  const doubleFrameStyle = buildDoubleFrameStyle(fitMode, zoom, doublePageIndexes.length);
  const doubleImageStyle = buildDoubleImageStyle(fitMode, doublePageIndexes.length);
  const currentPageLabel = mode === 'double'
    ? `${currentSpread.start + 1}${currentSpread.end !== currentSpread.start ? `-${currentSpread.end + 1}` : ''}`
    : `${currentPageIndex + 1}`;

  if (!safePages.length) {
    return (
      <section className="reader-shell">
        <div className="empty-card">
          <h3>Chargement du chapitre…</h3>
          <p>Les pages sont chargées à la demande pour garder le lecteur rapide.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={shellRef}
      className={`reader-shell ${uiHidden ? 'reader-shell-ui-hidden' : ''} ${navigationDirection === 'rtl' ? 'reader-shell-rtl' : 'reader-shell-ltr'}`}
      onContextMenu={(event) => onContextMenu(event, { type: 'reader', manga, chapter })}
    >
      <div className="reader-toolbar">
        <div className="reader-toolbar-left">
          <button className="ghost-button" onClick={onExit}><ChevronLeftIcon size={16} /> Quitter</button>
          <div className="reader-title-block">
            <strong>{manga.displayTitle}</strong>
            <span>{chapter.name}</span>
          </div>
        </div>

        <div className="reader-chapter-nav" title="Navigation entre chapitres">
          <button className="reader-chapter-nav-button" onClick={() => previousChapter && onOpenChapter?.(previousChapter.id, { pageIndex: Number(previousChapter.progress?.pageIndex || 0), scrollAnchor: 'top' })} disabled={!previousChapter}>
            <ChevronLeftIcon size={18} />
          </button>
          <div className="reader-chapter-select-shell" title="Changer de chapitre">
            <div className="reader-chapter-select-box">
              <select className="reader-chapter-select" value={chapter.id} onChange={(event) => onOpenChapter?.(event.target.value, { scrollAnchor: 'top' })}>
                {chapters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <ChevronDownIcon size={16} className="reader-chapter-select-icon" />
            </div>
          </div>
          <button className="reader-chapter-nav-button" onClick={() => nextChapter && onOpenChapter?.(nextChapter.id, { pageIndex: Number(nextChapter.progress?.pageIndex || 0), scrollAnchor: 'top' })} disabled={!nextChapter}>
            <ChevronRightIcon size={18} />
          </button>
        </div>

        <div className="reader-toolbar-right">
          <div className="reader-mode-switch">
            <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}><LayoutGridIcon size={16} /> 1 page</button>
            <button className={mode === 'double' ? 'active' : ''} onClick={() => setMode('double')}><LayoutGridIcon size={16} /> 2 pages</button>
            <button className={mode === 'webtoon' ? 'active' : ''} onClick={() => setMode('webtoon')}><ScrollIcon size={16} /> Webtoon</button>
          </div>
          {mode === 'double' ? (
            <div className="reader-mode-switch">
              <button className={doublePageReading === 'manga' ? 'active' : ''} onClick={() => setDoublePageReading('manga')}><BookIcon size={16} /> Manga JP</button>
              <button className={doublePageReading === 'standard' ? 'active' : ''} onClick={() => setDoublePageReading('standard')}><LayoutGridIcon size={16} /> Standard</button>
            </div>
          ) : null}
          <div className="reader-mode-switch">
            <button className={fitMode === 'fit-width' ? 'active' : ''} onClick={() => setFitMode('fit-width')}>Fit width</button>
            <button className={fitMode === 'fit-height' ? 'active' : ''} onClick={() => setFitMode('fit-height')}>Fit height</button>
            <button className={fitMode === 'original' ? 'active' : ''} onClick={() => setFitMode('original')}>Original</button>
          </div>
          <div className="reader-zoom-box">
            <button className="icon-pill" onClick={decreaseZoom} disabled={zoom <= MIN_ZOOM}><ZoomOutIcon size={16} /></button>
            <button className="reader-zoom-value" onClick={resetZoom}>{zoomPercent}</button>
            <button className="icon-pill" onClick={increaseZoom} disabled={zoom >= MAX_ZOOM}><ZoomInIcon size={16} /></button>
          </div>
          <button className="icon-pill" onClick={() => window.mangaAPI.toggleFullScreen()} title="Plein écran"><FullscreenIcon size={16} /></button>
        </div>
      </div>

      <div className="reader-stage">
        {mode === 'webtoon' ? (
          <CurvedScrollArea className="reader-webtoon" shellClassName="reader-stage-scroll-shell" ref={webtoonContainerRef}>
            <div className="reader-webtoon-strip" style={webtoonStripStyle}>
              {safePages.map((page, index) => (
                <img
                  key={page.id}
                  src={page.src}
                  alt={`Page ${index + 1}`}
                  data-page-index={index}
                  style={webtoonPageStyle}
                  className="reader-webtoon-page-image"
                  loading={index < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                />
              ))}
            </div>
          </CurvedScrollArea>
        ) : mode === 'double' ? (
          <CurvedScrollArea className={`reader-page-shell reader-page-shell-double ${doublePageIndexes.length === 1 ? 'reader-page-shell-double-single' : ''}`} shellClassName="reader-stage-scroll-shell" ref={doubleContainerRef}>
            <div className="reader-double-spread-frame" style={doubleFrameStyle}>
              {doublePageIndexes.map((pageIndex) => {
                const page = safePages[pageIndex];
                if (!page) return null;
                return (
                  <img
                    key={`${page.id}-${pageIndex}`}
                    src={page.src}
                    alt={`Page ${pageIndex + 1}`}
                    style={doubleImageStyle}
                    className="reader-page-image reader-page-image-double"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                  />
                );
              })}
            </div>
          </CurvedScrollArea>
        ) : (
          <CurvedScrollArea className="reader-page-shell" shellClassName="reader-stage-scroll-shell" ref={singleContainerRef}>
            <img src={safePages[currentPageIndex]?.src} alt={`Page ${currentPageIndex + 1}`} style={singleImageStyle} className="reader-page-image" loading="eager" decoding="async" draggable={false} />
          </CurvedScrollArea>
        )}

        {chapterTransitionLabel ? (
          <div className="reader-transition-pill">
            <BookIcon size={16} />
            <span>{chapterTransitionLabel}</span>
          </div>
        ) : null}

        {showEndCard && (
          <div className="reader-end-card">
            <div className="reader-end-card-copy">
              <SparklesIcon size={18} />
              <div>
                <strong>Fin du chapitre</strong>
                <span>{nextChapter ? 'Le chapitre suivant est prêt.' : 'Tu es arrivé au bout de cette série.'}</span>
              </div>
            </div>
            <div className="detail-actions-row">
              {nextChapter ? <button className="primary-button" onClick={() => onOpenChapter?.(nextChapter.id, { pageIndex: 0, scrollAnchor: 'top' })}>Chapitre suivant</button> : null}
              <button className="ghost-button" onClick={onExit}>Retour au manga</button>
            </div>
          </div>
        )}
      </div>

      {mode !== 'webtoon' && (
        <div className="reader-bottom-bar">
          <button className="reader-nav-button" onClick={navigationDirection === 'rtl' ? next : previous} disabled={currentPageIndex === 0 && mode !== 'double'}>
            <ChevronLeftIcon size={18} />
          </button>
          <div className="reader-page-indicator">
            Page {currentPageLabel} / {safePages.length}
          </div>
          <button className="reader-nav-button" onClick={navigationDirection === 'rtl' ? previous : next}>
            <ChevronRightIcon size={18} />
          </button>
        </div>
      )}
    </section>
  );
}

export default memo(ReaderView);
