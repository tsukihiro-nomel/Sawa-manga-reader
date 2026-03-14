# Sawa Manga Library — v2.0.0

Sawa est un lecteur et gestionnaire de bibliothèque manga **100% local et hors ligne** pour Windows, construit avec **Electron + React + Vite**. Interface premium, lecture immersive, gestion avancée par tags et collections, métadonnées en ligne via MangaDex, et personnalisation poussée.

---

## Structure des dossiers

L'application scanne des dossiers organisés ainsi :

```
Catégorie/
  Manga 1/
    Chapitre 1/
      001.jpg
      002.jpg
    Chapitre 2/
      001.webp
      002.webp

  Manga 2 (one-shot)/
    001.png
    002.png
```

- **Dossier racine** = catégorie
- **Sous-dossier** = manga
- **Sous-sous-dossier** = chapitre
- **Pas de sous-dossier chapitre** = one-shot / chapitre unique

**Formats d'images supportés** : JPG, JPEG, PNG, WebP, GIF, BMP, AVIF, JFIF, SVG, TIF, TIFF

---

## Fonctionnalités

### Bibliothèque

- Import de catégories locales (dossiers)
- Scan automatique des mangas, chapitres et pages
- Détection automatique de nouveaux chapitres
- Recherche en temps réel (titres, auteurs, descriptions, tags, alias)
- Tri avancé : A→Z, Z→A, récemment lu, nombre de chapitres, nombre de pages, favoris d'abord, date d'ajout, progression, date de modification
- Favoris avec écran dédié
- Récents
- Catégories masquables / affichables
- Couvertures personnalisées (upload ou import en ligne)
- Métadonnées locales : titre, auteur, description, titres alternatifs
- Grille virtualisée pour les grandes bibliothèques
- Carousel de mise en avant sur la page d'accueil
- Taille des cartes configurable : compact, confortable, large

### Dashboard

- Vue d'ensemble avec statistiques de la bibliothèque :
  - Nombre total de mangas, en cours, non lus, terminés
  - Nombre de favoris et collections
  - Chapitres lus / total
  - Progression globale en pourcentage
- Accès rapide : Bibliothèque, Collections, Favoris, Non lus, Paramètres
- Sections intelligentes : Continue ta lecture, Ajoutés récemment, Nouveaux chapitres, Favoris, Lus récemment, Terminés
- Sections dynamiques (n'affiche que celles avec du contenu)

### Onglets

- Onglets multiples façon navigateur
- Restauration des onglets au redémarrage
- Réorganisation par drag & drop
- Ouverture en arrière-plan (clic molette)
- Fermeture par clic molette sur l'onglet
- Historique de navigation par onglet (retour arrière)

### Lecteur

- **Page simple** : une page à la fois
- **Double spread** : deux pages côte à côte (occidental)
- **Manga JP** : double page droite-à-gauche (japonais)
- **Webtoon** : scroll vertical continu
- Zoom avant / arrière / reset
- Navigation par chapitre (précédent / suivant)
- Sélecteur de chapitre en overlay
- Masquage automatique de l'UI après inactivité
- Plein écran
- Préchargement du chapitre suivant (3 dernières pages)
- Lecture continue automatique vers le chapitre suivant
- Direction de lecture configurable (gauche→droite ou droite→gauche)
- Modes d'ajustement : largeur, hauteur, taille originale
- Aperçu de chapitre (preview pleine page) optionnel avant lecture

### Progression

- Suivi de progression par chapitre (page courante / total)
- Marquage automatique comme lu (seuil configurable : 90%, 95%, 100%)
- Marquage manuel lu / non lu (par chapitre ou par manga)
- Réinitialisation de progression
- Historique de lecture avec horodatage
- Pourcentage de progression en temps réel
- Visualisation par points colorés : vert = lu, jaune = en cours, gris = non lu

### Tags (système unifié)

- Création de tags personnalisés avec choix de couleur (12 couleurs)
- Suppression de tags (nettoyage automatique des associations)
- Assignation / retrait de tags par manga via un modal dédié
- Import automatique des genres MangaDex comme tags (même système)
- Couleur déterministe basée sur le nom du genre
- Affichage sur les cartes : max 3 tags visibles + indicateur "+N"
- Tags affichés comme pilules colorées avec texte blanc

### Collections

#### Collections manuelles
- Création avec nom, description et couleur
- Ajout / retrait de mangas
- Suppression de collections

#### Collections intelligentes (auto-générées)
- Continue ta lecture
- Non lus
- En cours
- Terminés
- Favoris
- Ajoutés récemment (30 jours)
- Lus récemment (14 jours)
- Nouveaux chapitres détectés
- Sans couverture
- Sans métadonnées

### Métadonnées en ligne (MangaDex)

- Recherche par titre sur l'API MangaDex
- Aperçu des résultats : couverture, titre, auteurs, genres, synopsis, score
- Import sélectif : titre, synopsis, auteurs, genres, couverture, titres alternatifs
- Auto-import des genres comme tags
- Couverture téléchargée et stockée localement
- Options configurables : activer/désactiver, couvertures, descriptions, confirmation avant import
- Fonctionne entièrement hors ligne une fois les données importées

### Personnalisation

#### Thèmes
1. **Dark Night** — Fond noir profond avec contraste premium
2. **Light Paper** — Thème clair, lisible et épuré
3. **Coffee House** — Tons crème, cacao et verre fumé, ambiance cozy
4. **Neon City** — Fond encre sombre avec cyan électrique et effets cyberpunk

#### Couleurs
- Couleur d'accent principale (éléments interactifs)
- Couleur d'accent secondaire (dégradés, effets glow)
- Saisie directe en hexadécimal

#### Image de fond
- Choix d'une image personnalisée comme fond global
- Curseur d'opacité (0–100%) — le thème normal apparaît en fond quand l'opacité baisse
- Extraction automatique des couleurs dominantes de l'image
- Option d'appliquer les couleurs extraites comme accents
- Fonctionne avec tous les thèmes
- Aperçu en direct dans les paramètres

### Menu contextuel (clic droit)

Le menu varie selon le contexte :

**Sur un manga** : ouvrir, ouvrir dans un nouvel onglet, favoris, marquer lu/non lu, reset progression, éditer métadonnées, changer couverture, gérer tags, ajouter à une collection, supprimer

**Sur un chapitre** : lire, marquer lu/non lu, reset progression

**Sur un onglet** : fermer, fermer les autres, nouvel onglet

**Sur une catégorie** : sélectionner, masquer/afficher, retirer

### Sauvegarde & Export

- **Export .sawa** : exporte toutes les données utilisateur (progression, favoris, tags, collections, paramètres)
- **Import .sawa** : restaure depuis un fichier de sauvegarde
- Backup automatique avant chaque import
- Contenu : métadonnées uniquement (les fichiers manga ne sont pas inclus)
- Migration automatique v1 → v2 avec backup de sécurité

### Maintenance

- Rescan complet de la bibliothèque
- Vidage du cache
- Statistiques d'utilisation

---

## Raccourcis clavier

### Lecteur
| Raccourci | Action |
|-----------|--------|
| `←` / `→` | Page précédente / suivante |
| `Ctrl + ←` | Chapitre précédent |
| `Ctrl + →` | Chapitre suivant |
| `+` / `-` | Zoom avant / arrière |
| `0` | Reset zoom |
| `F` | Plein écran |
| `H` | Afficher / masquer l'UI |
| `Esc` | Quitter la lecture |

### Navigation
| Raccourci | Action |
|-----------|--------|
| Clic molette sur manga/chapitre | Ouvrir en arrière-plan |
| Clic molette sur onglet | Fermer l'onglet |
| `Ctrl + Z` | Fermer l'onglet actif |

Tous les raccourcis sont personnalisables dans les paramètres.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18, CSS custom, lucide-react |
| Desktop | Electron 30 |
| Build web | Vite 5 |
| Virtualisation | @tanstack/react-virtual |
| Drag & drop | @dnd-kit |
| Watch FS | chokidar |
| Packaging | electron-builder (NSIS, MSI, Portable) |

---

## Arborescence du projet

```
electron/
  main.cjs                    # Process principal Electron
  preload.cjs                 # Script preload sécurisé (contextBridge)
  services/
    storage.cjs               # Persistance JSON, tags, collections, backups
    libraryScanner.cjs        # Scan des dossiers, indexation, résolution tags
    watcher.cjs               # Surveillance du système de fichiers

src/
  App.jsx                     # Composant principal, gestion des onglets et état
  main.jsx                    # Point d'entrée React
  components/
    Dashboard.jsx             # Tableau de bord avec statistiques
    LibraryView.jsx           # Grille virtualisée + carousel
    MangaDetailView.jsx       # Détail manga, chapitres, métadonnées
    MangaCard.jsx             # Carte manga réutilisable
    ReaderView.jsx            # Lecteur multi-mode
    ChapterPreviewView.jsx    # Aperçu pleine page
    CollectionsView.jsx       # Navigateur de collections
    SettingsDrawer.jsx        # Panneau des paramètres
    TagManagerModal.jsx       # Modal d'assignation de tags
    Sidebar.jsx               # Navigation latérale
    TopBar.jsx                # Recherche, tri, filtres
    TitleBar.jsx              # Barre de titre avec onglets
    TabsBar.jsx               # Gestion des onglets
    ContextMenu.jsx           # Menus contextuels
    Icons.jsx                 # Définitions d'icônes
  styles/
    globals.css               # Tous les styles (thèmes, layouts, composants)
  utils/
    reader.js                 # Opérations manga, tri, filtrage

build/
  icon.ico                    # Icône Windows
  icon.png                    # Icône PNG
```

---

## Installation & développement

```bash
npm install
npm run dev
```

## Build Windows

```bash
# Installeur EXE (NSIS)
npm run dist:exe

# Installeur MSI
npm run dist:msi

# Tous les formats Windows
npm run dist:win
```

Dossier de sortie : `release/`

---

## Icône personnalisée

Place ton icône dans :
```
build/icon.ico
build/icon.png
```

---

## Limites (par design)

- Pas de sync cloud — 100% local
- Pas de protocole OPDS
- Pas de scraping automatique de métadonnées (recherche manuelle via MangaDex)
- Application conçue pour Windows

---

## Philosophie

Sawa est conçu comme une application locale, premium et respectueuse de la vie privée. Toutes les données restent sur la machine de l'utilisateur. L'interface s'inspire des meilleures apps manga/comics modernes : navigation rapide, gros visuels, lecture immersive, animations discrètes, et ergonomie orientée collection personnelle.
