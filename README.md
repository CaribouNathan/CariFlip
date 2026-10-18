# CariFlip

Jeu de réflexion de Caribou Labs, inspiré des puzzles à trait unique. PWA installable sur iPhone, iPad et Android, jouable hors ligne. Aucune dépendance, aucune étape de build.

**Version 1.4.0**

## Règles

- Tracez un seul trait continu, case par case, horizontalement ou verticalement, sans repasser par une case.
- Au lever du doigt, chaque tuile traversée s'inverse (noir ↔ blanc).
- Une ligne entièrement noire ou entièrement blanche est validée.
- Le cadre de points autour de la grille se traverse sans rien inverser. Les cases creuses sont infranchissables.

**Puzzle** : 200 niveaux en 8 chapitres, à résoudre en un seul trait. 3 indices progressifs par niveau, étoile si résolu sans indice.
**Challenge** (modèle : le mode Challenge de Polarium) : des blocs de lignes (30 motifs tous symétriques gauche-droite, couleurs inversées au hasard) tombent du haut et s'empilent dans un puits de 8 colonnes. Seules les 10 lignes du bas sont à portée du doigt, les 7 lignes au-dessus forment une réserve visible. Chaque ligne effacée fait retomber la pile. Partie perdue quand la pile franchit la ligne rouge, dont la jauge jaune annonce le prochain bloc.

- Points d'un trait : 100 / 300 / 600 / 1 000… selon le nombre de lignes, × chaîne (traits gagnants consécutifs) × niveau. Plateau vide : +1 000 × niveau.
- Niveau +1 toutes les 10 lignes : blocs plus fréquents, plus rapides, plus grands, avec un peu de bruit dès le niveau 4 (toujours par paire de cases miroir, la symétrie est conservée).
- « Faire tomber » : le bloc en cours tombe d'un coup (ou le suivant arrive) contre quelques points.
- Top 3 avec note en lettre (E- à S).
- **Grille de départ garantie** : chaque partie démarre sur une grille (symétrique) pour laquelle un trait unique efface toutes les lignes d'un coup. Le jeu la vérifie avec un solveur (`js/solver.js`) et en tire une autre sinon. La garantie porte sur la grille de départ : ensuite, les traits du joueur changent la grille.
- **Entraînement** : pile presque vide, rythme lent, sans classement.

Le bouton ✕ (de chaque côté, pour droitiers et gauchers) annule un trait en cours, dans les deux modes.

**Réglages** (accueil) : langue (Auto / Français / English), apparence (Auto / Clair / Sombre), sons, vibrations. *Auto* suit l'appareil : français si sa langue commence par « fr », anglais sinon ; thème clair ou sombre selon le système. Les textes sont dans `js/i18n.js` (mêmes clés pour les deux langues).

## Tester sur le Mac

Double-cliquer `serve.command`, puis ouvrir http://localhost:8080. Le service worker (hors ligne) ne s'active qu'en HTTPS ou sur `localhost`.

## Publier sur GitHub Pages

1. Créer le dépôt `cariflip` sur le compte CaribouNathan et y pousser le contenu de ce dossier (racine du dépôt = ce dossier).
2. Settings › Pages › Source : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. L'app est servie sur `https://caribounathan.github.io/CariFlip/`.

Installation :
- **iPhone / iPad** : ouvrir l'URL dans Safari › Partager › *Sur l'écran d'accueil*.
- **Android** : Chrome propose *Installer l'application* (bouton aussi affiché sur l'accueil du jeu).

## Mettre à jour

Après toute modification, incrémenter `CACHE` dans `sw.js` (et `VERSION` dans `js/main.js`), sinon les appareils déjà installés gardent l'ancienne version en cache.

## Niveaux

Les niveaux sont générés à partir d'une graine fixe (`js/rng.js`), identiques sur tous les appareils, chacun avec une solution garantie. Modifier `GEN_VERSION` ou la courbe `TIERS` (`js/generator.js`) change tous les niveaux et décale la progression des joueurs.

Vérification : `node tests/generator.test.mjs` (contrôle les 200 niveaux) `node tests/pieces.test.mjs` (symétrie des blocs du Challenge) et `node tests/start.test.mjs` (méga-combo garanti sur les grilles de départ).

## Structure

```
index.html              écrans
css/style.css           interface (clair / sombre automatique)
js/board.js             règles
js/generator.js         générateur de puzzles
js/renderer.js          rendu canvas + saisie du trait
js/puzzle.js            mode Puzzle
js/challenge.js         mode Challenge / Entraînement
js/pieces.js            motifs des blocs
js/solver.js            solveur du trait unique (méga-combo)
js/start.js             grille de départ garantie
js/i18n.js              textes français / anglais
js/main.js              navigation, réglages
sw.js                   cache hors ligne
manifest.webmanifest    installation
```

## Évolutions possibles

- Wrapper Capacitor pour produire un APK Android et un projet Xcode (stores).
- Éditeur de grilles et partage par code.
