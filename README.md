# CariFlip

Jeu de réflexion de Caribou Labs, inspiré des puzzles à trait unique. PWA installable sur iPhone, iPad et Android, jouable hors ligne. Aucune dépendance, aucune étape de build.

**Version 1.9.0**

## Règles

- Tracez un seul trait continu, case par case, horizontalement ou verticalement, sans repasser par une case.
- Le trait reste affiché quand on lève le doigt : on peut le reprendre depuis sa dernière case. **Toucher la dernière case valide le trait** : chaque tuile traversée s'inverse (noir ↔ blanc). Toucher ailleurs recommence un trait.
- Une ligne entièrement noire ou entièrement blanche est validée.
- Le cadre de points autour de la grille se traverse sans rien inverser. Les cases creuses sont infranchissables.

**Puzzle** : 200 niveaux en 8 chapitres, à résoudre en un seul trait. Niveaux 1-100 : les 100 puzzles « Stock » de Polarium, relevés image par image dans une vidéo de référence (usage personnel) ; niveaux 101-200 : générés. 3 indices progressifs par niveau, étoile si résolu sans indice. **Médaille du trait optimal** si le trait inverse le moins de tuiles possible (minimum calculé par le solveur : `tools/compute-optimal.mjs` → `js/optimal-data.js`).

**Puzzle du jour** : une grille par date, la même sur tous les appareils (graine = date), plus grande du lundi (5 × 5) au dimanche (8 × 8). Série de jours consécutifs, médaille du trait optimal.

**Contre-la-montre** : 3 minutes pour résoudre un maximum de grilles générées, de plus en plus grandes. « Passer » coûte 10 secondes. Top 5 par profil.

**Challenge** (modèle : le mode Challenge de Polarium) : puits de 9 colonnes. La partie démarre sur la figure « 1 » (8 lignes, effaçable d'un trait), puis **la même suite de 409 blocs que dans Polarium**, à la même cadence, relevée image par image dans une partie complète (`js/sequence.js`, usage personnel). À force de jouer, on connaît les blocs et on prépare ses enchaînements ; certains blocs ne s'effacent qu'en les combinant avec la pile. Passé 100 lignes (niveau 11), Polarium envoie une longue série de lignes simples : chaque paire (et presque toujours chaque groupe de 3 ou 4) qui se suit s'efface d'un seul trait en s'appuyant sur le cadre. À la fin de la suite, elle reprend 15 % plus vite. Seules les 12 lignes du bas sont à portée du doigt, les 7 au-dessus forment une réserve ; partie perdue quand la pile franchit la ligne rouge, dont la jauge jaune annonce le prochain bloc.

- Points d'un trait : (100 / 300 / 600 / 1 000… selon le nombre de lignes + 150 × (chaîne − 1)) × niveau. Plateau vide : +1 000 × niveau.
- Niveau +1 toutes les 10 lignes (multiplie les points et accélère un peu la chute).
- « Faire tomber » : le bloc en cours tombe d'un coup (ou le suivant arrive) contre quelques points.
- Top 3 avec note en lettre (E- à S).
- **Entraînement** : même suite, rythme 1,6 × plus lent, sans classement.

Le bouton ✕ (de chaque côté, pour droitiers et gauchers) annule un trait en cours, dans tous les modes.

**Profils** (accueil) : chaque joueur a sa progression (niveaux, étoiles, médailles, records, Puzzle du jour, statistiques). Au premier lancement, création d'un profil (ou « J'ai déjà un code famille ») ; ensuite le dernier profil utilisé s'ouvre directement. La progression d'une version antérieure est reprise par le premier profil créé.

**Synchronisation** : tous les profils sont synchronisés entre appareils via Supabase, sans compte : un **code famille** (12 caractères, Profils › Synchronisation) relie les appareils. Le jeu fonctionne hors ligne et se synchronise au retour du réseau, à chaque progression et toutes les 45 s quand il est affiché. Fusion sans perte (niveaux : union, moins d'indices, trait le plus court ; compteurs par appareil ; records : meilleurs scores ; nom et avatar : dernière modification). Configuration dans `js/config.js` ; schéma SQL dans `supabase.sql`. Projet gratuit Supabase : mis en pause après environ 7 jours sans requête (réactivation depuis le tableau de bord).

**Statistiques** (accueil) : progression Puzzle (résolus, étoiles, indices, avancement par chapitre), Puzzle du jour (jours résolus, série en cours, meilleure série), Contre-la-montre (record, parties), Challenge (parties, meilleur score et note, record de lignes, lignes effacées, plus longue chaîne, méga-combos) et général (traits, tuiles inversées).

**Réglages** (accueil) : langue (Auto / Français / English), apparence (Auto / Clair / Sombre), sons, vibrations. *Auto* suit l'appareil : français si sa langue commence par « fr », anglais sinon ; thème clair ou sombre selon le système. Les textes sont dans `js/i18n.js` (mêmes clés pour les deux langues).

## Easter eggs

- **Méga-combo** : 6 lignes ou plus d'un seul trait en Challenge (la figure « 1 » de départ en un trait) → « MEGA FLIP », confettis, jingle, +5 000 × niveau.
- **Niveau 201** : caribou en pixel-art, débloqué quand les 200 niveaux sont résolus sans indice (onglet « ★ 201 »).
- **31 octobre** : tuiles orange/noir. **25 décembre** : tuiles rouge/vert. Seules les couleurs changent, y compris le logo et l'icône (onglet, et icône d'écran d'accueil si l'app est ajoutée ce jour-là). Test : ajouter `?season=halloween` ou `?season=christmas` à l'adresse.
- **Appui long sur le logo** de l'accueil : message secret.
- **Appui long sur le numéro de version** : indice sur les tuiles de saison.
- L'icône de l'app est elle-même un puzzle résolu : son trait rend chaque ligne unie.

## Tester sur le Mac

Double-cliquer `serve.command`, puis ouvrir http://localhost:8080. Le service worker (hors ligne) ne s'active qu'en HTTPS ou sur `localhost`.

## Publier sur GitHub Pages

1. Créer le dépôt `CariFlip` sur le compte CaribouNathan et y pousser le contenu de ce dossier (racine du dépôt = ce dossier).
2. Settings › Pages › Source : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. L'app est servie sur `https://caribounathan.github.io/CariFlip/`.

Installation :
- **iPhone / iPad** : ouvrir l'URL dans Safari › Partager › *Sur l'écran d'accueil*.
- **Android** : Chrome propose *Installer l'application* (bouton aussi affiché sur l'accueil du jeu).

## Mettre à jour

Après toute modification, incrémenter `CACHE` dans `sw.js` (et `VERSION` dans `js/main.js`). Les appareils déjà installés téléchargent la nouvelle version en arrière-plan et affichent un bandeau « Nouvelle version disponible » avec un bouton « Mettre à jour » (jamais pendant une partie).

## Niveaux

Les niveaux sont générés à partir d'une graine fixe (`js/rng.js`), identiques sur tous les appareils, chacun avec une solution garantie. Modifier `GEN_VERSION` ou la courbe `TIERS` (`js/generator.js`) change tous les niveaux et décale la progression des joueurs.

Vérification : `node tests/generator.test.mjs` (contrôle les 200 niveaux) `node tests/pieces.test.mjs` (symétrie des blocs du Challenge). `node tools/check-challenge.mjs` liste les blocs du Challenge qui ne s'effacent pas seuls. Les solutions des 100 puzzles Stock sont recalculées par `node tools/solve-stock.mjs`.

## Structure

```
index.html              écrans
css/style.css           interface (clair / sombre automatique)
js/board.js             règles
js/generator.js         générateur de puzzles
js/renderer.js          rendu canvas + saisie du trait
js/puzzle.js            mode Puzzle
js/challenge.js         mode Challenge / Entraînement
js/sequence.js          suite fixe des blocs du Challenge (Polarium)
js/stock.js             les 100 puzzles de Polarium
tools/                  relevés (puzzles, Challenge) et solveur
js/storage.js           profils, sauvegarde, fusion pour la synchro
js/sync.js              synchronisation Supabase (code famille)
js/config.js            adresse et clé publique Supabase
js/optimal.js           trait optimal (+ optimal-data.js, solve-board.js)
supabase.sql            schéma à exécuter dans Supabase
js/i18n.js              textes français / anglais
js/main.js              navigation, réglages
sw.js                   cache hors ligne
manifest.webmanifest    installation
```

## Évolutions possibles

- Wrapper Capacitor pour produire un APK Android et un projet Xcode (stores).
- Éditeur de grilles et partage par code.
- Trophées tirés des statistiques.
