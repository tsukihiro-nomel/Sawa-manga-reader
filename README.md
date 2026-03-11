# Sawa Manga Library — v1.1.0

Sawa Manga Library est un lecteur/bibliothèque de mangas **local** pour PC, construit avec **Electron + React + Vite**.

L’application a été pensée pour une bibliothèque organisée par dossiers :

- un dossier = **une catégorie**
- dans la catégorie, un sous-dossier = **un manga**
- dans le manga, des sous-dossiers = **les chapitres**
- si le manga ne contient pas de sous-dossiers chapitre, il est traité comme **one-shot / chapitre unique**
- les pages sont les images numérotées à l’intérieur du chapitre

---

## 1. Fonctionnalités principales

### Bibliothèque
- import de catégories locales
- scan automatique des mangas/chapitres/pages
- recherche
- tri
- favoris
- récents
- catégories masquées / affichées
- couvertures personnalisées
- métadonnées locales : titre, auteur, description

### Onglets
- onglets multiples façon navigateur
- restauration des onglets au redémarrage
- fermeture d’onglet
- réorganisation drag & drop
- ouverture en arrière-plan avec clic molette

### Lecture
- mode **page simple**
- mode **double page**
- mode **webtoon / scroll vertical**
- zoom + / - / reset
- navigation chapitre précédent / suivant
- menu déroulant de sélection de chapitre
- masquage de l’UI en lecture
- plein écran

### Personnalisation
- thèmes : Dark Night, Light Paper, Coffee House, Neon City
- accent couleur personnalisable
- accent secondaire personnalisable
- tailles de cartes
- preview avant lecture activable / désactivable

### Progression
- suivi de progression par chapitre
- récents
- marquage **lu / non lu**
- réinitialisation de progression

---

## 2. Structure des dossiers attendue

```text
Categorie_A/
  Manga 1/
    Chapitre 1/
      1.jpg
      2.jpg
      3.png
    Chapitre 2/
      1.webp
      2.webp

  Manga 2/
    1.jpg
    2.jpg
    3.jpg
```

Dans ce cas :
- `Categorie_A` = une catégorie
- `Manga 1` = manga multi-chapitres
- `Manga 2` = one-shot

Formats d’images supportés par le scanner :
- jpg / jpeg
- png
- webp
- gif
- bmp
- avif
- jfif
- svg
- tif / tiff

---

## 3. Stack technique

### Frontend
- **React 18**
- CSS maison centralisé dans `src/styles/globals.css`
- `lucide-react` pour les icônes

### Desktop shell
- **Electron**
- preload sécurisé via `contextBridge`
- protocole custom `manga://local/...` pour charger les images locales

### Build web
- **Vite**

### Packaging Windows
- **electron-builder**
- sorties : `nsis`, `msi`, `portable`

### Watch du système de fichiers
- **chokidar**

### Drag & drop d’onglets
- **@dnd-kit/core**
- **@dnd-kit/sortable**
- **@dnd-kit/utilities**

---

## 4. Arborescence du projet

```text
electron/
  main.cjs
  preload.cjs
  services/
    storage.cjs
    watcher.cjs
    libraryScanner.cjs

src/
  App.jsx
  main.jsx
  components/
    ContextMenu.jsx
    ChapterPreviewView.jsx
    Icons.jsx
    LibraryView.jsx
    MangaDetailView.jsx
    ReaderView.jsx
    SettingsDrawer.jsx
    Sidebar.jsx
    TabsBar.jsx
    TitleBar.jsx
    TopBar.jsx
  styles/
    globals.css
  utils/
    reader.js

build/
  icon.ico
  icon.png
```

---

## 5. Méthodes utilisées dans l’application

### 5.1 Scan et indexation
Le service `libraryScanner.cjs` :
- parcourt les catégories enregistrées
- détecte les mangas
- détecte les chapitres
- détecte les pages images
- génère des identifiants stables à partir des chemins
- construit les sources `manga://local/...` pour l’affichage dans Electron

### 5.2 Persistance locale
Le service `storage.cjs` maintient un JSON d’état utilisateur avec :
- catégories
- session d’onglets
- UI
- métadonnées
- favoris
- statut lu / non lu
- progression
- récents

### 5.3 Watch des dossiers
Le watcher observe les catégories importées et force un refresh propre si :
- un manga est ajouté
- un chapitre est ajouté
- des pages changent

### 5.4 Navigation en onglets
Chaque onglet possède une **stack de vues** :
- bibliothèque
- détail manga
- preview chapitre
- lecteur

Cela permet un comportement proche d’un navigateur :
- retour dans l’historique local de l’onglet
- ouverture en arrière-plan
- restauration au redémarrage

### 5.5 Lecteur
Le lecteur gère :
- simple page
- double spread
- webtoon
- zoom
- changement de chapitre
- sauvegarde de progression
- masquage d’UI

### 5.6 Carrousel home
Le carrousel :
- choisit des mangas aléatoires à l’ouverture
- duplique logiquement les cartes pour un scroll infini
- supporte le scroll manuel par boutons et drag souris
- applique un petit effet de parallaxe au hover

### 5.7 Context menu
Le menu clic droit varie selon le contexte :
- application
- manga
- chapitre
- onglet
- lecteur

Exemples d’actions :
- ouvrir dans cet onglet
- ouvrir dans un nouvel onglet
- favoris
- marquer lu / non lu
- reset progression
- éditer les métadonnées
- changer la couverture

---

## 6. Installation

```bash
npm install
npm run dev
```

---

## 7. Build Windows

### EXE (NSIS)
```bash
npm run dist:exe
```

### MSI
```bash
npm run dist:msi
```

### Tous les builds Windows
```bash
npm run dist:win
```

### Dossier de sortie
```text
release/
```

---

## 8. Icône personnalisée

Place ton icône Windows ici :

```text
build/icon.ico
```

Optionnellement, garde aussi un PNG pour la doc / preview :

```text
build/icon.png
```

Puis relance un build.

---

## 9. Raccourcis utiles

### Lecture
- `←` / `→` : page précédente / suivante
- `Ctrl + ←` : chapitre précédent
- `Ctrl + →` : chapitre suivant
- `+` / `-` : zoom
- `0` : reset zoom
- `F` : plein écran
- `H` : afficher / masquer l’UI
- `Esc` : quitter la lecture

### Onglets
- clic molette sur manga / chapitre : ouvrir dans un nouvel onglet en arrière-plan
- clic molette sur onglet : fermeture
- `Ctrl + Z` : fermer l’onglet actif

---

## 10. Notes de design

Le projet vise une interface locale inspirée des apps manga/comics modernes :
- navigation rapide
- gros visuels
- lecteur immersif
- animation discrète
- ergonomie orientée collection personnelle

---

## 11. Limites actuelles

- pas de sync cloud
- pas d’OPDS
- pas de base distante
- pas de scraping automatique de métadonnées
- le statut lu / non lu est manuel

---

## 12. Évolutions possibles

- tags / collections intelligentes
- pin tabs
- duplication d’onglet
- préchargement du chapitre suivant
- cache image mémoire/disque plus poussé
- lecteur panel-by-panel
- import/export complet des préférences
