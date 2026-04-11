import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDoubleSpreadRanges, buildMangaJPSpreadRanges } from '../utils/reader.js';
import MediaAsset from './MediaAsset.jsx';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FullscreenIcon,
  LayoutGridIcon,
  ScrollIcon,
  ZoomInIcon,
  ZoomOutIcon
} from './Icons.jsx';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;
const AUTO_HIDE_DELAY = 3000;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function ReaderView({
  manga,
  chapter,
  chapters = [],
  annotations = [],
  focusToken,
  initialPageIndex,
  initialReaderState,
  preferredMode,
  preferredFitMode,
  preferredZoom = 1,
  autoHideUI = false,
  onExit,
  onOpenChapter,
  onUpdateProgress,
  onAddAnnotation,
  onDeleteAnnotation,
  onContextMenu
}) {
  const [mode, setMode] = useState(preferredMode || initialReaderState?.mode || 'single');
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex || 0);
  const [zoom, setZoom] = useState(clampZoom(preferredZoom || initialReaderState?.zoom || 1));
  const [uiHidden, setUiHidden] = useState(false);
  const [fitMode, setFitMode] = useState(preferredFitMode || initialReaderState?.fitMode || 'fit-width');
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [webtoonScrollState, setWebtoonScrollState] = useState({
    top: Number(initialReaderState?.scrollTop || 0),
    ratio: Number(initialReaderState?.scrollRatio || 0)
  });
  const shellRef = useRef(null);
  const webtoonContainerRef = useRef(null);
  const hasRestoredWebtoonScrollRef = useRef(false);
  const autoHideTimerRef = useRef(null);
  const manualUiHiddenRef = useRef(false);
  const preloadedPagesRef = useRef(null);
  const preloadedChapterIdRef = useRef(null);

  const safePages = Array.isArray(chapter.pages) ? chapter.pages : [];
  const spreads = useMemo(() => buildDoubleSpreadRanges(safePages.length), [safePages.length]);
  const mangaJPSpreads = useMemo(() => buildMangaJPSpreadRanges(safePages.length), [safePages.length]);
  const chapterIndex = useMemo(() => chapters.findIndex((item) => item.id === chapter.id), [chapters, chapter.id]);
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;

  const currentSpreadIndex = useMemo(() => {
    if (currentPageIndex === 0) return 0;
    const normalizedStart = currentPageIndex % 2 === 0 ? currentPageIndex - 1 : currentPageIndex;
    return spreads.findIndex((range) => range.start === normalizedStart);
  }, [currentPageIndex, spreads]);

  const currentMangaJPSpreadIndex = useMemo(() => {
    if (currentPageIndex === 0) return 0;
    const normalizedStart = currentPageIndex % 2 === 0 ? currentPageIndex - 1 : currentPageIndex;
    return mangaJPSpreads.findIndex((range) => range.start === normalizedStart);
  }, [currentPageIndex, mangaJPSpreads]);

  const chaptersReadCount = useMemo(() => {
    return chapters.filter((ch) => ch.isRead).length;
  }, [chapters]);

  const chapterAnnotations = useMemo(
    () => annotations
      .filter((annotation) => annotation.chapterId === chapter.id)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [annotations, chapter.id]
  );


  const openNextChapter = useCallback(() => {
    if (nextChapter) onOpenChapter?.(nextChapter.id);
  }, [nextChapter, onOpenChapter]);

  const openPreviousChapter = useCallback(() => {
    if (previousChapter) onOpenChapter?.(previousChapter.id);
  }, [previousChapter, onOpenChapter]);

  const focusReaderSurface = useCallback(() => {
    const target = mode === 'webtoon' ? webtoonContainerRef.current : shellRef.current;
    if (!target || typeof target.focus !== 'function') return;
    window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
    });
  }, [mode]);

  useEffect(() => {
    setMode(preferredMode || 'single');
  }, [preferredMode, chapter.id]);

  useEffect(() => {
    setCurrentPageIndex(initialPageIndex || 0);
  }, [chapter.id, initialPageIndex]);

  useEffect(() => {
    setZoom(clampZoom(preferredZoom || 1));
    setFitMode(preferredFitMode || 'fit-width');
    setUiHidden(manualUiHiddenRef.current);
    setNoteDraft('');
    setWebtoonScrollState({
      top: Number(initialReaderState?.scrollTop || 0),
      ratio: Number(initialReaderState?.scrollRatio || 0)
    });
    hasRestoredWebtoonScrollRef.current = false;
  }, [chapter.id, initialReaderState?.scrollTop, initialReaderState?.scrollRatio, preferredFitMode, preferredZoom]);

  useEffect(() => {
    focusReaderSurface();
  }, [focusReaderSurface, focusToken, chapter.id]);

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  // Auto-hide UI after 3 seconds of mouse inactivity (only when enabled)
  const resetAutoHideTimer = useCallback(() => {
    clearAutoHideTimer();
    if (manualUiHiddenRef.current) {
      return;
    }
    setUiHidden(false);
    if (autoHideUI) {
      autoHideTimerRef.current = setTimeout(() => {
        if (!manualUiHiddenRef.current) {
          setUiHidden(true);
        }
      }, AUTO_HIDE_DELAY);
    }
  }, [autoHideUI, clearAutoHideTimer]);

  useEffect(() => {
    if (!autoHideUI) {
      clearAutoHideTimer();
      if (!manualUiHiddenRef.current) {
        setUiHidden(false);
      }
      return;
    }

    resetAutoHideTimer();
    const handleMouseMove = () => {
      if (manualUiHiddenRef.current) return;
      resetAutoHideTimer();
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearAutoHideTimer();
    };
  }, [resetAutoHideTimer, clearAutoHideTimer, autoHideUI]);

  // Chapter preloading: preload next chapter pages when within last 3 pages
  useEffect(() => {
    if (!nextChapter || !safePages.length) return;
    const pagesRemaining = safePages.length - 1 - currentPageIndex;
    if (pagesRemaining <= 3 && preloadedChapterIdRef.current !== nextChapter.id) {
      preloadedChapterIdRef.current = nextChapter.id;
      window.mangaAPI.getChapterPages(nextChapter.path).then((pages) => {
        preloadedPagesRef.current = pages;
      }).catch(() => {
        // Silently fail preloading
        preloadedPagesRef.current = null;
      });
    }
  }, [currentPageIndex, safePages.length, nextChapter]);

  // Reset preloaded pages when chapter changes
  useEffect(() => {
    preloadedPagesRef.current = null;
    preloadedChapterIdRef.current = null;
  }, [chapter.id]);

  useEffect(() => {
    if (mode !== 'webtoon' || !safePages.length) return undefined;
    const container = webtoonContainerRef.current;
    if (!container || hasRestoredWebtoonScrollRef.current) return undefined;

    const applyScroll = () => {
      const maxScrollable = Math.max(0, container.scrollHeight - container.clientHeight);
      const ratio = Math.max(0, Math.min(1, Number(webtoonScrollState?.ratio || 0)));
      const targetTop = maxScrollable > 0
        ? Math.round(maxScrollable * ratio)
        : Math.max(0, Number(webtoonScrollState?.top || 0));
      container.scrollTo({ top: targetTop, behavior: 'auto' });
      hasRestoredWebtoonScrollRef.current = true;
    };

    const raf1 = window.requestAnimationFrame(() => applyScroll());
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(() => applyScroll()));
    const timer = window.setTimeout(() => applyScroll(), 120);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [mode, chapter.id, safePages.length, webtoonScrollState]);

  const increaseZoom = () => setZoom((value) => clampZoom(value + ZOOM_STEP));
  const decreaseZoom = () => setZoom((value) => clampZoom(value - ZOOM_STEP));
  const resetZoom = () => setZoom(1);

  const scrollWebtoonByViewport = useCallback((direction) => {
    const container = webtoonContainerRef.current;
    if (!container) return;
    const isAtTop = container.scrollTop <= 1;
    const maxScrollable = Math.max(0, container.scrollHeight - container.clientHeight);
    const isAtBottom = container.scrollTop >= (maxScrollable - 1);
    if (direction > 0 && isAtBottom) {
      openNextChapter();
      return;
    }
    if (direction < 0 && isAtTop) {
      openPreviousChapter();
      return;
    }
    const step = Math.max(120, Math.round(container.clientHeight * 0.9));
    const nextTop = Math.max(0, Math.min(maxScrollable, container.scrollTop + (step * direction)));
    container.scrollTo({ top: nextTop, behavior: 'smooth' });
  }, [openNextChapter, openPreviousChapter]);

  const scrollPagedModesByViewport = useCallback((direction) => {
    const container = shellRef.current?.querySelector('.reader-page-wrap, .reader-double-wrap');
    if (!container) return false;
    const maxScrollable = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScrollable <= 0) return false;
    const step = Math.max(120, Math.round(container.clientHeight * 0.9));
    const nextTop = Math.max(0, Math.min(maxScrollable, container.scrollTop + (step * direction)));
    if (Math.abs(nextTop - container.scrollTop) < 1) return false;
    container.scrollTo({ top: nextTop, behavior: 'smooth' });
    return true;
  }, []);

  const goToNextPageOrChapter = useCallback(() => {
    if (!safePages.length) return;
    const atEnd = currentPageIndex >= safePages.length - 1;
    if (mode === 'manga-jp') {
      if (currentMangaJPSpreadIndex >= mangaJPSpreads.length - 1) {
        openNextChapter();
        return;
      }
      next();
      return;
    }
    if (mode === 'double') {
      if (currentSpreadIndex >= spreads.length - 1) {
        openNextChapter();
        return;
      }
      next();
      return;
    }
    if (mode === 'webtoon') {
      if (atEnd) openNextChapter();
      return;
    }
    if (atEnd) {
      openNextChapter();
      return;
    }
    next();
  }, [safePages.length, currentPageIndex, mode, currentMangaJPSpreadIndex, mangaJPSpreads.length, currentSpreadIndex, spreads.length, openNextChapter]);

  const goToPreviousPageOrChapter = useCallback(() => {
    if (!safePages.length) return;
    const atStart = currentPageIndex <= 0;
    if (mode === 'manga-jp') {
      if (currentMangaJPSpreadIndex <= 0) {
        openPreviousChapter();
        return;
      }
      previous();
      return;
    }
    if (mode === 'double') {
      if (currentSpreadIndex <= 0) {
        openPreviousChapter();
        return;
      }
      previous();
      return;
    }
    if (mode === 'webtoon') {
      if (atStart) openPreviousChapter();
      return;
    }
    if (atStart) {
      openPreviousChapter();
      return;
    }
    previous();
  }, [safePages.length, currentPageIndex, mode, currentMangaJPSpreadIndex, currentSpreadIndex, openPreviousChapter]);

  const toggleUiHidden = useCallback(() => {
    manualUiHiddenRef.current = !manualUiHiddenRef.current;
    if (manualUiHiddenRef.current) {
      clearAutoHideTimer();
      setUiHidden(true);
      return;
    }
    setUiHidden(false);
    resetAutoHideTimer();
  }, [clearAutoHideTimer, resetAutoHideTimer]);

  const handleSaveAnnotation = useCallback(async () => {
    if (!onAddAnnotation) return;
    await onAddAnnotation({
      mangaId: manga.id,
      chapterId: chapter.id,
      pageIndex: currentPageIndex,
      label: `Repere page ${currentPageIndex + 1}`,
      note: noteDraft.trim()
    });
    setNoteDraft('');
    setNotesOpen(true);
  }, [onAddAnnotation, manga.id, chapter.id, currentPageIndex, noteDraft]);

  useEffect(() => {
    const listener = (event) => {
      const target = event.target;
      const isEditableTarget = target instanceof HTMLElement && (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      );
      const key = event.key;
      const lowerKey = typeof key === 'string' ? key.toLowerCase() : '';
      const isChapterModifier = (event.ctrlKey || event.metaKey || event.altKey) && !event.shiftKey;

      if (isEditableTarget && !isChapterModifier && !['Escape', 'F', 'f', 'H', 'h'].includes(key)) {
        return;
      }

      if (isChapterModifier && key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        openNextChapter();
        return;
      }

      if (isChapterModifier && key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        openPreviousChapter();
        return;
      }

      if (mode === 'webtoon') {
        if (key === 'ArrowDown' || key === 'PageDown') {
          event.preventDefault();
          scrollWebtoonByViewport(1);
          return;
        }
        if (key === 'ArrowUp' || key === 'PageUp') {
          event.preventDefault();
          scrollWebtoonByViewport(-1);
          return;
        }
      } else {
        if (key === 'PageDown') {
          event.preventDefault();
          const didScroll = scrollPagedModesByViewport(1);
          if (!didScroll) goToNextPageOrChapter();
          return;
        }
        if (key === 'PageUp') {
          event.preventDefault();
          const didScroll = scrollPagedModesByViewport(-1);
          if (!didScroll) goToPreviousPageOrChapter();
          return;
        }
      }

      if (mode !== 'webtoon') {
        if (mode === 'manga-jp') {
          if (key === 'ArrowLeft') {
            event.preventDefault();
            goToNextPageOrChapter();
            return;
          }
          if (key === 'ArrowRight') {
            event.preventDefault();
            goToPreviousPageOrChapter();
            return;
          }
        } else {
          if (key === 'ArrowRight') {
            event.preventDefault();
            goToNextPageOrChapter();
            return;
          }
          if (key === 'ArrowLeft') {
            event.preventDefault();
            goToPreviousPageOrChapter();
            return;
          }
        }
      }

      if (lowerKey === 'f') {
        event.preventDefault();
        window.mangaAPI.toggleFullScreen();
        return;
      }
      if (key === 'Escape') {
        event.preventDefault();
        onExit();
        return;
      }
      if (key === '+' || key === '=') {
        event.preventDefault();
        increaseZoom();
        return;
      }
      if (key === '-') {
        event.preventDefault();
        decreaseZoom();
        return;
      }
      if (key === '0') {
        event.preventDefault();
        resetZoom();
        return;
      }
      if (lowerKey === 'h') {
        event.preventDefault();
        toggleUiHidden();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [mode, onExit, openNextChapter, openPreviousChapter, goToNextPageOrChapter, goToPreviousPageOrChapter, scrollPagedModesByViewport, scrollWebtoonByViewport, toggleUiHidden]);

  useEffect(() => {
    if (!safePages.length) return undefined;
    const timeout = window.setTimeout(() => {
      const payload = {
        mangaId: manga.id,
        chapterId: chapter.id,
        pageIndex: currentPageIndex,
        pageCount: chapter.pageCount,
        mode,
        fitMode,
        zoom,
        scrollTop: mode === 'webtoon' ? webtoonScrollState.top : 0,
        scrollRatio: mode === 'webtoon' ? webtoonScrollState.ratio : 0
      };
      onUpdateProgress(payload);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [manga.id, chapter.id, currentPageIndex, chapter.pageCount, mode, fitMode, zoom, webtoonScrollState, safePages.length, onUpdateProgress]);

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
        const distance = Math.abs(rect.top - 120);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = Number(element.dataset.pageIndex || 0);
        }
      });
      const maxScrollable = Math.max(0, container.scrollHeight - container.clientHeight);
      const currentTop = container.scrollTop || 0;
      setCurrentPageIndex(bestIndex);
      setWebtoonScrollState({
        top: currentTop,
        ratio: maxScrollable > 0 ? currentTop / maxScrollable : 0
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [mode, chapter.id, zoom, safePages.length]);

  function next() {
    if (!safePages.length) return;
    if (mode === 'double') {
      const nextSpread = spreads[Math.min(currentSpreadIndex + 1, spreads.length - 1)];
      if (nextSpread) setCurrentPageIndex(nextSpread.start);
      return;
    }
    if (mode === 'manga-jp') {
      const nextSpread = mangaJPSpreads[Math.min(currentMangaJPSpreadIndex + 1, mangaJPSpreads.length - 1)];
      if (nextSpread) setCurrentPageIndex(nextSpread.start);
      return;
    }
    setCurrentPageIndex((value) => Math.min(value + 1, safePages.length - 1));
  }

  function previous() {
    if (mode === 'double') {
      const prevSpread = spreads[Math.max(currentSpreadIndex - 1, 0)];
      if (prevSpread) setCurrentPageIndex(prevSpread.start);
      return;
    }
    if (mode === 'manga-jp') {
      const prevSpread = mangaJPSpreads[Math.max(currentMangaJPSpreadIndex - 1, 0)];
      if (prevSpread) setCurrentPageIndex(prevSpread.start);
      return;
    }
    setCurrentPageIndex((value) => Math.max(value - 1, 0));
  }

  function handleStageToggle(event) {
    if (event.target === event.currentTarget) {
      toggleUiHidden();
      focusReaderSurface();
    }
  }

  function getSinglePageStyle() {
    switch (fitMode) {
      case 'fit-height':
        return { height: '100%', maxHeight: 'calc(100vh - 200px)' };
      case 'original':
        return { transform: `scale(${zoom})`, transformOrigin: 'center top' };
      case 'fit-width':
      default:
        return { width: `${Math.max(55, zoom * 100)}%`, maxWidth: `${980 * zoom}px` };
    }
  }

  const currentSpread = spreads[currentSpreadIndex] || { start: 0, end: 0 };
  const currentMangaJPSpread = mangaJPSpreads[currentMangaJPSpreadIndex] || { start: 0, end: 0, isRTL: false };
  const zoomPercent = `${Math.round(zoom * 100)}%`;

  const isAtEndOfChapter = currentPageIndex >= safePages.length - 1;
  const showEndPanel = isAtEndOfChapter && nextChapter;

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
      tabIndex={-1}
      className={`reader-shell ${uiHidden ? 'reader-shell-ui-hidden' : ''}`}
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
          <button
            className="reader-chapter-nav-button"
            onClick={openPreviousChapter}
            disabled={!previousChapter}
            title={previousChapter ? `Chapitre précédent : ${previousChapter.name}` : 'Aucun chapitre précédent'}
          >
            <ChevronLeftIcon size={18} />
          </button>

          <label className="reader-chapter-select-shell">
            <span className="reader-chapter-select-label">Chapitre</span>
            <div className="reader-chapter-select-box">
              <select
                className="reader-chapter-select"
                value={chapter.id}
                onChange={(event) => onOpenChapter?.(event.target.value)}
              >
                {chapters.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <ChevronDownIcon size={16} className="reader-chapter-select-icon" />
            </div>
          </label>

          <button
            className="reader-chapter-nav-button"
            onClick={openNextChapter}
            disabled={!nextChapter}
            title={nextChapter ? `Chapitre suivant : ${nextChapter.name}` : 'Aucun chapitre suivant'}
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>

        <div className="reader-toolbar-right">
          <div className="reader-mode-switch">
            <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')} title="1 page">
              <LayoutGridIcon size={16} /> 1 page
            </button>
            <button className={mode === 'double' ? 'active' : ''} onClick={() => setMode('double')} title="2 pages (gauche → droite)">
              <LayoutGridIcon size={16} /> 2p LTR
            </button>
            <button className={mode === 'manga-jp' ? 'active' : ''} onClick={() => setMode('manga-jp')} title="2 pages japonais (droite → gauche)">
              <LayoutGridIcon size={16} /> 2p JP
            </button>
            <button className={mode === 'webtoon' ? 'active' : ''} onClick={() => setMode('webtoon')} title="Scroll vertical">
              <ScrollIcon size={16} /> Webtoon
            </button>
          </div>
          {mode === 'single' && (
            <div className="reader-fit-switch">
              <button className={fitMode === 'fit-width' ? 'active' : ''} onClick={() => setFitMode('fit-width')} title="Ajuster à la largeur">
                Largeur
              </button>
              <button className={fitMode === 'fit-height' ? 'active' : ''} onClick={() => setFitMode('fit-height')} title="Ajuster à la hauteur">
                Hauteur
              </button>
              <button className={fitMode === 'original' ? 'active' : ''} onClick={() => setFitMode('original')} title="Taille originale">
                Original
              </button>
            </div>
          )}
          <div className="reader-zoom-box" title="Zoom lecture">
            <button className="icon-pill" onClick={decreaseZoom} disabled={zoom <= MIN_ZOOM} title="Zoom -">
              <ZoomOutIcon size={16} />
            </button>
            <button className="reader-zoom-value" onClick={resetZoom} title="Réinitialiser le zoom à 100%">
              {zoomPercent}
            </button>
            <button className="icon-pill" onClick={increaseZoom} disabled={zoom >= MAX_ZOOM} title="Zoom +">
              <ZoomInIcon size={16} />
            </button>
          </div>
          <button className="icon-pill" onClick={() => window.mangaAPI.toggleFullScreen()} title="Plein ecran">
            <FullscreenIcon size={16} />
          </button>
          <button className="ghost-button reader-toolbar-note-button" onClick={handleSaveAnnotation} title="Enregistrer un repere a la page actuelle">
            Repere
          </button>
          <button className={`ghost-button reader-toolbar-note-button ${notesOpen ? 'active' : ''}`} onClick={() => setNotesOpen((value) => !value)} title="Ouvrir les notes du chapitre">
            {chapterAnnotations.length > 0 ? `Notes (${chapterAnnotations.length})` : 'Notes'}
          </button>
        </div>
      </div>

      {mode === 'single' && (
        <div className="reader-stage" onClick={handleStageToggle}>
          <button className="reader-nav reader-nav-left" onClick={(event) => { event.stopPropagation(); previous(); }} disabled={currentPageIndex <= 0}><ChevronLeftIcon size={20} /></button>
          <div className="reader-page-wrap" onClick={handleStageToggle}>
            <MediaAsset
              key={`single-${chapter.id}-${safePages[currentPageIndex]?.id || currentPageIndex}-${mode}-${fitMode}`}
              className="reader-page thumb-media"
              src={safePages[currentPageIndex]?.src}
              alt={`Page ${currentPageIndex + 1}`}
              style={getSinglePageStyle()}
              mediaType={safePages[currentPageIndex]?.sourceType || 'image'}
              filePath={safePages[currentPageIndex]?.path}
              pageNumber={safePages[currentPageIndex]?.pdfPageNumber || currentPageIndex + 1}
              maxWidth={1400}
              maxHeight={1800}
              lazy={false}
            />
          </div>
          <button className="reader-nav reader-nav-right" onClick={(event) => { event.stopPropagation(); next(); }} disabled={currentPageIndex >= safePages.length - 1}><ChevronRightIcon size={20} /></button>
        </div>
      )}

      {mode === 'double' && (
        <div className="reader-stage reader-stage-double" onClick={handleStageToggle}>
          <button className="reader-nav reader-nav-left" onClick={(event) => { event.stopPropagation(); previous(); }} disabled={currentSpreadIndex <= 0}><ChevronLeftIcon size={20} /></button>
          <div className="reader-double-wrap" onClick={handleStageToggle}>
            <MediaAsset
              key={`double-left-${chapter.id}-${currentSpread.start}-${mode}`}
              className="reader-page reader-page-double thumb-media"
              src={safePages[currentSpread.start]?.src}
              alt={`Page ${currentSpread.start + 1}`}
              style={{ maxWidth: `${480 * zoom}px` }}
              mediaType={safePages[currentSpread.start]?.sourceType || 'image'}
              filePath={safePages[currentSpread.start]?.path}
              pageNumber={safePages[currentSpread.start]?.pdfPageNumber || currentSpread.start + 1}
              maxWidth={900}
              maxHeight={1400}
              lazy={false}
            />
            {currentSpread.end !== currentSpread.start && (
              <MediaAsset
                key={`double-right-${chapter.id}-${currentSpread.end}-${mode}`}
                className="reader-page reader-page-double thumb-media"
                src={safePages[currentSpread.end]?.src}
                alt={`Page ${currentSpread.end + 1}`}
                style={{ maxWidth: `${480 * zoom}px` }}
                mediaType={safePages[currentSpread.end]?.sourceType || 'image'}
                filePath={safePages[currentSpread.end]?.path}
                pageNumber={safePages[currentSpread.end]?.pdfPageNumber || currentSpread.end + 1}
                maxWidth={900}
                maxHeight={1400}
                lazy={false}
              />
            )}
          </div>
          <button className="reader-nav reader-nav-right" onClick={(event) => { event.stopPropagation(); next(); }} disabled={currentSpreadIndex >= spreads.length - 1}><ChevronRightIcon size={20} /></button>
        </div>
      )}

      {mode === 'manga-jp' && (
        <div className="reader-stage reader-stage-double reader-stage-manga-jp" onClick={handleStageToggle}>
          <button className="reader-nav reader-nav-left" onClick={(event) => { event.stopPropagation(); next(); }} disabled={currentMangaJPSpreadIndex >= mangaJPSpreads.length - 1}><ChevronLeftIcon size={20} /></button>
          <div className="reader-double-wrap reader-double-wrap-rtl" onClick={handleStageToggle}>
            {currentMangaJPSpread.isRTL && currentMangaJPSpread.end !== currentMangaJPSpread.start ? (
              <>
                <MediaAsset
                  key={`jp-left-${chapter.id}-${currentMangaJPSpread.start}-${mode}`}
                  className="reader-page reader-page-double thumb-media"
                  src={safePages[currentMangaJPSpread.start]?.src}
                  alt={`Page ${currentMangaJPSpread.start + 1}`}
                  style={{ maxWidth: `${480 * zoom}px` }}
                  mediaType={safePages[currentMangaJPSpread.start]?.sourceType || 'image'}
                  filePath={safePages[currentMangaJPSpread.start]?.path}
                  pageNumber={safePages[currentMangaJPSpread.start]?.pdfPageNumber || currentMangaJPSpread.start + 1}
                  maxWidth={900}
                  maxHeight={1400}
                  lazy={false}
                />
                <MediaAsset
                  key={`jp-right-${chapter.id}-${currentMangaJPSpread.end}-${mode}`}
                  className="reader-page reader-page-double thumb-media"
                  src={safePages[currentMangaJPSpread.end]?.src}
                  alt={`Page ${currentMangaJPSpread.end + 1}`}
                  style={{ maxWidth: `${480 * zoom}px` }}
                  mediaType={safePages[currentMangaJPSpread.end]?.sourceType || 'image'}
                  filePath={safePages[currentMangaJPSpread.end]?.path}
                  pageNumber={safePages[currentMangaJPSpread.end]?.pdfPageNumber || currentMangaJPSpread.end + 1}
                  maxWidth={900}
                  maxHeight={1400}
                  lazy={false}
                />
              </>
            ) : (
              <MediaAsset
                key={`jp-single-${chapter.id}-${currentMangaJPSpread.start}-${mode}`}
                className="reader-page reader-page-double thumb-media"
                src={safePages[currentMangaJPSpread.start]?.src}
                alt={`Page ${currentMangaJPSpread.start + 1}`}
                style={{ maxWidth: `${480 * zoom}px` }}
                mediaType={safePages[currentMangaJPSpread.start]?.sourceType || 'image'}
                filePath={safePages[currentMangaJPSpread.start]?.path}
                pageNumber={safePages[currentMangaJPSpread.start]?.pdfPageNumber || currentMangaJPSpread.start + 1}
                maxWidth={900}
                maxHeight={1400}
                lazy={false}
              />
            )}
          </div>
          <button className="reader-nav reader-nav-right" onClick={(event) => { event.stopPropagation(); previous(); }} disabled={currentMangaJPSpreadIndex <= 0}><ChevronRightIcon size={20} /></button>
        </div>
      )}

      {mode === 'webtoon' && (
        <div className="webtoon-stage" ref={webtoonContainerRef} tabIndex={-1} onClick={handleStageToggle}>
          {safePages.map((page) => (
            <MediaAsset
              key={page.id}
              data-page-index={page.index}
              className="webtoon-page thumb-media"
              src={page.src}
              alt={`Page ${page.index + 1}`}
              loading="lazy"
              style={{ maxWidth: `${960 * zoom}px` }}
              mediaType={page.sourceType || 'image'}
              filePath={page.path}
              pageNumber={page.pdfPageNumber || page.index + 1}
              maxWidth={1400}
              maxHeight={2000}
              lazy
            />
          ))}
        </div>
      )}

      {showEndPanel && (
        <div className="reader-end-panel">
          <h2>Chapitre termine !</h2>
          <p>{chaptersReadCount}/{chapters.length} chapitres lus</p>
          <div className="reader-end-panel-actions">
            <button className="primary-button" onClick={() => onOpenChapter?.(nextChapter.id)}>
              Chapitre suivant
            </button>
            <button className="ghost-button" onClick={onExit}>
              Retour a la fiche manga
            </button>
          </div>
        </div>
      )}

      {notesOpen && (
        <aside className="reader-notes-panel">
          <div className="reader-notes-head">
            <div>
              <strong>Repere et notes</strong>
              <span>Page actuelle: {currentPageIndex + 1}</span>
            </div>
            <button type="button" className="ghost-button" onClick={() => setNotesOpen(false)}>Fermer</button>
          </div>

          <label className="reader-notes-editor">
            <span>Note rapide</span>
            <textarea
              rows="3"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Ajoute un contexte, une scene a relire ou un commentaire court..."
            />
          </label>

          <div className="reader-notes-actions">
            <button type="button" className="primary-button" onClick={handleSaveAnnotation}>
              Sauver la page actuelle
            </button>
          </div>

          <div className="reader-notes-list">
            {chapterAnnotations.length === 0 ? (
              <p className="muted-text">Aucun repere sur ce chapitre pour le moment.</p>
            ) : (
              chapterAnnotations.map((annotation) => (
                <article key={annotation.id} className="reader-note-card">
                  <div className="reader-note-card-head">
                    <strong>{annotation.label || `Page ${Number(annotation.pageIndex || 0) + 1}`}</strong>
                    <span>Page {Number(annotation.pageIndex || 0) + 1}</span>
                  </div>
                  {annotation.note ? <p>{annotation.note}</p> : null}
                  <div className="reader-note-card-actions">
                    <button type="button" className="ghost-button" onClick={() => setCurrentPageIndex(Number(annotation.pageIndex || 0))}>
                      Aller ici
                    </button>
                    {onDeleteAnnotation ? (
                      <button type="button" className="ghost-button danger" onClick={() => onDeleteAnnotation(manga.id, annotation.id)}>
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>
      )}

      <div className="reader-statusbar">
        <span>Page {currentPageIndex + 1} / {chapter.pageCount}</span>
        <span>Mode: {mode === 'single' ? 'page simple' : mode === 'double' ? 'double page' : mode === 'manga-jp' ? 'manga JP' : 'scroll webtoon'}</span>
        <span>{zoomPercent} · + / - / 0 pour le zoom · F pour plein écran · H pour masquer l'UI · ← / → aux bords ou Ctrl/Alt + ← / → pour changer de chapitre</span>
      </div>
    </section>
  );
}

export default memo(ReaderView);
