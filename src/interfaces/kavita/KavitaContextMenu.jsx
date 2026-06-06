import {
  Archive,
  BookOpen,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  FileInput,
  FolderOpen,
  Heart,
  Image,
  ListPlus,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Tag,
  Trash2
} from 'lucide-react';

function MenuButton({ icon: Icon, children, onClick, danger = false, disabled = false }) {
  return (
    <button type="button" className={danger ? 'is-danger' : ''} disabled={disabled} onClick={onClick}>
      <Icon size={15} /><span>{children}</span>
    </button>
  );
}

function Separator() {
  return <div className="kv-context-separator" role="separator" />;
}

export default function KavitaContextMenu({
  menu,
  actions,
  workspaces,
  activeWorkspaceId,
  onEdit,
  onOnlineMetadata,
  onClose,
  onError
}) {
  if (!menu?.context) return null;
  const context = menu.context;
  const run = (operation, confirmation) => async () => {
    if (confirmation && !window.confirm(confirmation)) return;
    onClose?.();
    try {
      await operation?.();
    } catch (error) {
      onError?.(error?.message || 'Cette action a echoue.');
    }
  };

  let content = null;
  if (context.type === 'manga' && context.manga) {
    const manga = context.manga;
    const chapterIds = (manga.chapters || []).map((chapter) => chapter.id).filter(Boolean);
    content = (
      <>
        <MenuButton icon={BookOpen} onClick={run(() => actions.onOpenManga(manga.id))}>Ouvrir</MenuButton>
        <MenuButton icon={Plus} onClick={run(() => actions.onOpenMangaInNewTab(manga.id))}>Ouvrir dans un nouvel onglet</MenuButton>
        <MenuButton icon={Shield} onClick={run(() => actions.onResumeMangaIncognito(manga.id))}>Reprendre en incognito</MenuButton>
        {manga.sourceWeb?.linked ? <MenuButton icon={ExternalLink} onClick={run(() => actions.onOpenSourceSeries(manga))}>Chapitres de la source web</MenuButton> : null}
        <Separator />
        <MenuButton icon={Heart} onClick={run(() => actions.onToggleFavorite(manga.id))}>{manga.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</MenuButton>
        <MenuButton icon={Check} onClick={run(() => actions.onSetMangaReadStatus(manga.id, !manga.isRead, chapterIds))}>{manga.isRead ? 'Marquer non lu' : 'Marquer lu'}</MenuButton>
        <MenuButton icon={Tag} onClick={() => { onEdit('tags', manga.id); onClose(); }}>Gerer les tags</MenuButton>
        <MenuButton icon={FolderOpen} onClick={() => { onEdit('collections', manga.id); onClose(); }}>Gerer les collections</MenuButton>
        <MenuButton icon={Edit3} onClick={() => { onEdit('metadata', manga.id); onClose(); }}>Modifier les metadata</MenuButton>
        <MenuButton icon={Search} onClick={() => { onOnlineMetadata(manga.id); onClose(); }}>Rechercher les metadata en ligne</MenuButton>
        <MenuButton icon={FileInput} onClick={run(() => actions.onImportComicInfo(manga.id))}>Importer ComicInfo</MenuButton>
        <MenuButton icon={Image} onClick={run(() => actions.onPickCover(manga.id))}>Choisir la couverture</MenuButton>
        <MenuButton icon={Edit3} onClick={run(() => actions.onQueueWorkbench(manga.id))}>Envoyer a l atelier metadata</MenuButton>
        <Separator />
        <MenuButton icon={ListPlus} onClick={run(() => actions.onAddMangaToQueue(manga.id))}>Ajouter a la queue</MenuButton>
        <MenuButton icon={ListPlus} onClick={run(() => actions.onAddNextToQueue(manga.id))}>Ajouter la suite detectee</MenuButton>
        <MenuButton icon={Archive} onClick={run(() => actions.onSetPrivateFlag(manga.id, !manga.isPrivate))}>{manga.isPrivate ? 'Retirer du coffre' : 'Envoyer au coffre'}</MenuButton>
        <Separator />
        <MenuButton icon={RefreshCw} danger onClick={run(() => actions.onResetMangaProgress(manga.id, chapterIds), `Reinitialiser la progression de "${manga.displayTitle}" ?`)}>Reinitialiser la progression</MenuButton>
        <MenuButton icon={Trash2} danger onClick={run(() => actions.onTrashManga(manga.id), `Supprimer "${manga.displayTitle}" de la bibliotheque ?`)}>Supprimer le manga</MenuButton>
      </>
    );
  }

  if (context.type === 'chapter' && context.manga && context.chapter) {
    const { manga, chapter } = context;
    content = (
      <>
        <MenuButton icon={BookOpen} onClick={run(() => actions.onOpenChapter(manga.id, chapter.id, 0))}>Ouvrir le chapitre</MenuButton>
        <MenuButton icon={Plus} onClick={run(() => actions.onOpenChapterInNewTab(manga.id, chapter.id, 0))}>Ouvrir dans un nouvel onglet</MenuButton>
        <MenuButton icon={Shield} onClick={run(() => actions.onOpenChapterIncognito(manga.id, chapter.id, 0))}>Ouvrir en incognito</MenuButton>
        <Separator />
        <MenuButton icon={Check} onClick={run(() => actions.onSetChapterReadStatus(manga.id, chapter.id, !chapter.isRead, chapter.pageCount))}>{chapter.isRead ? 'Marquer non lu' : 'Marquer lu'}</MenuButton>
        <MenuButton icon={ListPlus} onClick={run(() => actions.onAddChapterToQueue(manga.id, chapter.id))}>Ajouter a la queue</MenuButton>
        <MenuButton icon={ListPlus} onClick={run(() => actions.onAddNextChapterToQueue(manga.id, chapter.id))}>Ajouter la suite detectee</MenuButton>
        <MenuButton icon={RefreshCw} danger onClick={run(() => actions.onResetChapterProgress(chapter.id), 'Reinitialiser la progression de ce chapitre ?')}>Reinitialiser la progression</MenuButton>
      </>
    );
  }

  if (context.type === 'category' && context.category) {
    const category = context.category;
    content = (
      <>
        <MenuButton icon={FolderOpen} onClick={run(() => {
          actions.onSelectCategory(category.id);
          actions.onScreenChange('library');
        })}>Ouvrir la categorie</MenuButton>
        <MenuButton icon={Shield} onClick={run(() => actions.onToggleCategoryHidden(category.id))}>{category.hidden ? 'Afficher la categorie' : 'Masquer la categorie'}</MenuButton>
        <MenuButton icon={Trash2} danger onClick={run(() => actions.onRemoveCategory(category.id), `Retirer la categorie "${category.name}" ?`)}>Retirer la categorie</MenuButton>
      </>
    );
  }

  if (context.type === 'collection' && context.collection) {
    const collection = context.collection;
    content = (
      <>
        <MenuButton icon={FolderOpen} onClick={run(() => actions.onOpenCollection(collection))}>Ouvrir la collection</MenuButton>
        <MenuButton icon={Pin} onClick={run(() => actions.onToggleCollectionPin(collection))}>Epingler ou retirer de la barre</MenuButton>
      </>
    );
  }

  if (context.type === 'tab' && context.tab) {
    const tab = context.tab;
    content = (
      <>
        <MenuButton icon={Pin} onClick={run(() => actions.onToggleTabPin(tab.id))}>{tab.pinned ? 'Desepingler l onglet' : 'Epingler l onglet'}</MenuButton>
        <MenuButton icon={Copy} onClick={run(() => actions.onDuplicateTab(tab.id))}>Dupliquer l onglet</MenuButton>
        <MenuButton icon={Trash2} onClick={run(() => actions.onCloseOtherTabs(tab.id))}>Fermer les autres onglets</MenuButton>
        <MenuButton icon={Trash2} onClick={run(() => actions.onCloseTabsToRight(tab.id))}>Fermer les onglets a droite</MenuButton>
        {workspaces.filter((workspace) => workspace.id !== activeWorkspaceId).length ? <Separator /> : null}
        {workspaces.filter((workspace) => workspace.id !== activeWorkspaceId).map((workspace) => (
          <MenuButton key={workspace.id} icon={ExternalLink} onClick={run(() => actions.onMoveTabToWorkspace(tab.id, workspace.id))}>
            Deplacer vers {workspace.name}
          </MenuButton>
        ))}
      </>
    );
  }

  return (
    <div className="kv-context-backdrop" onClick={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div className="kv-context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
