import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { buildDoubleSpreadRanges } from '../utils/reader.js';
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

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function ReaderView({
  manga,
  chapter,
  chapters = [],
  initialPageIndex,
  preferredMode,
  onExit,
  onOpenChapter,
  onUpdateProgress,
  onContextMenu
}) {
  const [mode, setMode] = useState(preferredMode || 'single');
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex || 0);
  const [zoom, setZoom] = useState(1);
  const [uiHidden, setUiHidden] = useState(false);
  const webtoonContainerRef = useRef(null);

  const safePages = Array.isArray(chapter.pages) ? chapter.pages : [];
  const spreads = useMemo(() => buildDoubleSpreadRanges(safePages.length), [safePages.length]);
  const chapterIndex = useMemo(() => chapters.findIndex((item) => item.id === chapter.id), [chapters, chapter.id]);
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;

  const currentSpreadIndex = useMemo(() => {
    if (currentPageIndex === 0) return 0;
    const normalizedStart = currentPageIndex % 2 === 0 ? currentPageIndex - 1 : currentPageIndex;
    return spreads.findIndex((range) => range.start === normalizedStart);
  }, [currentPageIndex, spreads]);

  useEffect(() => {
    setMode(preferredMode || 'single');
  }, [preferredMode, chapter.id]);

  useEffect(() => {
    setCurrentPageIndex(initialPageIndex || 0);
  }, [chapter.id, initialPageIndex]);

  useEffect(() => {
    setZoom(1);
    setUiHidden(false);
  }, [chapter.id]);

  const increaseZoom = () => setZoom((value) => clampZoom(value + ZOOM_STEP));
  const decreaseZoom = () => setZoom((value) => clampZoom(value - ZOOM_STEP));
  const resetZoom = () => setZoom(1);
  const toggleUiHidden = () => setUiHidden((value) => !value);

  useEffect(() => {
    const listener = (event) => {
      const isModifierChapterNav = (event.ctrlKey || event.metaKey) && !event.altKey;
      if (mode !== 'webtoon') {
        if (!isModifierChapterNav && event.key === 'ArrowRight') next();
        if (!isModifierChapterNav && event.key === 'ArrowLeft') previous();
      }
      if (isModifierChapterNav && event.key === 'ArrowRight' && nextChapter) {
        event.preventDefault();
        onOpenChapter?.(nextChapter.id);
      }
      if (isModifierChapterNav && event.key === 'ArrowLeft' && previousChapter) {
        event.preventDefault();
        onOpenChapter?.(previousChapter.id);
      }
      if (event.key.toLowerCase() === 'f') {
        window.mangaAPI.toggleFullScreen();
      }
      if (event.key === 'Escape') onExit();
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        increaseZoom();
      }
      if (event.key === '-') {
        event.preventDefault();
        decreaseZoom();
      }
      if (event.key === '0') {
        event.preventDefault();
        resetZoom();
      }
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        toggleUiHidden();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [mode, chapter.id, nextChapter?.id, onExit, onOpenChapter, previousChapter?.id]);

  useEffect(() => {
    if (!safePages.length) return undefined;
    const timeout = window.setTimeout(() => {
      const payload = {
        mangaId: manga.id,
        chapterId: chapter.id,
        pageIndex: currentPageIndex,
        pageCount: chapter.pageCount,
        mode
      };
      onUpdateProgress(payload);
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [manga.id, chapter.id, currentPageIndex, chapter.pageCount, mode, safePages.length, onUpdateProgress]);

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
      setCurrentPageIndex(bestIndex);
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
    setCurrentPageIndex((value) => Math.min(value + 1, safePages.length - 1));
  }

  function previous() {
    if (mode === 'double') {
      const prevSpread = spreads[Math.max(currentSpreadIndex - 1, 0)];
      if (prevSpread) setCurrentPageIndex(prevSpread.start);
      return;
    }
    setCurrentPageIndex((value) => Math.max(value - 1, 0));
  }

  function handleStageToggle(event) {
    if (event.target === event.currentTarget) {
      toggleUiHidden();
    }
  }

  const currentSpread = spreads[currentSpreadIndex] || { start: 0, end: 0 };
  const zoomPercent = `${Math.round(zoom * 100)}%`;

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
            onClick={() => previousChapter && onOpenChapter?.(previousChapter.id)}
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
            onClick={() => nextChapter && onOpenChapter?.(nextChapter.id)}
            disabled={!nextChapter}
            title={nextChapter ? `Chapitre suivant : ${nextChapter.name}` : 'Aucun chapitre suivant'}
          >
            <ChevronRightIcon size={18} />
          </button>
        </div>

        <div className="reader-toolbar-right">
          <div className="reader-mode-switch">
            <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>
              <LayoutGridIcon size={16} /> 1 page
            </button>
            <button className={mode === 'double' ? 'active' : ''} onClick={() => setMode('double')}>
              <LayoutGridIcon size={16} /> 2 pages
            </button>
            <button className={mode === 'webtoon' ? 'active' : ''} onClick={() => setMode('webtoon')}>
              <ScrollIcon size={16} /> Webtoon
            </button>
          </div>
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
          <button className="icon-pill" onClick={() => window.mangaAPI.toggleFullScreen()} title="Plein écran">
            <FullscreenIcon size={16} />
          </button>
        </div>
      </div>

      {mode === 'single' && (
        <div className="reader-stage" onClick={handleStageToggle}>
          <button className="reader-nav reader-nav-left" onClick={(event) => { event.stopPropagation(); previous(); }} disabled={currentPageIndex <= 0}><ChevronLeftIcon size={20} /></button>
          <div className="reader-page-wrap" onClick={handleStageToggle}>
            <img
              className="reader-page"
              src={safePages[currentPageIndex]?.src}
              alt={`Page ${currentPageIndex + 1}`}
              style={{ width: `${Math.max(55, zoom * 100)}%`, maxWidth: `${980 * zoom}px` }}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
          <button className="reader-nav reader-nav-right" onClick={(event) => { event.stopPropagation(); next(); }} disabled={currentPageIndex >= safePages.length - 1}><ChevronRightIcon size={20} /></button>
        </div>
      )}

      {mode === 'double' && (
        <div className="reader-stage reader-stage-double" onClick={handleStageToggle}>
          <button className="reader-nav reader-nav-left" onClick={(event) => { event.stopPropagation(); previous(); }} disabled={currentSpreadIndex <= 0}><ChevronLeftIcon size={20} /></button>
          <div className="reader-double-wrap" onClick={handleStageToggle}>
            <img
              className="reader-page reader-page-double"
              src={safePages[currentSpread.start]?.src}
              alt={`Page ${currentSpread.start + 1}`}
              style={{ maxWidth: `${480 * zoom}px` }}
              onClick={(event) => event.stopPropagation()}
            />
            {currentSpread.end !== currentSpread.start && (
              <img
                className="reader-page reader-page-double"
                src={safePages[currentSpread.end]?.src}
                alt={`Page ${currentSpread.end + 1}`}
                style={{ maxWidth: `${480 * zoom}px` }}
                onClick={(event) => event.stopPropagation()}
              />
            )}
          </div>
          <button className="reader-nav reader-nav-right" onClick={(event) => { event.stopPropagation(); next(); }} disabled={currentSpreadIndex >= spreads.length - 1}><ChevronRightIcon size={20} /></button>
        </div>
      )}

      {mode === 'webtoon' && (
        <div className="webtoon-stage" ref={webtoonContainerRef} onClick={handleStageToggle}>
          {safePages.map((page) => (
            <img
              key={page.id}
              data-page-index={page.index}
              className="webtoon-page"
              src={page.src}
              alt={`Page ${page.index + 1}`}
              loading="lazy"
              style={{ maxWidth: `${960 * zoom}px` }}
              onClick={(event) => event.stopPropagation()}
            />
          ))}
        </div>
      )}

      <div className="reader-statusbar">
        <span>Page {currentPageIndex + 1} / {chapter.pageCount}</span>
        <span>Mode: {mode === 'single' ? 'page simple' : mode === 'double' ? 'double page' : 'scroll webtoon'}</span>
        <span>{zoomPercent} · + / - / 0 pour le zoom · F pour plein écran · H pour masquer l’UI · Ctrl + ← / → pour changer de chapitre</span>
      </div>
    </section>
  );
}

export default memo(ReaderView);
