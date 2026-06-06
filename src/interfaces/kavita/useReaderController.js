import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveReaderCommand } from './readerCommands.js';

const MODE_ALIASES = {
  single: 'single',
  double: 'double-ltr',
  'manga-jp': 'double-rtl',
  webtoon: 'webtoon',
  split: 'split'
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeMode(value) {
  return MODE_ALIASES[value] || value || 'single';
}

export default function useReaderController({
  manga,
  chapter,
  chapters = [],
  initialPageIndex = 0,
  autoHideUI = true,
  readerSettings = {},
  shortcuts = {},
  overlayPinned = false,
  onExit,
  onOpenChapter,
  onUpdateProgress,
  onReaderSettingsChange
}) {
  const pages = useMemo(() => chapter.pages || [], [chapter.pages]);
  const [pageIndex, setPageIndex] = useState(() => clamp(Number(initialPageIndex || 0), 0, Math.max(0, pages.length - 1)));
  const [mode, setMode] = useState(() => normalizeMode(readerSettings.mode || 'single'));
  const [fitMode, setFitMode] = useState(readerSettings.fitMode || 'fit-height');
  const [zoom, setZoom] = useState(() => clamp(Number(readerSettings.zoom ?? 1), 0.5, 3));
  const [brightness, setBrightness] = useState(() => clamp(Number(readerSettings.brightness ?? 100), 20, 140));
  const [widthOverride, setWidthOverride] = useState(() => clamp(Number(readerSettings.widthOverride ?? 0), 0, 100));
  const [splitDirection, setSplitDirection] = useState(readerSettings.splitDirection || 'none');
  const [pageOffset, setPageOffset] = useState(Boolean(readerSettings.pageOffset));
  const [swipeEnabled, setSwipeEnabled] = useState(readerSettings.swipeEnabled !== false);
  const [emulateBook, setEmulateBook] = useState(Boolean(readerSettings.emulateBook));
  const [autoClose, setAutoClose] = useState(readerSettings.autoClose ?? autoHideUI);
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const chromePinned = overlayPinned || settingsOpen || secondaryOpen;
  const hideTimerRef = useRef(null);
  const pageFrameRef = useRef(null);
  const webtoonRootRef = useRef(null);
  const progressChangeRef = useRef(onUpdateProgress);
  const settingsChangeRef = useRef(onReaderSettingsChange);
  progressChangeRef.current = onUpdateProgress;
  settingsChangeRef.current = onReaderSettingsChange;

  const chapterIndex = useMemo(
    () => chapters.findIndex((entry) => entry.id === chapter.id || entry.contentId === chapter.contentId),
    [chapters, chapter.id, chapter.contentId]
  );
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter = chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? chapters[chapterIndex + 1] : null;
  const progressPercent = pages.length > 1 ? Math.round((pageIndex / (pages.length - 1)) * 100) : 0;

  const showOverlays = useCallback(() => setOverlaysVisible(true), []);

  useEffect(() => {
    if (pageFrameRef.current) window.cancelAnimationFrame(pageFrameRef.current);
    pageFrameRef.current = null;
    setPageIndex(clamp(Number(initialPageIndex || 0), 0, Math.max(0, pages.length - 1)));
    setOverlaysVisible(true);
  }, [chapter.id, initialPageIndex, pages.length]);

  useEffect(() => {
    if (!autoClose || chromePinned || !overlaysVisible) return undefined;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setOverlaysVisible(false), 2300);
    return () => window.clearTimeout(hideTimerRef.current);
  }, [autoClose, chromePinned, overlaysVisible]);

  useEffect(() => {
    if (chromePinned) setOverlaysVisible(true);
  }, [chromePinned]);

  const goToPage = useCallback((nextIndex) => {
    const safeIndex = clamp(Number(nextIndex || 0), 0, Math.max(0, pages.length - 1));
    if (pageFrameRef.current) window.cancelAnimationFrame(pageFrameRef.current);
    pageFrameRef.current = window.requestAnimationFrame(() => {
      pageFrameRef.current = null;
      setPageIndex(safeIndex);
    });
  }, [pages.length]);

  const pageStep = mode === 'double-ltr' || mode === 'double-rtl' ? 2 : 1;
  const previous = useCallback(() => {
    if (pageIndex > 0) {
      goToPage(pageIndex - pageStep);
    } else if (previousChapter) {
      onOpenChapter?.(previousChapter.id);
    }
  }, [goToPage, onOpenChapter, pageIndex, pageStep, previousChapter]);

  const next = useCallback(() => {
    if (pageIndex + pageStep < pages.length) {
      goToPage(pageIndex + pageStep);
    } else if (nextChapter) {
      onOpenChapter?.(nextChapter.id);
    }
  }, [goToPage, nextChapter, onOpenChapter, pageIndex, pageStep, pages.length]);

  const scrollWebtoon = useCallback((direction, amount) => {
    const root = webtoonRootRef.current;
    if (!root?.isConnected) return;
    const atStart = root.scrollTop <= 4;
    const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 4;
    if (direction < 0 && atStart) {
      if (previousChapter) onOpenChapter?.(previousChapter.id);
      return;
    }
    if (direction > 0 && atEnd) {
      if (nextChapter) onOpenChapter?.(nextChapter.id);
      return;
    }
    const distance = amount === 'page' ? root.clientHeight * 0.85 : 72;
    root.scrollBy({ top: direction * distance, behavior: 'auto' });
  }, [nextChapter, onOpenChapter, previousChapter]);

  useEffect(() => {
    progressChangeRef.current?.({
      mangaId: manga.id,
      chapterId: chapter.id,
      pageIndex,
      pageCount: pages.length,
      mode,
      fitMode,
      zoom,
      scrollTop: mode === 'webtoon' ? Number(webtoonRootRef.current?.scrollTop || 0) : 0,
      scrollRatio: progressPercent / 100
    });
  }, [chapter.id, fitMode, manga.id, mode, pageIndex, pages.length, progressPercent, zoom]);

  useEffect(() => {
    settingsChangeRef.current?.({
      mode,
      fitMode,
      zoom,
      brightness,
      widthOverride,
      splitDirection,
      pageOffset,
      swipeEnabled,
      emulateBook,
      autoClose
    });
  }, [autoClose, brightness, emulateBook, fitMode, mode, pageOffset, splitDirection, swipeEnabled, widthOverride, zoom]);

  useEffect(() => {
    const preloadIndexes = [pageIndex - 2, pageIndex - 1, pageIndex + 1, pageIndex + 2, pageIndex + 3]
      .filter((index) => index >= 0 && index < pages.length);
    preloadIndexes.forEach((index) => {
      const src = pages[index]?.src;
      if (!src || typeof Image === 'undefined') return;
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
    });
    if (pageIndex >= pages.length - 3 && nextChapter?.pages?.[0]?.src && typeof Image !== 'undefined') {
      const image = new Image();
      image.decoding = 'async';
      image.src = nextChapter.pages[0].src;
    }
  }, [nextChapter, pageIndex, pages]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const command = resolveReaderCommand(event, { shortcuts, mode });
      if (!command || command.type === 'global') return;
      event.preventDefault();
      event.stopImmediatePropagation();

      if (command.type === 'toggle-chrome') {
        setOverlaysVisible((visible) => chromePinned ? true : !visible);
      } else if (command.type === 'exit-reader') {
        if (settingsOpen || secondaryOpen) {
          setSettingsOpen(false);
          setSecondaryOpen(false);
        } else {
          onExit?.();
        }
      } else if (command.type === 'toggle-fullscreen') {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        else document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (command.type === 'zoom-in') {
        setZoom((value) => clamp(value + 0.1, 0.5, 3));
      } else if (command.type === 'zoom-out') {
        setZoom((value) => clamp(value - 0.1, 0.5, 3));
      } else if (command.type === 'zoom-reset') {
        setZoom(1);
      } else if (command.type === 'previous-chapter') {
        if (previousChapter) onOpenChapter?.(previousChapter.id);
      } else if (command.type === 'next-chapter') {
        if (nextChapter) onOpenChapter?.(nextChapter.id);
      } else if (command.type === 'scroll-webtoon') {
        scrollWebtoon(command.direction, command.amount);
      } else if (command.type === 'previous-page') {
        const horizontal = event.key === 'ArrowLeft';
        horizontal && mode === 'double-rtl' ? next() : previous();
      } else if (command.type === 'next-page') {
        const horizontal = event.key === 'ArrowRight';
        horizontal && mode === 'double-rtl' ? previous() : next();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    chromePinned,
    mode,
    next,
    nextChapter,
    onExit,
    onOpenChapter,
    previous,
    previousChapter,
    scrollWebtoon,
    secondaryOpen,
    settingsOpen,
    shortcuts
  ]);

  useEffect(() => () => {
    window.clearTimeout(hideTimerRef.current);
    if (pageFrameRef.current) window.cancelAnimationFrame(pageFrameRef.current);
  }, []);

  return {
    pages,
    pageIndex,
    pageStep,
    mode,
    fitMode,
    zoom,
    brightness,
    widthOverride,
    splitDirection,
    pageOffset,
    swipeEnabled,
    emulateBook,
    autoClose,
    overlaysVisible,
    settingsOpen,
    secondaryOpen,
    progressPercent,
    previousChapter,
    nextChapter,
    webtoonRootRef,
    setMode,
    setFitMode,
    setZoom: (value) => setZoom(clamp(Number(value), 0.5, 3)),
    setBrightness: (value) => setBrightness(clamp(Number(value), 20, 140)),
    setWidthOverride: (value) => setWidthOverride(clamp(Number(value), 0, 100)),
    setSplitDirection,
    setPageOffset,
    setSwipeEnabled,
    setEmulateBook,
    setAutoClose,
    setSettingsOpen,
    setSecondaryOpen,
    setOverlaysVisible: (updater) => {
      if (chromePinned) {
        setOverlaysVisible(true);
        return;
      }
      setOverlaysVisible(updater);
    },
    showOverlays,
    goToPage,
    previous,
    next
  };
}
