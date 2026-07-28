# EvidenceBundleDraft

- `npm test`: 49 fichiers, 138 tests reussis avant modification.
- Reproduction Electron precedente: demarrage utilisable ~12,8 s; reconciliation ~10,98 s pour 499 mangas.
- Trace de scroll precedente: clic molette 1029 px vers 80 px, deux appels `scrollToOffset(80)`.
- Reconciliation indexee: 500 historiques et 500 mangas, second passage sans nouvelle ecriture; test cible reussi.
- Playwright Electron fonctionnel: 2 scenarios reussis sur 499 mangas / 1 072 chapitres (Sawa et Kavita), ancre identique et ecart <=2 px apres auxclick, retour, onglet et redemarrage.
- Benchmark Playwright final, 5 echantillons: froid [2 590, 1 409, 1 412, 1 330, 1 446] ms, p95 2 590 ms; chaud [1 814, 1 486, 1 302, 1 527, 1 418] ms, p95 1 814 ms.
- Mutations legeres finales: 20 echantillons, p95 51 ms; 0 `renderer.unresponsive`; 0 nouvelle longue tache renderer >50 ms pendant la phase mesuree. Trois repetitions de robustesse: p95 47, 77 et 47 ms.
- Le scan incremental distingue maintenant les entrees manga/chapitre partageant un emplacement et renvoie un marqueur compact quand l index ne change pas; cela supprime les faux rescans et la deserialisation du graphe complet sur le thread principal.
- Suite Vitest finale: 54 fichiers, 152 tests reussis.
- Playwright Electron final: 2 scenarios fonctionnels reussis; suite de performance finale: 2 scenarios reussis.
- Build Vite et `electron-builder --dir`: reussis. Smoke final de `release/win-unpacked/Sawa Manga Library.exe`: utilisable en 3 421 ms, 499 mangas / 1 072 chapitres.
- `git diff --check`: aucune erreur de diff; seuls les avertissements de conversion LF vers CRLF du checkout Windows sont presents.
- Profil de diagnostic initial et tous les profils `sawa-e2e-*` supprimes apres validation des cibles temporaires.

## Architecture et complexite

- Baseline: aucun dossier d autorite `docs/current` ou systeme ADR de projet n existait; le plan explicite de l utilisateur a servi de frontiere.
- ADR gate: action `skip`; changement execute mais modulaire et reversible, deja explique par le plan et le dossier de travail Aegis.
- Complexity Closure: `exceeded-and-governed`; `main.cjs` et `App.jsx` restent surdimensionnes, mais les nouvelles responsabilites sont extraites et les ajouts dans ces fichiers sont du cablage/local-fix.
- Suivi conseille: separer progressivement les routeurs IPC de `main.cjs` et le controleur de navigation de `App.jsx` dans une tranche dediee. Le packaging avertit aussi que le JAR Suwayomi optionnel est absent de `.codex-cache`.
