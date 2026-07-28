---
stepsCompleted: [1, 2]
inputDocuments: []
session_topic: 'Fonctions potentielles pour enrichir Sawa'
session_goals: 'Créer un grand catalogue d’idées pratiques et intéressantes, y compris des fonctions Internet ou IA facultatives et des éléments observables à corriger ou déboguer, sans modifier le logiciel'
selected_approach: 'progressive-flow'
techniques_used: ['Morphological Analysis', 'Mind Mapping', 'Cross-Pollination', 'Six Thinking Hats']
ideas_generated: 70
shortlisted_ideas: [5, 8]
discarded_ideas: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50]
retained_corrections: [C1, C2, C3, C4, C5, C6, C7, C8]
context_file: ''
---

# Résultats de la session de brainstorming

**Facilitateur :** evcam
**Date :** 2026-07-26 23:40:28 +02:00

## Vue d’ensemble de la session

**Sujet :** Fonctions potentielles pour enrichir Sawa.

**Objectifs :** Produire un grand catalogue d’idées couvrant les usages essentiels, avancés et expérimentaux. Les fonctions connectées à Internet ou à l’IA peuvent être proposées si elles restent facultatives. Cette phase est strictement exploratoire : aucune modification du logiciel.

### Cadre

- Préserver les performances, la stabilité et la fluidité obtenues.
- Favoriser le fonctionnement local et privé par défaut.
- Distinguer clairement les fonctions locales des services facultatifs connectés.
- Explorer largement avant toute priorisation ou implémentation.
- Rechercher en lecture seule les fragilités, incohérences et dettes techniques susceptibles de nécessiter une correction ou un débogage.

## Sélection des techniques

**Approche :** Exploration progressive, de la divergence à la consolidation.

- **Phase 1 — Exploration :** Analyse morphologique pour couvrir systématiquement toutes les surfaces de Sawa.
- **Phase 2 — Organisation :** Mind Mapping pour regrouper les idées en familles cohérentes.
- **Phase 3 — Enrichissement :** Cross-Pollination avec les liseuses, médiathèques, outils de productivité, jeux et applications multimédias.
- **Phase 4 — Consolidation :** Six Thinking Hats pour ajouter bénéfices, limites et conditions sans basculer vers l’implémentation.

Une piste parallèle en lecture seule recensera les éléments réellement observables à corriger ou déboguer.

## Résultats de l’exploration

### Phase 1 — Analyse morphologique

#### Élément 1 : acquisition et fiabilisation du contenu

**[Acquisition #1] : Boîte de réception manga**
_Concept :_ Un dossier d’arrivée surveillé reçoit les nouveaux mangas, mais Sawa ne les range pas immédiatement. Il affiche d’abord une fiche de contrôle avec titre détecté, format, chapitres, couverture, doublons possibles et catégorie proposée.
_Nouveauté :_ L’import devient un sas de validation comparable à une boîte de réception, plutôt qu’un scan opaque qui transforme immédiatement la bibliothèque.

**[Acquisition #2] : Recettes d’import réutilisables**
_Concept :_ L’utilisateur enregistre des règles comme « fichiers CBZ de ce dossier vers cette catégorie, titre depuis ComicInfo.xml, ignorer les extras ». Une recette peut être appliquée manuellement ou automatiquement à une source précise.
_Nouveauté :_ Les règles sont liées au contexte d’origine, ce qui évite une configuration globale trop rigide.

**[Acquisition #3] : Import transactionnel avec annulation**
_Concept :_ Chaque import devient une opération journalisée pouvant être annulée : créations de dossiers, renommages, métadonnées et associations web sont restaurés à leur état précédent. L’historique montre exactement ce qui a changé.
_Nouveauté :_ Une opération de masse cesse d’être irréversible sans nécessiter une restauration complète de sauvegarde.

**[Acquisition #4] : Simulation avant scan**
_Concept :_ Un mode « aperçu » indique combien de mangas, chapitres, suppressions, déplacements et conflits seraient détectés sans modifier l’index. L’utilisateur peut exclure une partie des changements avant de confirmer.
_Nouveauté :_ Le scanner devient explicable et prévisible, particulièrement utile pour les bibliothèques réseau ou réorganisées.

**[Acquisition #5] : Suivi des déplacements par empreinte**
_Concept :_ Si un manga ou un chapitre change de dossier, Sawa le reconnaît grâce à une empreinte de contenu et conserve progression, favoris, annotations et liens web. Une confiance faible déclenche une confirmation.
_Nouveauté :_ L’identité du contenu ne dépend plus principalement de son chemin sur le disque.
_Statut :_ Retenue dans la liste des fonctions candidates à ajouter.

**[Acquisition #6] : Centre de conflits**
_Concept :_ Toutes les ambiguïtés — titres identiques, numéros en double, métadonnées contradictoires, fichiers endommagés — arrivent dans une file dédiée. Chaque conflit propose plusieurs résolutions avec aperçu des conséquences.
_Nouveauté :_ Les erreurs ne sont ni silencieuses ni bloquantes ; elles deviennent une liste de décisions différables.

**[Acquisition #7] : Provenance complète des métadonnées**
_Concept :_ Chaque champ indique son origine : nom de dossier, ComicInfo, saisie manuelle, AniList, MangaDex ou autre source. L’utilisateur peut verrouiller un champ et revenir à une valeur antérieure.
_Nouveauté :_ La fiche manga devient un historique vérifiable plutôt qu’un état final difficile à comprendre.

**[Acquisition #8] : Détection intelligente des éditions**
_Concept :_ Sawa distingue les doublons exacts des éditions alternatives : couleur, deluxe, traduction différente, scanlation ou réédition. Les éditions peuvent partager une œuvre canonique tout en conservant leurs fichiers et progressions propres.
_Nouveauté :_ Le système ne force plus le choix simpliste entre « doublon » et « manga totalement distinct ».
_Statut :_ Retenue dans la liste des fonctions candidates à ajouter.

**[Acquisition #9] : Quarantaine non bloquante**
_Concept :_ Les archives illisibles, PDF incomplets et structures inconnues restent visibles dans une zone de quarantaine avec diagnostic, tentative de réparation et ouverture du dossier. Le reste de la bibliothèque continue de fonctionner normalement.
_Nouveauté :_ Un contenu défectueux devient localisé et explicable sans perturber les mangas sains.

**[Acquisition #10] : Import express par glisser-déposer**
_Concept :_ Déposer des fichiers ou dossiers sur Sawa ouvre une mini-fenêtre avec destination, mode copie/déplacement/référence et résultat attendu. Les opérations lourdes sont mises en file et restent annulables.
_Nouveauté :_ L’import rapide conserve les garanties d’un vrai gestionnaire de tâches au lieu de devenir une exception risquée.

#### Élément 2 : expérience de lecture

**[Lecture #11] : Reprise intelligente**
_Concept :_ À la réouverture d’un manga, Sawa propose de reprendre exactement à la dernière case, à la dernière page ou au début du chapitre selon la durée d’interruption. Un aperçu discret rappelle les deux pages précédentes sans révéler la suite.
_Nouveauté :_ La reprise tient compte du contexte temporel plutôt que d’appliquer une position unique et mécanique.

**[Lecture #12] : Profils de lecture par série**
_Concept :_ Chaque série peut mémoriser son sens de lecture, zoom, luminosité, découpage des doubles pages et mode vertical. Les réglages globaux restent le point de départ, avec seulement les exceptions enregistrées.
_Nouveauté :_ Le lecteur s’adapte automatiquement aux particularités éditoriales sans multiplier les manipulations.

**[Lecture #13] : Détecteur de doubles pages**
_Concept :_ Sawa analyse localement les dimensions et la continuité visuelle pour proposer l’assemblage de deux pages ou la séparation d’une double page mal découpée. La proposition reste réversible et peut être mémorisée par chapitre.
_Nouveauté :_ Le système traite aussi bien les doubles pages séparées que celles stockées dans une seule image.

**[Lecture #14] : Navigation anti-spoiler**
_Concept :_ Les miniatures futures, titres de chapitres et indicateurs de progression peuvent être masqués jusqu’à leur lecture. La navigation reste possible avec des repères neutres comme « chapitre suivant ».
_Nouveauté :_ La protection couvre toute l’interface, pas uniquement la page actuellement affichée.

**[Lecture #15] : Marqueur de page défectueuse**
_Concept :_ Un bouton permet de signaler une page floue, inversée, manquante ou mal orientée pendant la lecture. Les signalements alimentent une liste de maintenance avec accès direct au fichier concerné.
_Nouveauté :_ Le lecteur devient lui-même un outil de contrôle qualité sans interrompre la session.

**[Lecture #16] : Comparateur d’éditions**
_Concept :_ Deux éditions ou traductions d’une même œuvre peuvent être synchronisées page par page dans une vue côte à côte. L’utilisateur choisit ponctuellement la meilleure version ou compare traduction, couleur et qualité.
_Nouveauté :_ Cette fonction exploite directement le futur regroupement des éditions alternatives retenu dans l’idée #8.

**[Lecture #17] : Couches d’annotations**
_Concept :_ Notes, favoris de pages, traductions personnelles et remarques peuvent être placés dans des couches activables séparément. Une couche peut rester privée ou être exportée indépendamment du manga.
_Nouveauté :_ Les annotations deviennent un système composable plutôt qu’une liste unique attachée à la série.

**[Lecture #18] : Mode concentration adaptatif**
_Concept :_ L’interface réduit progressivement les contrôles inutiles lorsque la lecture se poursuit, puis les fait réapparaître selon les mouvements ou raccourcis. Le comportement est configurable et désactivable.
_Nouveauté :_ Le mode immersif évolue avec l’activité réelle au lieu d’être seulement un interrupteur plein écran.

**[Lecture #19] : Repères de session**
_Concept :_ L’utilisateur peut définir « lire deux chapitres » ou « lire pendant 25 minutes » et recevoir un bilan discret, sans blocage ni mécanisme culpabilisant. Une pause visuelle peut être proposée lors des longues sessions.
_Nouveauté :_ L’objectif soutient le confort et la gestion du temps sans gamification agressive.

**[Lecture #20] : Préparation hors ligne**
_Concept :_ Avant une session sur ordinateur portable, Sawa vérifie que couvertures, pages distantes autorisées et métadonnées nécessaires sont disponibles localement. Il indique précisément ce qui manquera sans connexion.
_Nouveauté :_ Le mode hors ligne est vérifiable à l’avance plutôt que découvert au moment de la lecture.

#### Élément 3 : découverte personnelle et mémoire de lecture

**[Découverte #21] : Redécouverte locale**
_Concept :_ Sawa remonte des œuvres oubliées selon la date de dernière lecture, l’avancement et les goûts observés, sans appel réseau. Les propositions expliquent pourquoi elles réapparaissent.
_Nouveauté :_ Le système valorise d’abord la bibliothèque déjà possédée avant de recommander de nouveaux titres.

**[Découverte #22] : Recherche par humeur**
_Concept :_ L’utilisateur demande une lecture « courte et légère », « mystérieuse sans violence » ou « longue aventure déjà bien avancée ». Les résultats combinent métadonnées, historique et tags personnels.
_Nouveauté :_ La recherche part de l’expérience souhaitée plutôt que d’un titre ou d’un genre rigide.

**[Découverte #23] : ADN narratif**
_Concept :_ Une carte décrit les dimensions d’une œuvre — rythme, densité, tonalité, romance, humour, tension, complexité — avec réglage manuel possible. La comparaison permet de trouver des œuvres proches sur certaines dimensions seulement.
_Nouveauté :_ La similarité devient multidimensionnelle et explicable, pas un simple « titres similaires ».

**[Découverte #24] : Parcours thématiques**
_Concept :_ L’utilisateur construit une séquence comme une playlist : cinq one-shots, évolution d’un auteur, différentes adaptations d’un mythe ou progression du léger vers le sombre. La prochaine lecture est suggérée sans démarrer automatiquement.
_Nouveauté :_ L’ordre des œuvres devient un objet éditorial personnel.

**[Découverte #25] : Constellation de bibliothèque**
_Concept :_ Une vue visuelle locale relie séries, auteurs, univers, éditions, tags et habitudes de lecture. Les zones isolées et les groupes inattendus deviennent explorables.
_Nouveauté :_ La bibliothèque est présentée comme un réseau de relations plutôt que comme une succession de grilles.

**[Découverte #26] : Pourquoi cette suggestion ?**
_Concept :_ Chaque recommandation affiche deux ou trois raisons modifiables : auteur apprécié, tonalité similaire, format court ou thème recherché. L’utilisateur peut corriger une raison sans faire disparaître immédiatement la proposition.
_Nouveauté :_ Le retour affine le profil tout en conservant la stabilité visuelle de la liste courante.

**[Découverte #27] : Recherche sémantique dans les pages**
_Concept :_ Avec OCR local facultatif, l’utilisateur retrouve une scène à partir d’un souvenir comme « la discussion sous la pluie ». Les résultats restent limités aux œuvres déjà lues pour éviter les spoilers.
_Nouveauté :_ La mémoire approximative devient une porte d’entrée, avec une barrière de spoiler intégrée.

**[Découverte #28] : Journal automatique privé**
_Concept :_ Sawa compose localement une chronologie : œuvres commencées, reprises, abandonnées, terminées et annotations marquantes. L’utilisateur peut compléter ou supprimer chaque entrée.
_Nouveauté :_ L’historique technique de progression devient un véritable journal personnel contrôlé.

**[Découverte #29] : Concierge de métadonnées facultatif**
_Concept :_ Une fonction Internet/IA opt-in recherche uniquement les champs manquants, propose plusieurs sources et met les résultats en cache. Avant tout appel payant, Sawa affiche le fournisseur, les données envoyées et une estimation du coût.
_Nouveauté :_ L’IA intervient comme assistant ponctuel et transparent, jamais comme dépendance permanente.

**[Découverte #30] : Capsule temporelle**
_Concept :_ L’utilisateur programme la réapparition future d’un manga, d’une annotation ou d’une liste — par exemple « me le reproposer dans six mois ». La capsule peut inclure le contexte dans lequel elle a été créée.
_Nouveauté :_ Sawa organise volontairement la redécouverte dans le temps au lieu de dépendre d’un algorithme opaque.

## Éléments observés à corriger ou déboguer

Ces éléments proviennent d’une inspection statique et de la suite de tests. Les 152 tests réussissent : il s’agit de lacunes confirmées ou de risques UX à reproduire, pas de régressions générales démontrées.

### [Correction C1] Export CBZ intégré inachevé — confirmé

Le processus principal retourne explicitement « L’export CBZ intégré n’est pas encore disponible dans cette version ». La fonction doit être classée dans la liste des éléments à terminer, avec écriture transactionnelle, conservation de l’original, validation de l’archive produite et annulation en cas d’échec.

### [Correction C2] Échec d’export/import de sauvegarde invisible — confirmé dans le code

Les gestionnaires de `SettingsDrawer` interceptent l’exception, puis appellent seulement `console.error`. L’utilisateur ne reçoit ni message de réussite, ni erreur, ni chemin du fichier exporté ; un échec peut donc sembler être un clic sans effet. Il faudrait reproduire les erreurs d’accès disque et d’archive invalide, puis prévoir une notification persistante avec action « réessayer » et détails copiables.

### [Correction C3] Mutation optimiste non persistée mais toujours affichée — risque élevé

Lorsqu’un favori, tag ou autre mutation légère échoue, l’interface tente un nouveau bootstrap. Si cette récupération échoue aussi, le commentaire du code indique que l’état optimiste reste affiché jusqu’à une prochaine synchronisation, sans avertissement. L’utilisateur peut croire qu’une modification est enregistrée alors qu’elle ne l’est pas ; un badge « modification locale non enregistrée » et une file de réessai seraient plus sûrs.

### [Correction C4] Préférences conservées visuellement malgré un échec disque — risque similaire

Les réglages sont appliqués immédiatement, puis l’échec de persistance déclenche une tentative de restauration. Si la restauration échoue, les préférences optimistes restent visibles sans signalement. Il faut tester disque en lecture seule, espace insuffisant et fichier verrouillé, puis distinguer clairement valeur affichée et valeur confirmée.

### [Correction C5] Actualisation silencieusement abandonnée — à reproduire

Le rafraîchissement de bootstrap planifié en arrière-plan termine par `.catch(() => {})`. Cette opération est secondaire et ne doit pas bloquer l’interface, mais une accumulation d’échecs pourrait laisser une vue obsolète sans indice. Une mesure diagnostic bornée et un statut discret seraient préférables à une erreur intrusive.

### [Correction C6] Échec du vidage de persistance visible seulement dans les logs — à sécuriser

`flushStateWrites()` journalise l’erreur et renvoie `false`, notamment lors de la fermeture. Le dernier snapshot valide est préservé, mais l’utilisateur ne sait pas forcément que les changements les plus récents risquent de manquer au prochain démarrage. Une entrée durable dans les statistiques de maintenance et un contrôle au démarrage suivant permettraient une récupération explicable.

### [Correction C7] Écran fatal sans voie de récupération — confirmé dans l’interface

Les erreurs globales et erreurs React affichent un écran lisible, ce qui est préférable à une fenêtre blanche, mais cet écran ne propose ni rechargement, ni ouverture du dossier de diagnostic, ni retour au dernier snapshot. Il faudrait prévoir des actions sûres et éviter d’afficher des chemins sensibles dans le message brut.

### [Correction C8] Échec de rendu PDF trop opaque — amélioration UX

Lorsqu’une page PDF échoue, `MediaAsset` affiche un simple bloc de remplacement « PDF » ou une lettre issue du texte alternatif. Le lecteur reste stable, mais l’utilisateur ne peut pas réessayer, ouvrir le fichier, connaître la page concernée ou distinguer un PDF endommagé d’un échec temporaire.

### Chemins inspectés mais déjà correctement signalés

Les échecs de réconciliation des sources et de synchronisation dérivée passent à l’état « attention nécessaire » et restent non bloquants. Ils ne sont donc pas classés comme corrections prioritaires tant qu’un test utilisateur ne démontre pas que cet état est insuffisamment visible.

### Décision après examen des idées #11 à #30

Les idées #11 à #30 ne sont pas retenues dans la liste des fonctions candidates. Elles restent dans l’historique de la session pour éviter de les reproposer sous une formulation légèrement différente. Les corrections C1 à C8 sont toutes conservées dans la liste des éléments à corriger.

#### Élément 4 : structure, fichiers et continuité des œuvres

**[Structure #31] : Normalisateur de chapitres**
_Concept :_ Sawa détecte les numérotations incohérentes comme `01`, `1.5`, `Extra`, `Ch 0001` ou `Volume 2 - 12`, puis propose une structure normalisée sans renommer immédiatement les fichiers. Un aperçu montre l’ordre avant/après et les conflits.
_Nouveauté :_ La normalisation agit d’abord sur l’ordre logique interne ; le renommage physique reste une action séparée et réversible.

**[Structure #32] : Planificateur de renommage sécurisé**
_Concept :_ L’utilisateur définit un modèle pour dossiers, volumes et chapitres, puis Sawa simule tous les nouveaux chemins. Les collisions, chemins trop longs et caractères incompatibles avec Windows sont signalés avant confirmation.
_Nouveauté :_ Le renommage de masse devient une transaction contrôlée avec retour arrière, pas une série d’opérations aveugles.

**[Structure #33] : Hiérarchie œuvre–édition–volume–chapitre**
_Concept :_ La bibliothèque distingue explicitement l’œuvre canonique, ses éditions, leurs volumes et leurs chapitres. Une édition numérique, couleur ou française peut ainsi partager la même œuvre tout en conservant sa structure propre.
_Nouveauté :_ Cette fonction transforme l’idée #8 en véritable modèle de bibliothèque plutôt qu’en simple étiquette de doublon.

**[Structure #34] : Relations entre séries**
_Concept :_ Sawa permet de relier série principale, préquelle, suite, spin-off, adaptation et univers partagé. La fiche indique un ordre conseillé sans imposer un ordre unique.
_Nouveauté :_ Les relations éditoriales deviennent indépendantes des catégories et du rangement physique.

**[Structure #35] : Gestion des contenus annexes**
_Concept :_ Artbooks, bonus, omakes, couvertures alternatives, interviews et illustrations peuvent être attachés à une œuvre sans être forcés dans la numérotation des chapitres. Ils disposent d’un type et d’un emplacement propres.
_Nouveauté :_ Les extras cessent de polluer la progression tout en restant accessibles depuis la bonne œuvre.

**[Structure #36] : Détecteur de chapitres manquants**
_Concept :_ Sawa repère localement les trous de numérotation et distingue un vrai manque d’un numéro volontairement absent. Une vérification Internet facultative peut comparer la liste avec une source choisie.
_Nouveauté :_ Le système explique son niveau de confiance et ne confond pas automatiquement numérotation spéciale et fichier manquant.

**[Structure #37] : Carte des emplacements physiques**
_Concept :_ Une vue indique sur quels disques, dossiers ou partages réseau se trouvent les différentes éditions et chapitres d’une œuvre. Les emplacements hors ligne sont conservés sans faire disparaître le contenu du catalogue.
_Nouveauté :_ La bibliothèque représente aussi les supports temporairement déconnectés, comme un catalogue multimédia réel.

**[Structure #38] : Santé préventive des fichiers**
_Concept :_ Un contrôle facultatif vérifie progressivement archives, PDF, images, taille anormale et empreintes, uniquement lorsque la machine est inactive. Les résultats sont classés en sain, douteux, endommagé ou inaccessible.
_Nouveauté :_ La maintenance détecte la dégradation avant la lecture sans rescanner lourdement toute la bibliothèque à chaque démarrage.

**[Structure #39] : Historique de transformation**
_Concept :_ Chaque déplacement, renommage, fusion d’édition, modification de structure ou réparation crée une entrée avec état précédent et état suivant. Les transformations compatibles peuvent être annulées individuellement.
_Nouveauté :_ Sawa conserve la mémoire des opérations structurelles, pas seulement celle des métadonnées.

**[Structure #40] : Atelier de changements groupés**
_Concept :_ L’utilisateur prépare plusieurs actions — déplacer, relier, renommer, changer de catégorie — dans un panier avant exécution. Sawa calcule les dépendances et applique l’ensemble dans un ordre sûr.
_Nouveauté :_ Les grandes réorganisations deviennent un plan vérifiable plutôt qu’une succession fragile de clics.

#### Élément 5 : mobilité, intégration système et administration pratique

**[Système #41] : Profils de bibliothèque**
_Concept :_ Plusieurs profils isolés peuvent exister sur le même ordinateur : bibliothèque principale, famille, test ou collection portable. Chaque profil possède ses sources, préférences, coffre et base de données.
_Nouveauté :_ La séparation est réelle au niveau du stockage, pas seulement un filtre visuel.

**[Système #42] : Mode bibliothèque portable**
_Concept :_ Sawa peut préparer sur un disque externe un paquet autonome contenant catalogue, réglages sélectionnés et œuvres choisies. Au retour, les progressions sont fusionnées avec détection des conflits.
_Nouveauté :_ Le déplacement temporaire reste compatible avec le suivi d’identité de l’idée #5.

**[Système #43] : Synchronisation directe entre deux PC**
_Concept :_ Deux installations Sawa se découvrent sur le réseau local et comparent uniquement les changements autorisés : progression, métadonnées ou fichiers. Aucun compte cloud n’est requis et chaque conflit est présenté avant fusion.
_Nouveauté :_ La synchronisation est pair-à-pair, sélective et explicable plutôt que dépendante d’un serveur central.

**[Système #44] : Envoi local vers tablette**
_Concept :_ Sawa génère un QR code temporaire permettant d’ouvrir ou télécharger une œuvre depuis le réseau local. L’accès expire automatiquement et peut être limité à un appareil ou une sélection.
_Nouveauté :_ Le transfert ponctuel ne nécessite ni câble, ni cloud, ni exposition permanente de la bibliothèque.

**[Système #45] : Lecteur web local temporaire**
_Concept :_ Un serveur local désactivé par défaut permet de lire depuis un navigateur du réseau domestique. Il peut être lancé pour une durée limitée, avec code d’accès et portée restreinte.
_Nouveauté :_ L’utilisateur bénéficie d’un accès multiappareil sans transformer Sawa en service réseau toujours actif.

**[Système #46] : Actions dans l’Explorateur Windows**
_Concept :_ Le menu contextuel Windows peut proposer « Ajouter à Sawa », « Vérifier l’archive », « Relier à une œuvre » ou « Ouvrir dans Sawa ». Chaque action ouvre une confirmation dans l’application avant mutation.
_Nouveauté :_ L’intégration système reste sûre : l’Explorateur initie l’intention, mais Sawa garde le contrôle transactionnel.

**[Système #47] : Centre de tâches unifié**
_Concept :_ Imports, scans, OCR, miniatures, téléchargements et réparations apparaissent dans une même file avec priorité, progression, pause et annulation. L’utilisateur peut limiter CPU, disque et réseau selon qu’il lit ou laisse le PC inactif.
_Nouveauté :_ Toutes les opérations longues partagent une politique de ressources visible au lieu d’avoir chacune son comportement.

**[Système #48] : Macros d’entretien**
_Concept :_ Une macro enchaîne des opérations sûres comme « vérifier les nouveaux fichiers, détecter les manques, reconstruire les miniatures défectueuses, puis créer une sauvegarde ». Chaque étape possède un aperçu et peut s’arrêter avant mutation.
_Nouveauté :_ L’automatisation réutilise les opérations vérifiables de Sawa sans ouvrir l’accès à des scripts arbitraires.

**[Système #49] : Export de catalogue indépendant**
_Concept :_ Sawa produit un catalogue HTML autonome ou CSV contenant titres, éditions, emplacements et état de lecture, sans copier les œuvres. Des options permettent d’exclure le coffre, les chemins complets et les données personnelles.
_Nouveauté :_ La bibliothèque reste consultable ou archivable même sans lancer Sawa, avec contrôle précis de la confidentialité.

**[Système #50] : Paquet de diagnostic privé**
_Concept :_ En cas de problème, Sawa crée un ZIP comprenant versions, métriques bornées, erreurs récentes et état des tâches, après suppression des chemins, titres privés et identifiants sensibles. L’utilisateur voit exactement le contenu avant l’enregistrement.
_Nouveauté :_ Le diagnostic devient partageable et vérifiable sans exposer automatiquement la collection.

### Décision après examen des idées #31 à #50

Les idées #31 à #50 ne sont pas retenues : elles sont jugées trop techniques ou trop éloignées d’un bénéfice immédiatement visible dans l’expérience utilisateur. La suite privilégie des changements d’interface légers utilisant les données déjà disponibles.

#### Élément 6 : navigation et manipulation visibles

**[Expérience #51] : Aperçu éclair avec la barre Espace**
_Concept :_ En sélectionnant une couverture puis en appuyant sur Espace, un panneau apparaît avec synopsis, progression, tags et prochains chapitres sans quitter la grille. Relâcher ou appuyer de nouveau le referme instantanément.
_Nouveauté :_ L’utilisateur consulte beaucoup de fiches sans empiler des pages ni perdre sa position.

**[Expérience #52] : Annulation visuelle après chaque action**
_Concept :_ Après un favori, déplacement, changement de statut ou retrait d’une collection, une notification discrète affiche « Annuler » pendant quelques secondes. Elle indique clairement ce qui vient de changer.
_Nouveauté :_ Les petites erreurs de clic deviennent immédiatement réparables sans ouvrir l’historique ou les réglages.

**[Expérience #53] : Modification directement sur la fiche**
_Concept :_ Un double-clic sur le titre, le statut ou les tags permet une modification courte directement dans la fiche manga. Les options avancées restent dans l’écran complet.
_Nouveauté :_ Les corrections quotidiennes ne nécessitent plus de traverser plusieurs fenêtres.

**[Expérience #54] : Mode sélection évident**
_Concept :_ Un bouton « Sélectionner » affiche des cases sur les couvertures, une barre d’actions en bas et le nombre d’éléments choisis. Échap quitte le mode sans modifier la sélection précédente.
_Nouveauté :_ Les actions groupées deviennent découvrables même sans connaître Ctrl ou Maj.

**[Expérience #55] : Filtres sous forme de pastilles actives**
_Concept :_ Tous les filtres appliqués restent visibles au-dessus de la liste sous forme de pastilles supprimables individuellement. Chaque pastille montre aussi le nombre de résultats concernés.
_Nouveauté :_ L’utilisateur comprend immédiatement pourquoi certains mangas ont disparu de la vue.

**[Expérience #56] : Métadonnées cliquables**
_Concept :_ Cliquer sur un auteur, un tag, une catégorie, une année ou un statut ouvre immédiatement la liste correspondante. Un clic avec la molette peut ouvrir ce filtre dans un onglet en arrière-plan.
_Nouveauté :_ La fiche devient un point de navigation naturel au lieu d’un simple texte descriptif.

**[Expérience #57] : Panneaux redimensionnables**
_Concept :_ Dans les vues comportant liste et détails, l’utilisateur peut ajuster la largeur avec une poignée visible. Sawa mémorise la taille pour chaque type d’écran.
_Nouveauté :_ L’interface s’adapte aux petits écrans comme aux moniteurs larges sans ajouter de mode complexe.

**[Expérience #58] : Contenu des cartes personnalisable**
_Concept :_ Une petite configuration permet de choisir les informations visibles sur les couvertures : auteur, chapitre, progression, tags, format ou aucun texte. Le choix est prévisualisé en direct.
_Nouveauté :_ La densité ne se limite plus à « petite ou grande carte » ; chacun choisit ce qui compte réellement.

**[Expérience #59] : Aide des raccourcis superposée**
_Concept :_ Maintenir `?` affiche les raccourcis disponibles pour l’écran courant au-dessus de l’interface. Les touches déjà personnalisées sont utilisées automatiquement.
_Nouveauté :_ L’aide devient contextuelle et immédiatement accessible sans ouvrir les paramètres.

**[Expérience #60] : Historique de navigation visuel**
_Concept :_ Un appui long sur Retour affiche les dernières vues visitées avec leur titre et leur miniature. L’utilisateur peut revenir directement trois ou quatre étapes en arrière.
_Nouveauté :_ Les onglets et piles de navigation deviennent compréhensibles sans modifier leur fonctionnement interne.

#### Élément 7 : personnalisation légère et plaisir d’utilisation

**[Personnalisation #61] : Cadrage manuel des couvertures**
_Concept :_ L’utilisateur déplace et zoome légèrement une couverture pour choisir la zone visible sur les cartes, sans modifier le fichier original. Le cadrage est conservé comme préférence locale.
_Nouveauté :_ Les visages et titres ne sont plus coupés par le format uniforme des cartes.

**[Personnalisation #62] : Galerie de couvertures alternatives**
_Concept :_ Une œuvre peut conserver plusieurs couvertures locales et l’utilisateur choisit celle affichée dans la bibliothèque. Un bouton permet de les faire défiler depuis la fiche.
_Nouveauté :_ Les couvertures alternatives deviennent un élément visible de collection sans créer plusieurs mangas.

**[Personnalisation #63] : Apparence des collections**
_Concept :_ Chaque collection peut choisir entre mosaïque, couverture unique, pile de trois images ou bannière. Le résultat est prévisualisé avant validation.
_Nouveauté :_ Les collections gagnent une identité visuelle sans télécharger ni générer de nouvelles images.

**[Personnalisation #64] : Étiquettes personnelles sur les couvertures**
_Concept :_ L’utilisateur ajoute une courte étiquette comme « priorité », « à reprendre », « chef-d’œuvre » ou son propre texte. Elle apparaît discrètement sur la carte et peut être filtrée.
_Nouveauté :_ L’appréciation personnelle devient visible immédiatement sans ouvrir les tags ou la fiche.

**[Personnalisation #65] : Duel pour choisir la prochaine lecture**
_Concept :_ Sawa présente deux mangas correspondant aux filtres actuels ; l’utilisateur choisit celui qui l’attire le plus, puis le gagnant affronte un autre titre. Après quelques choix, il ouvre le manga final.
_Nouveauté :_ La décision devient un mini-jeu local très léger, sans algorithme de recommandation.

**[Personnalisation #66] : Dé « Choisis pour moi »**
_Concept :_ Un bouton tire un manga au hasard dans la vue actuelle, avec options simples comme non lu, commencé ou moins de dix chapitres. Le résultat peut être relancé sans modifier la bibliothèque.
_Nouveauté :_ Le hasard respecte exactement le contexte et les filtres déjà visibles.

**[Personnalisation #67] : Couleur propre à chaque collection**
_Concept :_ Une collection peut définir une couleur d’accent utilisée dans son en-tête, ses pastilles et son onglet. Les couvertures et le thème général restent inchangés.
_Nouveauté :_ La couleur sert de repère spatial plutôt que de transformation complète de l’interface.

**[Personnalisation #68] : Marqueur « nouveau depuis ma dernière visite »**
_Concept :_ Les mangas et chapitres ajoutés depuis la dernière ouverture de leur catégorie reçoivent un petit point temporaire. Le marqueur disparaît après consultation ou peut être effacé en une fois.
_Nouveauté :_ La nouveauté est relative à ce que l’utilisateur a réellement vu, pas uniquement à une date globale.

**[Personnalisation #69] : Frise visuelle des dernières lectures**
_Concept :_ Une frise compacte montre les dernières couvertures ouvertes, groupées par jour, avec accès direct au chapitre. Elle peut être masquée ou limitée aux sept derniers jours.
_Nouveauté :_ L’historique devient visuel et immédiatement exploitable sans devenir un tableau statistique.

**[Personnalisation #70] : Mode vitrine**
_Concept :_ Une collection ou une catégorie peut être affichée en plein écran sous forme de belle étagère de couvertures navigable. Ce mode est purement visuel et se ferme avec Échap.
_Nouveauté :_ Sawa peut servir à parcourir ou montrer une collection sans afficher tous les outils de gestion.
