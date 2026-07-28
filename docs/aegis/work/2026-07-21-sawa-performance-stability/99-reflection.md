# Reflection

Les gels venaient d un travail source synchrone dans le chemin de bootstrap, d ecritures globales et d un comparateur d index qui confondait manga et chapitre one-shot au meme emplacement; le saut de scroll venait de restaurations relancees par des rendus ordinaires et de la perte de l ancre avant navigation.

La correction preserve un snapshot visible, deplace les reconciliations hors thread UI, segmente les ecritures et fige la position initiale par activation de vue. Le test E2E a ete utile pour detecter deux erreurs que les tests statiques ne voyaient pas: capture de l ancre avec les colonnes provisoires et reinjection d une position enregistree comme nouvelle position initiale.

Retirement closure: les restaurations par timers multiples et le clic molette sur `mouseup` ont ete remplaces; les anciens contrats IPC complets restent disponibles pour bootstrap, recovery et operations structurelles. Aucun chemin utilisateur persistant n a ete supprime.

Risque residuel: Windows, les pilotes et les chemins reseau ne peuvent pas etre garantis; le JAR Suwayomi optionnel etait absent du cache de packaging. Les grands fichiers `electron/main.cjs` et `src/App.jsx` meritent une extraction ulterieure, sans bloquer cette correction verifiee.
