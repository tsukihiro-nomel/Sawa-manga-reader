# Sawa Manga Library

Sawa Manga Library est un logiciel desktop local-first pour lire, organiser et proteger une bibliotheque manga sans dependance obligatoire au cloud.

Cette branche correspond a l'etat fonctionnel actuel de Sawa v3.x cote interface, lecture, navigation, metadata et privacy.

## Concept

Sawa essaye de reunir quatre idees dans un seul logiciel :

- une bibliotheque manga locale qui reste utilisable hors ligne
- une lecture premium avec plusieurs modes de lecture et une navigation rapide
- une organisation intelligente par tags, collections, recherche avancee et maintenance
- une privacy serieuse avec coffre, masquage comportemental et verrouillage rapide

Le logiciel est pense comme une application legere a l'usage, mais tres complete dans les details qui comptent au quotidien.

## Ce que le logiciel sait lire

Sawa scanne une bibliotheque locale organisee par dossiers, puis construit une vue unifiee par categories, mangas, chapitres et pages.

### Formats supportes

- dossiers de pages image
- fichiers `PDF`
- fichiers `CBZ`
- `ComicInfo.xml` embarque dans un `CBZ`
- `ComicInfo.xml` en sidecar a cote d'un manga ou d'un chapitre

### Formats d'image supportes

- `jpg`
- `jpeg`
- `png`
- `webp`
- `gif`
- `bmp`
- `avif`
- `jfif`
- `svg`
- `tif`
- `tiff`

## Structure de bibliotheque supportee

Exemple de structure reconnue :

```text
Categorie/
  Manga A/
    Chapitre 01/
      001.jpg
      002.jpg
    Chapitre 02.cbz
    Volume 03.pdf
    ComicInfo.xml

  Manga B/
    001.png
    002.png
```

Regles principales :

- le dossier racine importe comme categorie
- chaque sous-dossier direct devient un manga
- un sous-dossier contenant des images devient un chapitre
- un `PDF` devient un chapitre
- un `CBZ` devient un chapitre
- des images placees directement dans le dossier du manga sont traitees comme un chapitre unique / one-shot

## Philosophie local-first

Le logiciel fonctionne d'abord avec tes fichiers locaux.

- les scans, la progression, les favoris, les tags, les collections, les notes, la session et le coffre sont stockes localement
- les metadata en ligne restent optionnelles
- une fois importees, les donnees restent disponibles hors ligne
- les couvertures telechargees sont stockees localement
- le lecteur charge les pages a la demande pour garder l'application reactive

## Navigation globale

Sawa adopte une navigation plus proche d'un navigateur moderne que d'un lecteur mono-fenetre.

### Espaces de travail

- jusqu'a 8 espaces de travail
- rail d'icones a gauche des onglets
- creation d'un espace
- renommage d'un espace
- suppression d'un espace, sauf si c'est le dernier
- changement rapide avec `Alt+1` a `Alt+8`

### Onglets adaptatifs

- barre mono-ligne, sans scroll horizontal
- compression adaptative des onglets selon la largeur disponible
- densites visuelles `full`, `compact`, `minimal`
- compression extreme jusqu'au mode tres compact pour garder tous les onglets visibles
- drag and drop des onglets
- duplication d'onglet
- fermeture de l'onglet actif
- fermeture des autres onglets
- fermeture des onglets a droite
- epinglage / desepinglage
- deplacement d'un onglet vers un autre espace
- restauration de la session au redemarrage

### Ouverture et navigation rapide

- ouverture d'un manga dans l'onglet courant
- ouverture dans un nouvel onglet
- ouverture en arriere-plan au clic molette
- fermeture d'un onglet au clic molette
- navigation `Ctrl+Tab` et `Ctrl+Shift+Tab`
- mode incognito par onglet

## Ecrans principaux

### Dashboard

Le dashboard est la vue d'ensemble du logiciel.

Il propose :

- un hero de bienvenue
- des statistiques globales
- des actions rapides
- une section "continuer la lecture"
- une section "repris recemment"
- une section "ajoutes recemment"
- une section "nouveaux chapitres"
- une section "favoris"
- une section "termines"
- la personnalisation des blocs visibles
- le reordonnancement et le masquage de sections

### Bibliotheque

La bibliotheque est la vue principale de consultation.

Fonctions disponibles :

- grille virtualisee pour grosses bibliotheques
- carousel "a la une"
- recherche texte temps reel
- recherche avancee structuree
- tri multiple
- filtre par categorie
- categories masquees / affichees
- cartes de taille `compact`, `comfortable`, `large`
- ouverture via clic normal
- ouverture en arriere-plan via clic molette
- selection multiple
- barre d'actions en masse

### Favoris et Recents

Sawa fournit aussi des vues dediees pour :

- les mangas favoris
- les reprises / lectures recentes

Ces vues reutilisent la recherche, le tri, la selection multiple et les actions rapides.

### Collections

La page collections gere deux familles :

- collections manuelles
- collections intelligentes

Fonctions disponibles :

- creation de collection manuelle
- edition de collection manuelle
- suppression de collection manuelle
- ajout / retrait de mangas
- epinglage dans la sidebar
- vue detaillee d'une collection

### Entretien / Maintenance

Le centre d'entretien sert a trouver les elements a corriger.

Il remonte notamment :

- couvertures manquantes
- metadata manquantes
- chapitres suspects ou incomplets
- doublons probables
- file de l'atelier metadata
- volume du coffre
- memoire utilisee par l'application

Actions disponibles :

- ouvrir la fiche d'un manga problematique
- choisir une couverture
- envoyer vers l'atelier metadata
- lancer un rescan complet
- vider le cache

### Atelier metadata

L'atelier metadata est une file de travail pour traiter plusieurs mangas a la suite.

Fonctions disponibles :

- file de mangas en attente
- selection d'un manga courant
- relance de recherche metadata
- import d'une suggestion
- choix manuel d'une couverture
- ouverture rapide de la fiche manga
- suppression d'un manga de la file

### Coffre

Le coffre est une vue dediee aux contenus prives.

Il sert a :

- proteger des mangas individuels
- proteger des categories entieres
- retirer completement ces contenus de la bibliotheque normale
- retrouver ces contenus uniquement dans la vue coffre

Le coffre reprend l'ergonomie de la bibliotheque :

- recherche
- tri
- selection multiple
- grille de mangas
- filtre par categorie privee
- actions rapides

Quand le coffre est verrouille :

- le contenu n'est pas visible
- le compteur de titres prives n'est pas expose dans l'interface normale

## Scan, indexation et synchronisation locale

Le moteur de scan essaie d'etre rapide, resilient et stable.

### Capacites du scanner

- scan initial des categories locales
- detection automatique des mangas, chapitres et pages
- support mixte dossiers + `PDF` + `CBZ`
- generation d'un index de scan persistant
- detection des nouveaux chapitres
- lecture locale de `ComicInfo.xml`
- preservation des liaisons internes grace a des identites logiques plus stables qu'un simple chemin

### Watcher incrementiel

Le watcher observe les dossiers avec une logique de stabilisation :

- file d'evenements
- coalescing des changements
- petite fenetre de settle avant reanalyse
- limitation des refresh nerveux pendant des copies ou extractions
- rescan profond reserve a l'action manuelle

### Statuts de sante

Chaque conteneur peut etre classe :

- `ok`
- `warning`
- `error`
- `quarantined`

Un element en quarantaine reste visible, remonte dans les outils de maintenance, mais n'entraine pas de boucle de reanalyse agressive.

### Couvertures

Ordre de priorite observe dans le code :

- couverture choisie manuellement
- couverture telechargee en ligne
- couverture derivee automatiquement du premier chapitre
- premiere page PDF si necessaire
- fallback visuel

## Lecture

Le lecteur est le coeur du logiciel.

### Modes de lecture

- `single`
- `double`
- `manga-jp`
- `webtoon`

### Capacites du lecteur

- ouverture directe depuis la fiche manga
- ecran de preview de chapitre avant lecture
- ouverture d'un chapitre a une page donnee
- ouverture en nouvel onglet
- ouverture en incognito
- zoom avant
- zoom arriere
- reset zoom a `100%`
- modes d'ajustement `fit-width`, `fit-height`, `original`
- plein ecran
- changement de chapitre precedent / suivant
- panneau de fin de chapitre
- lecture continue vers le chapitre suivant
- prechargement du chapitre suivant
- memorisation de la position
- memorisation du zoom, du mode et du scroll webtoon
- auto-hide de l'UI apres inactivite
- masquage manuel de l'UI
- restitution correcte du focus clavier lors des changements d'onglet

### Navigation clavier du lecteur

- `ArrowLeft` / `ArrowRight` pour naviguer
- inversion logique en mode manga japonais
- `PageUp` / `PageDown` pour un deplacement par viewport
- scroll smooth en webtoon
- bascule de chapitre avec modificateur
- `F` pour le plein ecran
- `H` pour masquer / afficher l'UI
- `+`, `-`, `0` pour le zoom
- `Escape` pour sortir de la lecture

### Annotations / reperes

Le lecteur integre des annotations locales.

- ajout d'un repere sur une page
- note libre associee a une page
- suppression d'une annotation
- affichage des annotations triees par date

## Progression et historique

Sawa suit la progression a plusieurs niveaux.

### Au niveau chapitre

- page courante
- nombre de pages
- statut lu / en cours / jamais ouvert
- marquage lu manuel
- marquage non lu manuel
- reset de progression

### Au niveau manga

- progression agregee
- reprise automatique
- dernier chapitre / page lus
- detection de nouveaux chapitres

### Automatisation

- seuil de marquage comme lu configurable
- options `90%`, `95%`, `100%`
- historique recent
- reprise depuis la derniere position

## Recherche, filtres et tri

Sawa propose une recherche simple et une recherche avancee locale.

### Recherche texte

La recherche libre fouille notamment :

- titre affiche
- auteurs
- alias
- description
- tags
- collections

### Recherche avancee structuree

La barre de recherche accepte une mini-grammaire stable.

Champs supportes :

- `tag:`
- `status:`
- `favorite:`
- `private:`
- `author:`
- `collection:`
- `missing:`
- `chapters`
- `added`

Exemples utiles :

- `tag:romance`
- `status:unread`
- `favorite:true`
- `private:false`
- `author:"Inoue"`
- `collection:"Mes favoris"`
- `missing:cover`
- `chapters>10`
- `added<30`

Comportement :

- les tokens reconnus deviennent des filtres structures
- les tokens inconnus retombent en texte libre
- une syntaxe incomplete ne bloque jamais l'interface
- les filtres reconnus remontent en chips visuels
- la requete active peut etre sauvegardee directement en collection intelligente

### Tri

Le tri expose dans le code couvre :

- titre croissant
- titre decroissant
- lecture recente
- chapitres decroissants
- pages decroissantes
- favoris d'abord
- ajouts recents
- ajouts anciens
- progression decroissante
- progression croissante
- mise a jour recente

## Tags

Le systeme de tags est unifie.

Fonctions disponibles :

- creation de tags personnalises
- choix d'une couleur
- suppression d'un tag
- assignation a un manga
- retrait d'un tag
- toggle rapide
- ajout a plusieurs mangas
- affichage direct sur les cartes
- import automatique de genres comme tags depuis des sources externes

## Collections intelligentes

Sawa embarque des collections intelligentes pretes a l'emploi et permet d'en creer d'autres.

### Collections intelligentes integrees

- Continuer
- Non lus
- En cours
- Termines
- Favoris
- Ajoutes recemment
- Derniere lecture
- Nouveaux chapitres
- Sans couverture
- Sans metadonnees

### Regles supportees pour les smart collections

- etat de lecture
- favori
- tag
- collection
- sans cover
- sans metadata
- nouveaux chapitres
- ajoute recemment
- lu recemment
- recherche texte
- chapitres minimum
- chapitres maximum
- presence dans le coffre

Options disponibles :

- match `all` ou `any`
- tri dedie
- nom
- icone
- description
- couleur

## Fiche manga

Chaque manga dispose d'une fiche detaillee.

Fonctions visibles dans cette vue :

- hero avec couverture et actions principales
- reprise de lecture
- ouverture du premier chapitre
- favori
- edition metadata
- recherche / import metadata en ligne
- choix manuel de couverture
- informations detaillees
- description
- auteur
- statut
- nombre de chapitres
- progression
- categorie
- date d'ajout
- derniere lecture
- chemin local
- tags
- collections
- annotations / reperes
- tri de la liste de chapitres
- affichage progressif de la liste de chapitres avec bouton pour reveler la suite

## Metadata locales et en ligne

Sawa sait enrichir un manga a partir de plusieurs sources.

### Sources en ligne utilisees

- MangaDex
- AniList
- nHentai en option NSFW

### Recherche online

Chaque recherche peut afficher selon les sources :

- couverture
- titre
- titre japonais
- synopsis
- auteurs
- genres / tags
- note ou score si disponible
- origine de la source

### Import online

Le logiciel peut importer selon les donnees disponibles :

- titre online
- titre anglais
- titre japonais
- alias
- description
- auteur
- genres / tags
- source d'origine
- identifiants de source
- couverture telechargee localement

Quand nHentai est autorise :

- les resultats NSFW peuvent etre affiches
- les tags importes sont marques comme NSFW dans les metadata internes

### Editeur metadata

L'editeur metadata permet de modifier :

- titre affiche
- auteur
- description
- volume
- numero
- annee
- titres alternatifs

### Locks par champ

Chaque champ peut etre :

- libre
- verrouille

Le logiciel suit aussi la provenance de chaque champ :

- `manual`
- `comicinfo`
- `online`
- `scanner`

Priorite appliquee :

- manuel verrouille
- manuel
- ComicInfo
- online
- scanner

Regles de comportement :

- un champ vide peut etre rempli automatiquement
- un champ deja rempli n'est pas ecrase sans action explicite
- un champ verrouille ne bouge pas

### ComicInfo.xml

Le support `ComicInfo.xml` est bien present dans le code.

Capacites actuelles :

- lecture automatique pendant le scan
- lecture dans les `CBZ`
- lecture en sidecar local
- import manuel depuis le menu contextuel
- import manuel depuis l'editeur metadata

Champs pris en charge :

- `title`
- `series`
- `number`
- `volume`
- `summary`
- `writer`
- `artist`
- `genre`
- `year`

## Reading Queue et moteur "Next"

Sawa integre une reading queue discrete, en drawer overlay droit.

### Reading Queue

- drawer compact
- ferme par defaut
- n'elargit pas le contenu principal
- ouverture / fermeture via bouton dedie dans la title bar
- raccourci `Ctrl+Shift+Q`
- fermeture par `Esc`
- badge compteur
- reorder par drag and drop
- epinglage d'une entree
- suppression d'une entree
- ouverture directe d'une entree

### Structure logique de la queue

Le code gere :

- entree manga
- entree chapitre
- fusion des doublons
- conservation des provenances
- ordre manuel stable

Sources de provenance visibles :

- manuel
- ajout rapide
- fin de chapitre
- suite detectee

### Moteur "Next"

Le logiciel prepare aussi la suite de lecture en s'appuyant sur :

- metadata explicites si disponibles
- parsing des noms de fichiers / dossiers
- ordre naturel des chapitres

## Coffre et privacy

La privacy est un axe majeur du produit.

### Coffre prive

- activation par code PIN
- PIN minimum 4 caracteres
- verrouillage auto a la fermeture de l'application
- envoi d'un manga au coffre
- retrait d'un manga du coffre
- envoi d'une categorie entiere au coffre
- retrait d'une categorie du coffre
- disparition des categories privees de la bibliotheque normale
- acces rapide depuis le menu contextuel

### Niveau de protection

Le code prevoit deux modes :

- protection systeme Windows quand disponible
- fallback PIN local si la protection systeme n'est pas disponible

### Options de privacy

- flou des couvertures privees
- stealth mode
- verrouillage manuel du coffre
- panic lock
- neutralisation des vues privees
- neutralisation du titre de fenetre

### Panic lock

Le panic lock ne se contente pas de fermer un panneau.

Il :

- ferme les overlays
- ferme la queue
- masque les vues privees
- renvoie l'application vers un ecran neutre
- verrouille le coffre
- empeche la reouverture des overlays prives tant que la session n'est pas recuperee

### Incognito

Les onglets et lectures incognito servent a reduire les traces persistantes.

Le code prend en compte :

- onglet marque incognito
- ouverture incognito depuis le menu contextuel
- reprise en incognito

## Actions en masse

La selection multiple active une barre d'actions dediee.

Actions disponibles :

- marquer lu
- marquer non lu
- ajouter aux favoris
- retirer des favoris
- ajouter a une collection
- ajouter un tag
- envoyer a l'atelier metadata
- envoyer au coffre
- retirer du coffre
- vider la selection

## Menus contextuels

Le menu contextuel est adapte a l'entite cible.

### Sur un manga

- ouvrir
- ouvrir dans un nouvel onglet
- reprendre en incognito
- ajouter / retirer des favoris
- marquer lu / non lu
- reset progression
- rechercher des metadata en ligne
- importer ComicInfo
- choisir une couverture
- envoyer a l'atelier metadata
- gerer les collections
- gerer les tags
- envoyer au coffre / retirer du coffre
- supprimer localement de la bibliotheque

### Sur un chapitre

- ouvrir
- ouvrir ce chapitre dans un nouvel onglet
- ouvrir en incognito
- ouvrir le manga dans un nouvel onglet
- marquer ce chapitre lu / non lu
- reset progression

### Sur une categorie

- filtrer cette categorie
- ouvrir le coffre
- voir la categorie dans le coffre si elle est privee
- masquer / afficher la categorie
- retirer la categorie du scan

### Sur un espace

- basculer vers cet espace
- renommer cet espace
- supprimer cet espace

### Sur un onglet

- epingler / desepingler
- dupliquer
- fermer les autres
- fermer a droite
- deplacer vers un autre espace

### Sur l'interface globale

- plein ecran
- activer / desactiver l'incognito sur l'onglet courant
- ajouter la suite a la queue
- ouvrir le coffre
- basculer de theme rapidement

## Personnalisation et UI

L'UI est fortement parametrable sans casser l'idee d'une app legere.

### Themes

- Dark Night
- Light Paper
- Coffee House
- Neon City

### Couleurs

- couleur d'accent principale
- couleur de detail secondaire

### Fond d'ecran global

- image de fond personnalisable
- changement de l'image
- suppression de l'image
- opacite reglable
- extraction automatique de couleurs dominantes
- reutilisation des couleurs extraites comme accents

### Densite de la bibliotheque

- affichage des categories masquees
- preview de pages avant lecture
- taille de cartes configurable

## Parametres du lecteur

Parametres exposes dans les settings :

- seuil de lecture automatique
- lecture continue
- prechargement du chapitre suivant
- masquage automatique de l'UI
- direction de lecture par defaut
- rappel des fonctions de recherche avancee
- rappel de la reading queue

## Raccourcis clavier

Le logiciel permet d'enregistrer des raccourcis personnalises pour :

- page suivante
- page precedente
- chapitre suivant
- chapitre precedent
- plein ecran
- masquer / afficher l'UI
- zoom +
- zoom -
- zoom 100%
- quitter la lecture

## Sauvegarde, import et migration

Le logiciel integre un format de sauvegarde utilisateur.

### Sauvegardes `.sawa`

- export des donnees utilisateur
- import des donnees utilisateur
- transfert entre machines

Les sauvegardes contiennent notamment :

- progression
- favoris
- tags
- collections
- parametres
- session
- coffre
- metadata locales

Les fichiers manga eux-memes ne sont pas inclus.

### Migration et persistance

Le code gere :

- version de stockage globale
- migration de session legacy vers workspaces v2
- persistance de l'index de scan
- persistance de la queue
- persistance des metadata et de leurs locks
- cache en memoire pour accelerer les chargements

## Maintenance et robustesse

Au-dela des fonctions visibles, le logiciel integre plusieurs mecanismes de robustesse.

- cache disque local pour les pages `CBZ`
- limite de cache `CBZ` a `256 MB` par defaut
- invalidation automatique si le fichier change
- extraction a la demande uniquement
- cache non persistant entre redemarrages
- protocoles locaux `manga://local/...` et `manga://cbz/...`
- index compact pour bootstrap renderer
- splash screen de demarrage

## Stack technique

- Electron
- React
- Vite
- `@dnd-kit` pour le drag and drop
- `@tanstack/react-virtual` pour les longues listes / grilles
- `chokidar` pour la surveillance du filesystem

## Scripts disponibles

Scripts actuellement declares dans `package.json` :

```bash
npm install
npm run dev
npm run start
npm run build:web
npm run preview:web
npm run start:prod
npm run pack:dir
npm run dist:exe
npm run dist:msi
npm run dist:portable
npm run dist:win
```

### Notes de build

- le workflow de packaging configure dans le repo cible surtout Windows
- les sorties Windows sont produites via Electron Builder
- la logique applicative reste largement portable cote Electron / React, mais les scripts prets a l'emploi de cette branche sont axes Windows

## En bref

Sawa n'est pas seulement un lecteur de chapitres.

C'est a la fois :

- une bibliotheque locale intelligente
- un lecteur manga multi-modes
- un organiseur par tags, collections et recherche avancee
- un atelier de nettoyage metadata
- un coffre prive avec protection et masquage comportemental
- une application desktop a navigation type navigateur avec espaces et onglets

Si ton objectif est d'avoir une bibliotheque manga locale premium, rapide, hors ligne, configurable et discrete, c'est exactement le terrain que couvre cette version du logiciel.
