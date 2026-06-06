import { memo, useCallback, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Expand,
  HelpCircle,
  Maximize2,
  MessageSquareText,
  Minus,
  Plus,
  Settings2,
  SlidersHorizontal,
  Square,
  X
} from 'lucide-react';
import useReaderController from './useReaderController.js';
import { ReaderRenderer } from './readerRenderers.jsx';
import KavitaTabsBar from './KavitaTabsBar.jsx';

function RangeField({ label, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <label className="kv-reader-range">
      <span>{label}<strong>{value}{suffix}</strong></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="kv-reader-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function KavitaReaderShell({
  manga,
  chapter,
  chapters = [],
  annotations = [],
  initialPageIndex = 0,
  autoHideUI,
  readerSettings,
  shortcuts,
  tabs = [],
  activeTabId,
  overlayPinned = false,
  onExit,
  onOpenChapter,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onReorderTabs,
  onTabContextMenu,
  onUpdateProgress,
  onReaderSettingsChange,
  onAddAnnotation,
  onDeleteAnnotation
}) {
  const controller = useReaderController({
    manga,
    chapter,
    chapters,
    initialPageIndex,
    autoHideUI,
    readerSettings,
    shortcuts,
    overlayPinned,
    onExit,
    onOpenChapter,
    onUpdateProgress,
    onReaderSettingsChange
  });
  const pointerStartRef = useRef(null);
  const suppressStageClickRef = useRef(false);
  const [noteDraft, setNoteDraft] = useState('');
  const chapterAnnotations = annotations.filter((entry) => entry.chapterId === chapter.id);

  const handleStageClick = useCallback((event) => {
    if (suppressStageClickRef.current) {
      suppressStageClickRef.current = false;
      return;
    }
    if (event.target.closest('button, input, select, textarea, label, .kv-reader-settings, .kv-reader-secondary')) return;
    controller.setOverlaysVisible((value) => !value);
  }, [controller]);

  function handlePointerDown(event) {
    pointerStartRef.current = null;
    if (!controller.swipeEnabled) return;
    if (event.target.closest('button, input, select, textarea, label, .kv-tabsbar, .kv-reader-settings, .kv-reader-secondary')) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || !controller.swipeEnabled) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    suppressStageClickRef.current = true;
    if (deltaX < 0) controller.next();
    else controller.previous();
  }

  async function addBookmark() {
    await onAddAnnotation?.({
      mangaId: manga.id,
      chapterId: chapter.id,
      pageIndex: controller.pageIndex,
      label: `Page ${controller.pageIndex + 1}`,
      note: noteDraft.trim()
    });
    setNoteDraft('');
  }

  return (
    <section
      className={`kv-reader-shell ${controller.overlaysVisible ? 'has-overlays' : ''}`}
      data-reader-interface="kavita"
      onClick={handleStageClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className="kv-reader-canvas">
        <ReaderRenderer
          pages={controller.pages}
          pageIndex={controller.pageIndex}
          mode={controller.mode}
          fitMode={controller.fitMode}
          zoom={controller.zoom}
          brightness={controller.brightness}
          widthOverride={controller.widthOverride}
          splitDirection={controller.splitDirection}
          pageOffset={controller.pageOffset}
          emulateBook={controller.emulateBook}
          onVisiblePageChange={controller.goToPage}
          webtoonRootRef={controller.webtoonRootRef}
        />
      </div>

      <div className="kv-reader-top-chrome">
        <KavitaTabsBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onNewTab={onNewTab}
          onReorderTabs={onReorderTabs}
          onContextMenu={onTabContextMenu}
          compact
        />
        <header className="kv-reader-top-overlay">
        <button type="button" className="kv-reader-overlay-button" onClick={onExit} title="Quitter"><ArrowLeft size={19} /></button>
        <div className="kv-reader-title">
          <strong>{manga.displayTitle || manga.name}</strong>
          <span>{chapter.displayTitle || chapter.name} · progression serie {manga.progressPercent || 0}%</span>
        </div>
        <div className="kv-reader-overlay-actions">
          <button type="button" className="kv-reader-overlay-button" title="Aide"><HelpCircle size={18} /></button>
          <button type="button" className="kv-reader-overlay-button" onClick={addBookmark} title="Ajouter un repere"><Bookmark size={18} /></button>
          <button type="button" className="kv-reader-overlay-button" onClick={() => window.mangaAPI.minimizeWindow()} title="Minimiser"><Minus size={18} /></button>
          <button type="button" className="kv-reader-overlay-button" onClick={() => window.mangaAPI.toggleMaximizeWindow()} title="Agrandir"><Square size={15} /></button>
          <button type="button" className="kv-reader-overlay-button" onClick={() => window.mangaAPI.closeWindow()} title="Fermer"><X size={18} /></button>
        </div>
        </header>
      </div>

      <footer className="kv-reader-bottom-overlay">
        <div className="kv-reader-navigation">
          <button type="button" className="kv-reader-overlay-button" onClick={controller.previous} disabled={!controller.previousChapter && controller.pageIndex <= 0}><ChevronLeft size={20} /></button>
          <span>{controller.pageIndex + 1}</span>
          <input
            aria-label="Page"
            type="range"
            min="0"
            max={Math.max(0, controller.pages.length - 1)}
            value={controller.pageIndex}
            onChange={(event) => controller.goToPage(Number(event.target.value))}
          />
          <span>{controller.pages.length}</span>
          <button type="button" className="kv-reader-overlay-button" onClick={controller.next} disabled={!controller.nextChapter && controller.pageIndex >= controller.pages.length - controller.pageStep}><ChevronRight size={20} /></button>
        </div>
        <div className="kv-reader-bottom-actions">
          <button type="button" className="kv-reader-overlay-button" onClick={() => controller.setZoom(controller.zoom - 0.1)} title="Dezoomer"><Minus size={18} /></button>
          <span className="kv-reader-zoom-label">{Math.round(controller.zoom * 100)}%</span>
          <button type="button" className="kv-reader-overlay-button" onClick={() => controller.setZoom(controller.zoom + 0.1)} title="Zoomer"><Plus size={18} /></button>
          <button type="button" className="kv-reader-overlay-button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} title="Plein ecran"><Maximize2 size={18} /></button>
          <button type="button" className="kv-reader-overlay-button" onClick={() => controller.setSecondaryOpen((value) => !value)} title="Notes et reperes"><MessageSquareText size={18} /></button>
          <button type="button" className={`kv-reader-overlay-button ${controller.settingsOpen ? 'is-active' : ''}`} onClick={() => controller.setSettingsOpen((value) => !value)} title="Reglages"><Settings2 size={18} /></button>
        </div>
      </footer>

      {controller.settingsOpen ? (
        <aside className="kv-reader-settings" onClick={(event) => event.stopPropagation()}>
          <div className="kv-reader-settings-header"><strong>Reglages de lecture</strong><SlidersHorizontal size={18} /></div>
          <div className="kv-reader-settings-grid">
            <label>
              <span>Decoupage</span>
              <select value={controller.splitDirection} onChange={(event) => controller.setSplitDirection(event.target.value)}>
                <option value="none">Desactive</option>
                <option value="left">Gauche puis droite</option>
                <option value="right">Droite puis gauche</option>
              </select>
            </label>
            <label>
              <span>Mise a l echelle</span>
              <select value={controller.fitMode} onChange={(event) => controller.setFitMode(event.target.value)}>
                <option value="fit-height">Hauteur</option>
                <option value="fit-width">Largeur</option>
                <option value="original">Taille originale</option>
              </select>
            </label>
            <label>
              <span>Disposition</span>
              <select value={controller.mode} onChange={(event) => controller.setMode(event.target.value)}>
                <option value="single">Page simple</option>
                <option value="double-ltr">Double LTR</option>
                <option value="double-rtl">Double manga RTL</option>
                <option value="split">Image decoupee</option>
                <option value="webtoon">Webtoon</option>
              </select>
            </label>
            <RangeField label="Luminosite" value={controller.brightness} min={20} max={140} suffix="%" onChange={controller.setBrightness} />
            <RangeField label="Largeur forcee" value={controller.widthOverride} min={0} max={100} suffix="%" onChange={controller.setWidthOverride} />
            <ToggleField label="Fermer automatiquement" checked={controller.autoClose} onChange={controller.setAutoClose} />
            <ToggleField label="Gestes de swipe" checked={controller.swipeEnabled} onChange={controller.setSwipeEnabled} />
            <ToggleField label="Emuler un livre" checked={controller.emulateBook} onChange={controller.setEmulateBook} />
            <ToggleField label="Decalage de page" checked={controller.pageOffset} onChange={controller.setPageOffset} />
          </div>
        </aside>
      ) : null}

      {controller.secondaryOpen ? (
        <aside className="kv-reader-secondary" onClick={(event) => event.stopPropagation()}>
          <div className="kv-reader-settings-header"><strong>Notes et reperes</strong><Expand size={18} /></div>
          <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Note pour cette page..." rows="3" />
          <button type="button" className="kv-reader-save-note" onClick={addBookmark}>Ajouter le repere</button>
          <div className="kv-reader-note-list">
            {chapterAnnotations.map((annotation) => (
              <article key={annotation.id}>
                <button type="button" onClick={() => controller.goToPage(Number(annotation.pageIndex || 0))}>
                  <strong>{annotation.label || `Page ${Number(annotation.pageIndex || 0) + 1}`}</strong>
                  <span>{annotation.note || 'Sans note'}</span>
                </button>
                <button type="button" onClick={() => onDeleteAnnotation?.(manga.id, annotation.id)}>Supprimer</button>
              </article>
            ))}
          </div>
        </aside>
      ) : null}
    </section>
  );
}

export default memo(KavitaReaderShell);
