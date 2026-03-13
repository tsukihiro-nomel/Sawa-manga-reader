import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import TabsBar from './components/TabsBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import LibraryView from './components/LibraryView.jsx';
import MangaDetailView from './components/MangaDetailView.jsx';
import ChapterPreviewView from './components/ChapterPreviewView.jsx';
import ReaderView from './components/ReaderView.jsx';
import SettingsDrawer from './components/SettingsDrawer.jsx';
import ContextMenu from './components/ContextMenu.jsx';
import {
  ChevronLeftIcon,
  BookIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  FolderPlusIcon,
  FullscreenIcon,
  HeartIcon,
  LayoutGridIcon,
  LibraryIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TrashIcon
} from './components/Icons.jsx';
import { sortMangas } from './utils/reader.js';

function normalizeView(view = {}) {
  return {
    screen: 'library',
    mangaId: null,
    chapterId: null,
    pageIndex: 0,
    ...view
  };
}

let tabSequence = 0;
function createTab(initialView, seedStack = []) {
  tabSequence += 1;
  return {
    id: `tab-${Date.now()}-${tabSequence}`,
    stack: [...seedStack.map(normalizeView), normalizeView(initialView)]
  };
}

const INITIAL_TAB = createTab(normalizeView());

function sanitizeTab(candidate, fallbackIdPrefix = 'restored') {
  const stack = Array.isArray(candidate?.stack) && candidate.stack.length > 0
    ? candidate.stack.map(normalizeView)
    : [normalizeView()];

  return {
    id: typeof candidate?.id === 'string' && candidate.id.trim()
      ? candidate.id
      : `${fallbackIdPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    stack
  };
}

function restoreTabsSession(session) {
  const restoredTabs = Array.isArray(session?.tabs) && session.tabs.length > 0
    ? session.tabs.map((tab, index) => sanitizeTab(tab, `restored-${index}`))
    : [INITIAL_TAB];

  const restoredActiveId = restoredTabs.some((tab) => tab.id === session?.activeTabId)
    ? session.activeTabId
    : restoredTabs[0].id;

  return {
    tabs: restoredTabs,
    activeTabId: restoredActiveId
  };
}

function getTabView(tab) {
  return tab?.stack?.[tab.stack.length - 1] ?? normalizeView();
}

function findManga(library, mangaId) {
  return library.allMangas.find((manga) => manga.id === mangaId) ?? null;
}

function findChapter(library, mangaId, chapterId) {
  const manga = findManga(library, mangaId);
  if (!manga) return { manga: null, chapter: null };
  const chapter = manga.chapters.find((item) => item.id === chapterId) ?? null;
  return { manga, chapter };
}

function chapterTargetView(ui, mangaId, chapterId, pageIndex = 0) {
  return ui.showPagePreviewBeforeReading
    ? { screen: 'preview', mangaId, chapterId, pageIndex: 0 }
    : { screen: 'reader', mangaId, chapterId, pageIndex };
}

function makeViewScrollKey(tabId, view, activeShelf = 'library', selectedCategoryId = null) {
  const screen = view?.screen || 'library';
  const mangaId = view?.mangaId || 'none';
  const chapterId = view?.chapterId || 'none';
  return `${tabId}:${screen}:${mangaId}:${chapterId}:${activeShelf}:${selectedCategoryId ?? 'all'}`;
}

function normalizeThemeName(theme) {
  if (theme === 'dark') return 'dark-night';
  if (theme === 'light') return 'light-paper';
  return theme || 'dark-night';
}

function cardSizeMinWidth(cardSize) {
  if (cardSize === 'compact') return '190px';
  if (cardSize === 'large') return '250px';
  return '215px';
}

function buildMangaAggregate(manga) {
  const chapters = Array.isArray(manga?.chapters) ? manga.chapters : [];
  const completedChapterCount = chapters.filter((chapter) => chapter.isRead).length;
  const progressUnits = chapters.reduce((sum, chapter) => {
    if (chapter.isRead) return sum + 1;
    if (chapter.progress?.pageCount) {
      const ratio = Math.max(0, Math.min(1, (chapter.progress.pageIndex + 1) / chapter.progress.pageCount));
      return sum + ratio;
    }
    return sum;
  }, 0);
  const progressPercent = chapters.length
    ? Math.max(0, Math.min(100, Math.round((progressUnits / chapters.length) * 100)))
    : 0;
  return {
    ...manga,
    completedChapterCount,
    progressPercent,
    isRead: chapters.length > 0 && completedChapterCount === chapters.length,
    progress: {
      percent: progressPercent,
      completedChapterCount,
      totalChapterCount: chapters.length,
      lastChapterId: manga?.lastProgress?.chapterId ?? null
    }
  };
}

export default function App() {
  const [payload, setPayload] = useState(null);
  const [tabs, setTabs] = useState([INITIAL_TAB]);
  const [activeTabId, setActiveTabId] = useState(INITIAL_TAB.id);
  const [activeShelf, setActiveShelf] = useState('library');
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [chapterPagesCache, setChapterPagesCache] = useState({});
  const [bootError, setBootError] = useState('');
  const scrollPositionsRef = useRef({});

  useEffect(() => {
    let unsubscribe = () => {};
    let disposed = false;

    async function boot() {
      try {
        const nextPayload = await window.mangaAPI.bootstrap();
        if (disposed) return;
        setBootError('');
        setPayload(nextPayload);
        const restoredSession = restoreTabsSession(nextPayload?.persisted?.session);
        setTabs(restoredSession.tabs);
        setActiveTabId(restoredSession.activeTabId);
        unsubscribe = window.mangaAPI.onLibraryChanged((incoming) => {
          if (!disposed) setPayload(incoming);
        });
      } catch (error) {
        if (!disposed) {
          setBootError(error?.message || 'Impossible de charger la bibliothèque.');
        }
      }
    }

    boot();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!payload) return;

    const serializableTabs = tabs.map((tab) => ({
      id: tab.id,
      stack: tab.stack.map(normalizeView)
    }));

    const timer = window.setTimeout(() => {
      window.mangaAPI.saveTabsSession({
        tabs: serializableTabs,
        activeTabId
      }).catch(() => {
        // Le stockage de session ne doit jamais casser l'UI.
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [payload, tabs, activeTabId]);

  const theme = normalizeThemeName(payload?.persisted.ui.theme);
  const ui = {
    ...(payload?.persisted.ui ?? {}),
    theme
  };
  const library = payload?.library ?? { categories: [], allMangas: [], favorites: [], recents: [] };

  const selectedCategoryId = payload?.persisted.ui.selectedCategoryId ?? null;
  const selectedCategory = library.categories.find((category) => category.id === selectedCategoryId) ?? null;

  const visibleCategories = useMemo(() => {
    return library.categories.filter((category) => !category.hidden);
  }, [library.categories]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? INITIAL_TAB;
  const activeView = getTabView(activeTab);
  const activeScrollKey = useMemo(() => makeViewScrollKey(activeTab?.id || 'tab', activeView, activeShelf, selectedCategoryId), [activeTab?.id, activeView, activeShelf, selectedCategoryId]);
  const activeInitialScrollTop = scrollPositionsRef.current[activeScrollKey] ?? 0;
  const captureCurrentViewScroll = useCallback(() => {
    const currentScrollable = document.querySelector('.library-view, .detail-view, .preview-view');
    if (currentScrollable) {
      scrollPositionsRef.current[activeScrollKey] = currentScrollable.scrollTop || 0;
    }
  }, [activeScrollKey]);

  const baseMangas = useMemo(() => {
    if (activeShelf === 'favorites') return library.favorites;
    if (activeShelf === 'recents') {
      const seen = new Set();
      return library.recents
        .map((recent) => findManga(library, recent.mangaId))
        .filter((manga) => {
          if (!manga || seen.has(manga.id)) return false;
          seen.add(manga.id);
          return true;
        });
    }
    return library.allMangas;
  }, [activeShelf, library]);

  const filteredMangas = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    const byCategory = baseMangas.filter((manga) => {
      if (!ui.showHiddenCategories && manga.categoryHidden) return false;
      if (selectedCategory && manga.categoryId !== selectedCategory.id) return false;
      return true;
    });

    const bySearch = lowered
      ? byCategory.filter((manga) => {
          const haystack = `${manga.displayTitle} ${manga.author} ${manga.description}`.toLowerCase();
          return haystack.includes(lowered);
        })
      : byCategory;

    return sortMangas(bySearch, ui.sort);
  }, [baseMangas, search, ui.showHiddenCategories, ui.sort, selectedCategory]);

  const currentManga = activeView.mangaId ? findManga(library, activeView.mangaId) : null;
  const currentChapterData = activeView.chapterId
    ? findChapter(library, activeView.mangaId, activeView.chapterId)
    : { manga: currentManga, chapter: null };

  const resolvedChapter = currentChapterData.chapter
    ? {
        ...currentChapterData.chapter,
        pages: chapterPagesCache[currentChapterData.chapter.id] ?? currentChapterData.chapter.pages
      }
    : null;

  useEffect(() => {
    if (!currentChapterData.chapter?.path) return;
    if (!(activeView.screen === 'preview' || activeView.screen === 'reader')) return;
    if (chapterPagesCache[currentChapterData.chapter.id]) return;

    let disposed = false;
    window.mangaAPI.getChapterPages(currentChapterData.chapter.path).then((pages) => {
      if (disposed) return;
      setChapterPagesCache((prev) => (prev[currentChapterData.chapter.id] ? prev : {
        ...prev,
        [currentChapterData.chapter.id]: pages
      }));
    }).catch(() => {
      // Un échec de préchargement ne doit pas casser l'écran.
    });

    return () => {
      disposed = true;
    };
  }, [activeView.screen, currentChapterData.chapter?.id, currentChapterData.chapter?.path, chapterPagesCache[currentChapterData.chapter?.id]]);

  const tabsMeta = useMemo(() => {
    return tabs.map((tab) => {
      const view = getTabView(tab);
      const manga = view.mangaId ? findManga(library, view.mangaId) : null;
      const chapter = view.chapterId && manga
        ? manga.chapters.find((item) => item.id === view.chapterId) ?? null
        : null;

      if (view.screen === 'library') {
        return {
          id: tab.id,
          kind: 'library',
          label: activeShelf === 'favorites' ? 'Favoris' : activeShelf === 'recents' ? 'Récents' : 'Bibliothèque',
          subtitle: selectedCategory?.name ?? 'Toute la bibliothèque'
        };
      }

      if (view.screen === 'manga') {
        return {
          id: tab.id,
          kind: 'manga',
          label: manga?.displayTitle ?? 'Manga',
          subtitle: manga?.author || 'Détails du manga'
        };
      }

      if (view.screen === 'preview') {
        return {
          id: tab.id,
          kind: 'preview',
          label: manga?.displayTitle ?? 'Aperçu',
          subtitle: chapter?.name ?? 'Aperçu du chapitre'
        };
      }

      return {
        id: tab.id,
        kind: 'reader',
        label: manga?.displayTitle ?? 'Lecture',
        subtitle: chapter?.name ?? 'Mode lecture'
      };
    });
  }, [tabs, library, activeShelf, selectedCategory]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    const dismiss = () => closeContextMenu();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeContextMenu();
    };

    window.addEventListener('mousedown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeContextMenu]);

  async function refreshWith(promise) {
    const nextPayload = await promise;
    setPayload(nextPayload);
  }

  function pushViewToActive(nextView) {
    captureCurrentViewScroll();
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== activeTabId) return tab;
      return {
        ...tab,
        stack: [...tab.stack, normalizeView(nextView)]
      };
    }));
  }

  function replaceActiveView(nextView) {
    captureCurrentViewScroll();
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== activeTabId) return tab;
      const stack = [...tab.stack];
      stack[stack.length - 1] = normalizeView(nextView);
      return { ...tab, stack };
    }));
  }

  function popActiveView() {
    captureCurrentViewScroll();
    setTabs((prev) => prev.map((tab) => {
      if (tab.id !== activeTabId) return tab;
      if (tab.stack.length <= 1) {
        return { ...tab, stack: [normalizeView()] };
      }
      return { ...tab, stack: tab.stack.slice(0, -1) };
    }));
  }

  function openNewTab(nextView, seedStack = [], options = {}) {
    captureCurrentViewScroll();
    const newTab = createTab(nextView, seedStack);
    const shouldActivate = options.activate !== false;
    setTabs((prev) => [...prev, newTab]);
    if (shouldActivate) {
      setActiveTabId(newTab.id);
    }
    return newTab.id;
  }

  function openNewLibraryTab(options = {}) {
    openNewTab(normalizeView(), [], options);
  }

  function closeTab(tabId) {
    captureCurrentViewScroll();
    if (tabs.length === 1) {
      setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, stack: [normalizeView()] } : tab)));
      setActiveTabId(tabId);
      return;
    }

    const index = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);

    if (activeTabId === tabId) {
      const fallback = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
      setActiveTabId(fallback.id);
    }
  }

  function reorderTabs(updater) {
    setTabs((prev) => updater(prev));
  }

  function handleSelectTab(tabId) {
    captureCurrentViewScroll();
    setActiveTabId(tabId);
  }

  useEffect(() => {
    const matchesCloseShortcut = (event) => {
      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '').toLowerCase();
      return (event.ctrlKey || event.metaKey)
        && !event.altKey
        && !event.shiftKey
        && (key === 'z' || key === 'undo' || code === 'keyz');
    };

    const onKeyDown = (event) => {
      const isCloseShortcut = matchesCloseShortcut(event);

      if (!isCloseShortcut) return;

      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
      if (isEditable) return;

      event.preventDefault();
      closeTab(activeTabId);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyDown);
    };
  }, [activeTabId, tabs.length]);

  useEffect(() => {
    const isEditableTarget = (target) => {
      const tagName = target?.tagName?.toLowerCase();
      return target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
    };

    const goBack = () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (activeTab.stack.length > 1 || activeView.screen !== 'library') {
        captureCurrentViewScroll();
        popActiveView();
      }
    };

    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      const key = String(event.key || '').toLowerCase();
      if (event.key === 'BrowserBack' || key === 'browserback') {
        event.preventDefault();
        goBack();
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && key === 'arrowleft') {
        event.preventDefault();
        goBack();
        return;
      }
      if (key === 'backspace') {
        event.preventDefault();
        goBack();
      }
    };

    const onMouseUp = (event) => {
      if (event.button === 3) {
        event.preventDefault();
        goBack();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onMouseUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [activeTab.stack.length, activeView.screen, settingsOpen]);

  const handleViewScrollPositionChange = useCallback((scrollTop) => {
    scrollPositionsRef.current[activeScrollKey] = scrollTop;
  }, [activeScrollKey]);

  function openMangaInCurrentTab(mangaId) {
    replaceActiveView({ screen: 'manga', mangaId, chapterId: null, pageIndex: 0 });
  }

  function openMangaInNewTab(mangaId, options = {}) {
    openNewTab({ screen: 'manga', mangaId, chapterId: null, pageIndex: 0 }, [normalizeView()], options);
  }

  function openChapterInCurrentTab(mangaId, chapterId, pageIndex = 0) {
    pushViewToActive(chapterTargetView(ui, mangaId, chapterId, pageIndex));
  }

  function openChapterInNewTab(mangaId, chapterId, pageIndex = 0, options = {}) {
    openNewTab(chapterTargetView(ui, mangaId, chapterId, pageIndex), [normalizeView(), { screen: 'manga', mangaId }], options);
  }

  async function toggleSidebarCollapsed() {
    await handleUpdateSettings({ sidebarCollapsed: !ui.sidebarCollapsed });
  }

  async function handleSelectCategory(categoryId) {
    await refreshWith(window.mangaAPI.updateSettings({ selectedCategoryId: categoryId }));
  }

  async function handleOpenAddCategories() {
    await refreshWith(window.mangaAPI.addCategories());
  }

  async function handleToggleCategoryHidden(categoryId) {
    await refreshWith(window.mangaAPI.toggleCategoryHidden(categoryId));
  }

  async function handleRemoveCategory(categoryId) {
    await refreshWith(window.mangaAPI.removeCategory(categoryId));
  }

  async function handleToggleFavorite(mangaId) {
    await refreshWith(window.mangaAPI.toggleFavorite(mangaId));
  }

  async function handleTrashManga(mangaId) {
    captureCurrentViewScroll();
    await refreshWith(window.mangaAPI.trashManga(mangaId));
    if (activeView.mangaId === mangaId) {
      replaceActiveView(normalizeView());
    }
  }

  async function handleSetReadStatus(mangaId, isRead, chapterIds = []) {
    await refreshWith(window.mangaAPI.setReadStatus(mangaId, isRead, chapterIds));
  }

  async function handleSetChapterReadStatus(mangaId, chapterId, isRead, pageCount = 0) {
    await refreshWith(window.mangaAPI.setChapterReadStatus(mangaId, chapterId, isRead, pageCount));
  }

  async function handleResetProgress(mangaId, chapterIds = []) {
    await refreshWith(window.mangaAPI.resetProgress(mangaId, chapterIds));
  }

  async function handleResetChapterProgress(chapterId) {
    await refreshWith(window.mangaAPI.resetChapterProgress(chapterId));
  }

  async function handleSaveMetadata(mangaId, patch) {
    await refreshWith(window.mangaAPI.updateMetadata(mangaId, patch));
    setEditingMetadata(null);
  }

  async function handlePickCover(mangaId) {
    await refreshWith(window.mangaAPI.pickCover(mangaId));
  }

  async function handleUpdateSettings(patch) {
    await refreshWith(window.mangaAPI.updateSettings(patch));
  }

  function handleUpdateProgress(progressPayload) {
    const now = new Date().toISOString();

    setPayload((prev) => {
      if (!prev?.library) return prev;
      const nextLibrary = { ...prev.library };
      const nextProgress = { ...(prev.persisted?.progress || {}) };
      nextProgress[progressPayload.chapterId] = { ...progressPayload, lastReadAt: now };

      const nextRecents = [
        {
          mangaId: progressPayload.mangaId,
          chapterId: progressPayload.chapterId,
          pageIndex: progressPayload.pageIndex,
          lastReadAt: now
        },
        ...(prev.persisted?.recents || []).filter((entry) => entry.chapterId !== progressPayload.chapterId)
      ].slice(0, 30);

      const updateManga = (manga) => {
        if (manga.id !== progressPayload.mangaId) return manga;
        const chapters = manga.chapters.map((chapter) => {
          if (chapter.id !== progressPayload.chapterId) return chapter;
          const nextChapter = {
            ...chapter,
            progress: { ...progressPayload, lastReadAt: now },
            isRead: progressPayload.pageCount > 0 && progressPayload.pageIndex >= progressPayload.pageCount - 1
          };
          return nextChapter;
        });
        return buildMangaAggregate({
          ...manga,
          chapters,
          lastProgress: { ...progressPayload, lastReadAt: now },
          lastReadAt: now
        });
      };

      nextLibrary.allMangas = prev.library.allMangas.map(updateManga);
      nextLibrary.favorites = prev.library.favorites.map(updateManga);
      nextLibrary.categories = prev.library.categories.map((category) => ({
        ...category,
        mangas: category.mangas.map(updateManga)
      }));
      nextLibrary.recents = nextRecents.map((recent) => {
        const manga = nextLibrary.allMangas.find((item) => item.id === recent.mangaId);
        const chapter = manga?.chapters.find((item) => item.id === recent.chapterId);
        return manga && chapter ? {
          ...recent,
          mangaTitle: manga.displayTitle,
          mangaCoverSrc: manga.coverSrc,
          chapterName: chapter.name,
          categoryName: manga.categoryName
        } : null;
      }).filter(Boolean).slice(0, 20);

      return {
        ...prev,
        persisted: {
          ...prev.persisted,
          progress: nextProgress,
          recents: nextRecents,
          ui: {
            ...prev.persisted.ui,
            readerMode: progressPayload.mode
          }
        },
        library: nextLibrary
      };
    });

    window.mangaAPI.updateProgressLight(progressPayload).catch(() => {
      // On garde l'UI fluide même si l'écriture disque rate.
    });
  }

  function handleReaderExit() {
    popActiveView();
    window.setTimeout(() => {
      refreshWith(window.mangaAPI.bootstrap()).catch(() => {});
    }, 0);
  }

  function actionItem(label, action, options = {}) {
    return {
      type: 'action',
      label,
      icon: options.icon,
      danger: options.danger,
      disabled: options.disabled,
      checked: options.checked,
      onSelect: async () => {
        closeContextMenu();
        await action();
      }
    };
  }

  function separatorItem() {
    return { type: 'separator' };
  }

  function openContextMenu(event, context = { type: 'app' }) {
    event.preventDefault();
    event.stopPropagation();

    const items = [];
    if (context.type === 'manga' && context.manga) {
      items.push(
        actionItem('Ouvrir dans cet onglet', () => openMangaInCurrentTab(context.manga.id), { icon: <LayoutGridIcon size={14} /> }),
        actionItem('Ouvrir dans un nouvel onglet', () => openMangaInNewTab(context.manga.id), { icon: <PlusIcon size={14} /> }),
        separatorItem(),
        actionItem(context.manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris', () => handleToggleFavorite(context.manga.id), {
          icon: <HeartIcon size={14} filled={context.manga.isFavorite} />
        }),
        actionItem(context.manga.isRead ? 'Marquer tous les chapitres comme non lus' : 'Marquer tous les chapitres comme lus', () => handleSetReadStatus(context.manga.id, !context.manga.isRead, context.manga.chapters.map((chapter) => chapter.id)), {
          icon: <BookIcon size={14} />
        }),
        actionItem('Réinitialiser toute la progression', () => handleResetProgress(context.manga.id, context.manga.chapters.map((chapter) => chapter.id)), {
          icon: <TrashIcon size={14} />,
          danger: true
        }),
        actionItem('Éditer les métadonnées', () => setEditingMetadata(context.manga), { icon: <EditIcon size={14} /> }),
        actionItem('Choisir une couverture', () => handlePickCover(context.manga.id), { icon: <SparklesIcon size={14} /> }),
        actionItem('Supprimer le manga (corbeille)', () => handleTrashManga(context.manga.id), { icon: <TrashIcon size={14} />, danger: true })
      );
    }

    if (context.type === 'chapter' && context.manga && context.chapter) {
      items.push(
        actionItem('Ouvrir ce chapitre ici', () => openChapterInCurrentTab(context.manga.id, context.chapter.id, context.pageIndex ?? 0), { icon: <EyeIcon size={14} /> }),
        actionItem('Ouvrir ce chapitre dans un nouvel onglet', () => openChapterInNewTab(context.manga.id, context.chapter.id, context.pageIndex ?? 0), { icon: <PlusIcon size={14} /> }),
        actionItem('Ouvrir le manga dans un nouvel onglet', () => openMangaInNewTab(context.manga.id), { icon: <LayoutGridIcon size={14} /> }),
        separatorItem(),
        actionItem(context.chapter.isRead ? 'Marquer ce chapitre comme non lu' : 'Marquer ce chapitre comme lu', () => handleSetChapterReadStatus(context.manga.id, context.chapter.id, !context.chapter.isRead, context.chapter.pageCount), {
          icon: <BookIcon size={14} />
        }),
        actionItem('Réinitialiser la progression de ce chapitre', () => handleResetChapterProgress(context.chapter.id), {
          icon: <TrashIcon size={14} />,
          danger: true
        }),
        separatorItem()
      );
    }

    if (context.type === 'category' && context.category) {
      items.push(
        actionItem('Filtrer sur cette catégorie', () => handleSelectCategory(context.category.id), { icon: <LibraryIcon size={14} /> }),
        actionItem(context.category.hidden ? 'Afficher la catégorie' : 'Masquer la catégorie', () => handleToggleCategoryHidden(context.category.id), {
          icon: context.category.hidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />
        }),
        actionItem('Retirer cette catégorie', () => handleRemoveCategory(context.category.id), { icon: <TrashIcon size={14} />, danger: true }),
        separatorItem()
      );
    }

    if (context.type === 'tab' && context.tab) {
      items.push(
        actionItem('Nouvel onglet bibliothèque', () => openNewLibraryTab(), { icon: <PlusIcon size={14} /> }),
        actionItem('Fermer cet onglet', () => closeTab(context.tab.id), { icon: <TrashIcon size={14} />, danger: true, disabled: tabs.length === 1 }),
        separatorItem()
      );
    }

    if (context.type === 'reader') {
      items.push(
        actionItem('Quitter la lecture', () => popActiveView(), { icon: <ChevronLeftIcon size={14} /> }),
        actionItem('Plein écran', () => window.mangaAPI.toggleFullScreen(), { icon: <FullscreenIcon size={14} /> }),
        separatorItem()
      );
    }

    items.push(
      actionItem('Nouvel onglet bibliothèque', () => openNewLibraryTab(), { icon: <PlusIcon size={14} /> }),
      actionItem('Ajouter des catégories', () => handleOpenAddCategories(), { icon: <FolderPlusIcon size={14} /> }),
      actionItem('Actualiser la bibliothèque', () => refreshWith(window.mangaAPI.bootstrap()), { icon: <SearchIcon size={14} /> }),
      separatorItem(),
      actionItem(theme === 'light-paper' ? 'Passer en thème dark night' : 'Passer en thème clair', () => handleUpdateSettings({ theme: theme === 'light-paper' ? 'dark-night' : 'light-paper' }), {
        icon: <SparklesIcon size={14} />
      }),
      actionItem('Ouvrir les paramètres', () => setSettingsOpen(true), { icon: <SettingsIcon size={14} /> })
    );

    if (activeView.screen !== 'library') {
      items.push(separatorItem());
      items.push(actionItem('Revenir à la bibliothèque dans cet onglet', () => replaceActiveView(normalizeView()), { icon: <LibraryIcon size={14} /> }));
    }

    items.push(separatorItem());
    items.push(actionItem('Fermer l’onglet actif', () => closeTab(activeTabId), {
      icon: <TrashIcon size={14} />,
      danger: true
    }));

    const menuWidth = 280;
    const menuHeight = Math.min(items.length * 38 + 18, window.innerHeight - 16);
    const x = Math.min(event.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
    const y = Math.min(event.clientY, Math.max(8, window.innerHeight - menuHeight - 8));

    setContextMenu({ x, y, items });
  }

  if (bootError) {
    return <div className="boot-screen">{bootError}</div>;
  }

  if (!payload) {
    return <div className="boot-screen">Chargement de la bibliothèque…</div>;
  }

  return (
    <div
      className={`app-shell theme-${theme}`}
      style={{ '--accent': ui.accent, '--accent-alt': ui.accentAlt || '#38bdf8', '--card-min': cardSizeMinWidth(ui.cardSize) }}
      onContextMenu={(event) => openContextMenu(event)}
    >
      <TitleBar
        sidebarCollapsed={ui.sidebarCollapsed}
        onToggleSidebar={toggleSidebarCollapsed}
      />
      <TabsBar
        tabs={tabsMeta}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={closeTab}
        onNewTab={openNewLibraryTab}
        onContextMenu={openContextMenu}
        onReorderTabs={reorderTabs}
      />
      <div className={`layout-shell ${ui.sidebarCollapsed ? 'layout-shell-sidebar-collapsed' : ''}`}>
        <Sidebar
          collapsed={ui.sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          activeShelf={activeShelf}
          onShelfChange={setActiveShelf}
          categories={visibleCategories}
          allCategories={library.categories}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={handleSelectCategory}
          onAddCategories={handleOpenAddCategories}
          onToggleCategoryHidden={handleToggleCategoryHidden}
          onRemoveCategory={handleRemoveCategory}
          onOpenSettings={() => setSettingsOpen(true)}
          showHiddenCategories={ui.showHiddenCategories}
          onContextMenu={openContextMenu}
        />

        <div className="content-shell">
          {activeView.screen === 'library' && (
            <TopBar
              sidebarCollapsed={ui.sidebarCollapsed}
              onToggleSidebar={toggleSidebarCollapsed}
              search={search}
              onSearchChange={setSearch}
              sort={ui.sort}
              onSortChange={(sort) => handleUpdateSettings({ sort })}
              selectedCategory={selectedCategory}
              onClearCategory={() => handleSelectCategory(null)}
              onOpenSettings={() => setSettingsOpen(true)}
              onAddCategories={handleOpenAddCategories}
              activeShelf={activeShelf}
            />
          )}

          {activeView.screen === 'library' && (
            <LibraryView
              mangas={filteredMangas}
              activeShelf={activeShelf}
              categories={visibleCategories}
              initialScrollTop={activeInitialScrollTop}
              onScrollPositionChange={handleViewScrollPositionChange}
              onOpenManga={openMangaInCurrentTab}
              onOpenMangaInCurrentTab={openMangaInCurrentTab}
              onOpenMangaInNewTab={openMangaInNewTab}
              onOpenMangaInBackgroundTab={(mangaId) => openMangaInNewTab(mangaId, { activate: false })}
              onToggleFavorite={handleToggleFavorite}
              onContextMenu={openContextMenu}
            />
          )}

          {activeView.screen === 'manga' && currentManga && (
            <MangaDetailView
              manga={currentManga}
              initialScrollTop={activeInitialScrollTop}
              onScrollPositionChange={handleViewScrollPositionChange}
              onBack={popActiveView}
              onOpenChapter={(chapterId) => openChapterInCurrentTab(currentManga.id, chapterId, 0)}
              onOpenChapterInNewTab={(chapterId) => openChapterInNewTab(currentManga.id, chapterId, 0)}
              onOpenChapterInBackgroundTab={(chapterId) => openChapterInNewTab(currentManga.id, chapterId, 0, { activate: false })}
              onToggleFavorite={handleToggleFavorite}
              onPickCover={handlePickCover}
              onOpenMetadataEditor={() => setEditingMetadata(currentManga)}
              onContextMenu={openContextMenu}
            />
          )}

          {activeView.screen === 'preview' && currentChapterData.manga && resolvedChapter && (
            <ChapterPreviewView
              manga={currentChapterData.manga}
              chapter={resolvedChapter}
              initialScrollTop={activeInitialScrollTop}
              onScrollPositionChange={handleViewScrollPositionChange}
              onBack={popActiveView}
              onReadFrom={(pageIndex) => pushViewToActive({
                screen: 'reader',
                mangaId: currentChapterData.manga.id,
                chapterId: resolvedChapter.id,
                pageIndex
              })}
              onReadFromNewTab={(pageIndex) => openNewTab({
                screen: 'reader',
                mangaId: currentChapterData.manga.id,
                chapterId: resolvedChapter.id,
                pageIndex
              }, [normalizeView(), { screen: 'manga', mangaId: currentChapterData.manga.id }, { screen: 'preview', mangaId: currentChapterData.manga.id, chapterId: resolvedChapter.id, pageIndex: 0 }])}
              onReadFromBackgroundTab={(pageIndex) => openNewTab({
                screen: 'reader',
                mangaId: currentChapterData.manga.id,
                chapterId: resolvedChapter.id,
                pageIndex
              }, [normalizeView(), { screen: 'manga', mangaId: currentChapterData.manga.id }, { screen: 'preview', mangaId: currentChapterData.manga.id, chapterId: resolvedChapter.id, pageIndex: 0 }], { activate: false })}
              onContextMenu={openContextMenu}
            />
          )}

          {activeView.screen === 'reader' && currentChapterData.manga && resolvedChapter && (
            <ReaderView
              manga={currentChapterData.manga}
              chapter={resolvedChapter}
              chapters={currentChapterData.manga.chapters ?? []}
              initialPageIndex={activeView.pageIndex}
              preferredMode={ui.readerMode}
              onExit={handleReaderExit}
              onOpenChapter={(chapterId) => replaceActiveView({
                screen: 'reader',
                mangaId: currentChapterData.manga.id,
                chapterId,
                pageIndex: 0
              })}
              onUpdateProgress={handleUpdateProgress}
              onContextMenu={openContextMenu}
            />
          )}

          {!currentManga && activeView.screen !== 'library' && (
            <section className="empty-card">
              <h3>Ce contenu n’est plus disponible</h3>
              <p>Le manga ou le chapitre lié à cet onglet n’existe plus dans la bibliothèque actuelle.</p>
              <div className="detail-actions-row" style={{ marginTop: 16 }}>
                <button className="ghost-button" onClick={popActiveView}>Retour</button>
                <button className="primary-button" onClick={() => replaceActiveView(normalizeView())}>Revenir à la bibliothèque</button>
              </div>
            </section>
          )}
        </div>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        ui={ui}
        onClose={() => setSettingsOpen(false)}
        onChange={handleUpdateSettings}
      />

      {editingMetadata && (
        <MetadataEditorModal
          manga={editingMetadata}
          onClose={() => setEditingMetadata(null)}
          onSave={handleSaveMetadata}
        />
      )}

      <ContextMenu menu={contextMenu} onClose={closeContextMenu} />
    </div>
  );
}

function MetadataEditorModal({ manga, onClose, onSave }) {
  const [form, setForm] = useState({
    title: manga.displayTitle || '',
    author: manga.author || '',
    description: manga.description || ''
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <h3>Éditer les métadonnées</h3>
        <label>
          Titre affiché
          <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
        </label>
        <label>
          Auteur
          <input value={form.author} onChange={(event) => setForm((prev) => ({ ...prev, author: event.target.value }))} />
        </label>
        <label>
          Description
          <textarea rows="5" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
        </label>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>Annuler</button>
          <button className="primary-button" onClick={() => onSave(manga.id, form)}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
