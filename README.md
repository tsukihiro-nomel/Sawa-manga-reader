# Sawa Manga Library â€” v1.1.0

Sawa Manga Library est un lecteur/bibliothÃ¨que de mangas **local** pour PC, construit avec **Electron + React + Vite**.

Lâ€™application a Ã©tÃ© pensÃ©e pour une bibliothÃ¨que organisÃ©e par dossiers :

- un dossier = **une catÃ©gorie**
- dans la catÃ©gorie, un sous-dossier = **un manga**
- dans le manga, des sous-dossiers = **les chapitres**
- si le manga ne contient pas de sous-dossiers chapitre, il est traitÃ© comme **one-shot / chapitre unique**
- les pages sont les images numÃ©rotÃ©es Ã  lâ€™intÃ©rieur du chapitre

---

## 1. FonctionnalitÃ©s principales

### BibliothÃ¨que
- import de catÃ©gories locales
- scan automatique des mangas/chapitres/pages
- recherche
- tri
- favoris
- rÃ©cents
- catÃ©gories masquÃ©es / affichÃ©es
- couvertures personnalisÃ©es
- mÃ©tadonnÃ©es locales : titre, auteur, description

### Onglets
- onglets multiples faÃ§on navigateur
- restauration des onglets au redÃ©marrage
- fermeture dâ€™onglet
- rÃ©organisation drag & drop
- ouverture en arriÃ¨re-plan avec clic molette

### Lecture
- mode **page simple**
- mode **double page**
- mode **webtoon / scroll vertical**
- zoom + / - / reset
- navigation chapitre prÃ©cÃ©dent / suivant
- menu dÃ©roulant de sÃ©lection de chapitre
- masquage de lâ€™UI en lecture
- plein Ã©cran

### Personnalisation
- thÃ¨mes : Dark Night, Light Paper, Coffee House, Neon City
- accent couleur personnalisable
- accent secondaire personnalisable
- tailles de cartes
- preview avant lecture activable / dÃ©sactivable

### Progression
- suivi de progression par chapitre
- rÃ©cents
- marquage **lu / non lu**
- rÃ©initialisation de progression

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
- `Categorie_A` = une catÃ©gorie
- `Manga 1` = manga multi-chapitres
- `Manga 2` = one-shot

Formats dâ€™images supportÃ©s par le scanner :
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
- CSS maison centralisÃ© dans `src/styles/globals.css`
- `lucide-react` pour les icÃ´nes

### Desktop shell
- **Electron**
- preload sÃ©curisÃ© via `contextBridge`
- protocole custom `manga://local/...` pour charger les images locales

### Build web
- **Vite**

### Packaging Windows
- **electron-builder**
- sorties : `nsis`, `msi`, `portable`

### Watch du systÃ¨me de fichiers
- **chokidar**

### Drag & drop dâ€™onglets
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

## 5. MÃ©thodes utilisÃ©es dans lâ€™application

### 5.1 Scan et indexation
Le service `libraryScanner.cjs` :
- parcourt les catÃ©gories enregistrÃ©es
- dÃ©tecte les mangas
- dÃ©tecte les chapitres
- dÃ©tecte les pages images
- gÃ©nÃ¨re des identifiants stables Ã  partir des chemins
- construit les sources `manga://local/...` pour lâ€™affichage dans Electron

### 5.2 Persistance locale
Le service `storage.cjs` maintient un JSON dâ€™Ã©tat utilisateur avec :
- catÃ©gories
- session dâ€™onglets
- UI
- mÃ©tadonnÃ©es
- favoris
- statut lu / non lu
- progression
- rÃ©cents

### 5.3 Watch des dossiers
Le watcher observe les catÃ©gories importÃ©es et force un refresh propre si :
- un manga est ajoutÃ©
- un chapitre est ajoutÃ©
- des pages changent

### 5.4 Navigation en onglets
Chaque onglet possÃ¨de une **stack de vues** :
- bibliothÃ¨que
- dÃ©tail manga
- preview chapitre
- lecteur

Cela permet un comportement proche dâ€™un navigateur :
- retour dans lâ€™historique local de lâ€™onglet
- ouverture en arriÃ¨re-plan
- restauration au redÃ©marrage

### 5.5 Lecteur
Le lecteur gÃ¨re :
- simple page
- double spread
- webtoon
- zoom
- changement de chapitre
- sauvegarde de progression
- masquage dâ€™UI

### 5.6 Carrousel home
Le carrousel :
- choisit des mangas alÃ©atoires Ã  lâ€™ouverture
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

Exemples dâ€™actions :
- ouvrir dans cet onglet
- ouvrir dans un nouvel onglet
- favoris
- marquer lu / non lu
- reset progression
- Ã©diter les mÃ©tadonnÃ©es
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

## 8. IcÃ´ne personnalisÃ©e

Place ton icÃ´ne Windows ici :

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
- `â†` / `â†’` : page prÃ©cÃ©dente / suivante
- `Ctrl + â†` : chapitre prÃ©cÃ©dent
- `Ctrl + â†’` : chapitre suivant
- `+` / `-` : zoom
- `0` : reset zoom
- `F` : plein Ã©cran
- `H` : afficher / masquer lâ€™UI
- `Esc` : quitter la lecture

### Onglets
- clic molette sur manga / chapitre : ouvrir dans un nouvel onglet en arriÃ¨re-plan
- clic molette sur onglet : fermeture
- `Ctrl + Z` : fermer lâ€™onglet actif

---

## 10. Notes de design

Le projet vise une interface locale inspirÃ©e des apps manga/comics modernes :
- navigation rapide
- gros visuels
- lecteur immersif
- animation discrÃ¨te
- ergonomie orientÃ©e collection personnelle

---

## 11. Limites actuelles

- pas de sync cloud
- pas dâ€™OPDS
- pas de base distante
- pas de scraping automatique de mÃ©tadonnÃ©es
- le statut lu / non lu est manuel

---

## 12. Ã‰volutions possibles

- tags / collections intelligentes
- pin tabs
- duplication dâ€™onglet
- prÃ©chargement du chapitre suivant
- cache image mÃ©moire/disque plus poussÃ©
- lecteur panel-by-panel
- import/export complet des prÃ©fÃ©rences
