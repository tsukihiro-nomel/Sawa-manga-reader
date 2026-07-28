# Stabilisation des performances de Sawa

## TaskIntentDraft

- Outcome: rendre le demarrage interactif, supprimer les gels provoques par les I/O synchrones et restaurer exactement les positions de navigation.
- Scope: processus Electron principal, persistance locale, contrats IPC de diagnostic, virtualisation Sawa/Kavita et tests Electron.
- Non-goals: modifier le format de la bibliotheque, les connecteurs distants ou l'experience visuelle hors indicateurs de synchronisation.
- Success evidence: tests unitaires et Electron, build de production, benchmark sur profil representatif, aucune regression des 138 tests initiaux.

## BaselineReadSetHint

- `electron/main.cjs`, `electron/services/sourceRuntime.cjs`, `electron/services/storage.cjs`
- `src/App.jsx`, `src/components/LibraryView.jsx`, `src/components/VirtualMangaGrid.jsx`
- tests existants de sources, virtualisation, payloads, workers et diagnostics

## BaselineUsageDraft

- Baseline lue et tests executes avant edition.
- Etat Git initial propre sur `refonte-logiciel-4.0.0` au commit `6ab96bb`.
- Baseline: 49 fichiers, 138 tests reussis.

## ImpactStatementDraft

Le changement retire du chemin interactif une reconciliation mesuree a environ 11 secondes et remplace les restaurations de scroll imperatives repetees par un registre versionne et ancre.

## Execution Readiness View

- Intent lock: reactivite et restauration, sans perte de donnees.
- Scope fence: aucune mutation des contenus manga; seulement metadonnees, session, cache et orchestration.
- Compatibility: conserver les methodes preload existantes; ajouter des champs et evenements compatibles.
- Owner constraint: `main.cjs` et `App.jsx` ne recoivent que du cablage; la logique nouvelle vit dans des modules dedies.
- Verification: unitaires, integration Electron, build et benchmark.

