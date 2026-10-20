// Langues de l'interface. Par défaut : la langue de l'appareil (français si elle commence par « fr »,
// anglais sinon), comme le thème suit le réglage clair/sombre du système. Réglable dans Réglages.
import { store, save } from './storage.js';

const pl = (n, one, many) => `${n} ${n > 1 ? many : one}`;       // français : 0 et 1 au singulier
const plEn = (n, one, many) => `${n} ${n === 1 ? one : many}`;  // anglais : seul 1 au singulier

const STR = {
  fr: {
    'home.tagline': 'Un seul trait. Chaque ligne d’une seule couleur.',
    'home.puzzle': 'Puzzle',
    'home.challenge': 'Challenge',
    'home.howto': 'Comment jouer',
    'home.settings': 'Réglages',
    'home.levels': ({ n }) => `${n} niveaux`,
    'home.progress': ({ n, total }) => `${n} / ${total} niveaux résolus`,
    'home.best': ({ s }) => `Meilleur score : ${s}`,
    'home.challengeSub': 'Tenez le plus longtemps possible',
    'home.installIOS': 'Pour l’installer : bouton Partager de Safari, puis « Sur l’écran d’accueil ».',
    'home.installBtn': 'Installer l’application',

    'nav.home': 'Accueil',
    'nav.levels': 'Niveaux',
    'nav.back': 'Retour',

    'levels.title': 'Puzzle',
    'levels.caption': ({ w, h, holes }) => `Grilles de ${w} × ${h}${holes ? ', avec cases creuses' : ''}`,
    'levels.stock': 'Les 100 puzzles de Polarium',
    'levels.locked': ({ n }) => `Niveau ${n}, verrouillé`,
    'levels.item': ({ n, solved }) => `Niveau ${n}${solved ? ', résolu' : ''}`,

    'game.level': ({ n }) => `Niveau ${n}`,
    'game.hint': 'Indice',
    'game.cancel': 'Annuler le trait',
    'game.dirty': ({ n }) => pl(n, 'ligne mixte', 'lignes mixtes'),
    'game.solved': 'Résolu',
    'game.intro': 'Un seul trait, puis touchez sa dernière case pour valider.',
    'game.hint1': 'Le trait commence ici.',
    'game.hint2': 'Voici le début du trait.',
    'game.hint3': 'Voici le trait complet.',
    'game.fail': ({ n }) => (n === 1 ? 'Encore 1 ligne mixte. On recommence.' : `Encore ${n} lignes mixtes. On recommence.`),
    'game.winTitle': ({ n }) => `Niveau ${n} réussi`,
    'game.winAll': 'Les 200 niveaux sont terminés. Bravo.',
    'game.winHints': ({ n }) => `Avec ${pl(n, 'indice', 'indices')}. Refaites-le sans pour gagner l’étoile.`,
    'game.winStar': 'Sans indice : étoile gagnée.',
    'game.next': 'Niveau suivant',
    'game.replay': 'Rejouer',
    'game.list': 'Liste des niveaux',

    'cmenu.title': 'Challenge',
    'cmenu.intro': 'Des blocs de lignes tombent du haut. Seule la zone du bas est à portée du doigt : effacez des lignes pour faire descendre la suite avant que la pile ne franchisse la ligne rouge.',
    'cmenu.challenge': 'Challenge',
    'cmenu.challengeSub': 'La pile démarre pleine, la vitesse augmente toutes les 10 lignes',
    'cmenu.practice': 'Entraînement',
    'cmenu.practiceSub': 'Pile presque vide, rythme lent, sans classement',
    'cmenu.best': 'Meilleurs scores',
    'cmenu.none': 'Aucune partie de Challenge pour l’instant.',

    'ch.level': ({ n }) => `Niveau ${n}`,
    'ch.lines': ({ n }) => pl(n, 'ligne', 'lignes'),
    'ch.practice': 'Entraînement',
    'ch.go': 'C’est parti',
    'ch.chain': ({ n }) => `Chaîne ×${n}`,
    'ch.clear': 'Plateau vide',
    'ch.levelUp': ({ n }) => `Niveau ${n}`,
    'ch.drop': 'Faire tomber',
    'ch.pause': 'Pause',
    'ch.score': ({ s }) => `Score : ${s}`,
    'ch.resume': 'Reprendre',
    'ch.restart': 'Recommencer',
    'ch.quit': 'Quitter',
    'ch.over': 'Partie terminée',
    'ch.record': 'Nouveau record',
    'ch.rank': ({ n }) => `${n}e meilleur score`,
    'ch.practiceOver': 'Entraînement terminé',
    'ch.summary': ({ s, lines, chain }) => `${s} points · ${pl(lines, 'ligne', 'lignes')} · chaîne max ×${chain}`,
    'ch.menu': 'Menu Challenge',

    'howto.title': 'Comment jouer',
    'howto.s1t': 'Tracez sans lever le doigt',
    'howto.s1p': 'Case par case, à l’horizontale ou à la verticale, sans repasser deux fois au même endroit. Revenez en arrière pour effacer.',
    'howto.s2t': 'Validez sur la dernière case',
    'howto.s2p': 'Le trait reste affiché quand vous levez le doigt. Touchez sa dernière case pour le valider : chaque tuile du trait change alors de couleur.',
    'howto.s3t': 'Une ligne unie disparaît',
    'howto.s3p': 'Toute noire ou toute blanche, elle est validée. En Puzzle, toutes les lignes en un seul trait.',
    'howto.s4t': 'Le cadre est un passage',
    'howto.s4p': 'Les points autour de la grille se traversent sans rien inverser. Les cases creuses sont infranchissables.',
    'howto.note': 'Challenge : les blocs tombent et s’empilent, seule la zone du bas se trace. Plusieurs lignes d’un coup et les chaînes multiplient les points. ✕ annule un trait.',
    'howto.ok': 'Compris',

    'egg.brother': 'Mon frère n’a pas cautionné ça…',
    'egg.ok': 'OK',
    'mega.title': 'MEGA FLIP',
    'mega.sub': ({ n, s }) => `${n} lignes d’un coup  +${s}`,
    'secret.chapter': '★ 201',
    'secret.caption': 'Niveau secret',
    'secret.winTitle': 'Le caribou est libre',
    'secret.winBody': '200 niveaux sans indice, puis celui-ci. Caribou Labs vous salue.',
    'credits.title': 'CariFlip',
    'credits.by': 'Un jeu Caribou Labs, inspiré de Polarium (Nintendo DS, 2004).',
    'credits.stats': 'Vos statistiques',
    'stat.strokes': 'Traits tracés',
    'stat.flips': 'Tuiles inversées',
    'stat.lines': 'Lignes effacées en Challenge',
    'stat.bestChain': 'Plus longue chaîne',
    'stat.megas': 'Méga-combos',
    'stat.games': 'Parties de Challenge',
    'stat.solved': 'Niveaux résolus',
    'stat.stars': 'Étoiles',
    'update.text': 'Nouvelle version disponible',
    'update.btn': 'Mettre à jour',
    'set.title': 'Réglages',
    'set.language': 'Langue',
    'set.theme': 'Apparence',
    'set.auto': 'Auto',
    'set.fr': 'Français',
    'set.en': 'English',
    'set.light': 'Clair',
    'set.dark': 'Sombre',
    'set.sound': 'Sons',
    'set.haptics': 'Vibrations',
    'set.silent': 'Sons en mode silencieux',
    'set.silentSub': 'Met en pause la musique des autres apps quand le jeu joue un son',
    'set.note': 'Auto suit la langue et l’apparence de l’appareil.',
  },

  en: {
    'home.tagline': 'One stroke. Every row a single colour.',
    'home.puzzle': 'Puzzle',
    'home.challenge': 'Challenge',
    'home.howto': 'How to play',
    'home.settings': 'Settings',
    'home.levels': ({ n }) => `${n} levels`,
    'home.progress': ({ n, total }) => `${n} / ${total} levels solved`,
    'home.best': ({ s }) => `Best score: ${s}`,
    'home.challengeSub': 'Hold out as long as you can',
    'home.installIOS': 'To install: tap Share in Safari, then “Add to Home Screen”.',
    'home.installBtn': 'Install the app',

    'nav.home': 'Home',
    'nav.levels': 'Levels',
    'nav.back': 'Back',

    'levels.title': 'Puzzle',
    'levels.caption': ({ w, h, holes }) => `${w} × ${h} grids${holes ? ', with holes' : ''}`,
    'levels.stock': 'The 100 Polarium puzzles',
    'levels.locked': ({ n }) => `Level ${n}, locked`,
    'levels.item': ({ n, solved }) => `Level ${n}${solved ? ', solved' : ''}`,

    'game.level': ({ n }) => `Level ${n}`,
    'game.hint': 'Hint',
    'game.cancel': 'Cancel stroke',
    'game.dirty': ({ n }) => plEn(n, 'mixed row', 'mixed rows'),
    'game.solved': 'Solved',
    'game.intro': 'One stroke, then tap its last cell to confirm.',
    'game.hint1': 'The stroke starts here.',
    'game.hint2': 'Here is the start of the stroke.',
    'game.hint3': 'Here is the full stroke.',
    'game.fail': ({ n }) => (n === 1 ? '1 mixed row left. Try again.' : `${n} mixed rows left. Try again.`),
    'game.winTitle': ({ n }) => `Level ${n} cleared`,
    'game.winAll': 'All 200 levels done. Well played.',
    'game.winHints': ({ n }) => `With ${plEn(n, 'hint', 'hints')}. Beat it without to earn the star.`,
    'game.winStar': 'No hints: star earned.',
    'game.next': 'Next level',
    'game.replay': 'Play again',
    'game.list': 'Level list',

    'cmenu.title': 'Challenge',
    'cmenu.intro': 'Blocks of rows fall from the top. Only the bottom area is within reach: clear rows to bring the rest down before the stack crosses the red line.',
    'cmenu.challenge': 'Challenge',
    'cmenu.challengeSub': 'Starts with a full stack, speeds up every 10 rows',
    'cmenu.practice': 'Practice',
    'cmenu.practiceSub': 'Almost empty stack, slow pace, no ranking',
    'cmenu.best': 'Best scores',
    'cmenu.none': 'No Challenge games yet.',

    'ch.level': ({ n }) => `Level ${n}`,
    'ch.lines': ({ n }) => plEn(n, 'row', 'rows'),
    'ch.practice': 'Practice',
    'ch.go': 'Go!',
    'ch.chain': ({ n }) => `Chain ×${n}`,
    'ch.clear': 'Board cleared',
    'ch.levelUp': ({ n }) => `Level ${n}`,
    'ch.drop': 'Drop',
    'ch.pause': 'Paused',
    'ch.score': ({ s }) => `Score: ${s}`,
    'ch.resume': 'Resume',
    'ch.restart': 'Restart',
    'ch.quit': 'Quit',
    'ch.over': 'Game over',
    'ch.record': 'New record',
    'ch.rank': ({ n }) => `${n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th'} best score`,
    'ch.practiceOver': 'Practice over',
    'ch.summary': ({ s, lines, chain }) => `${s} points · ${plEn(lines, 'row', 'rows')} · best chain ×${chain}`,
    'ch.menu': 'Challenge menu',

    'howto.title': 'How to play',
    'howto.s1t': 'Draw without lifting your finger',
    'howto.s1p': 'Cell by cell, horizontally or vertically, never through the same cell twice. Slide back to erase.',
    'howto.s2t': 'Tap the last cell to confirm',
    'howto.s2p': 'The stroke stays on screen when you lift your finger. Tap its last cell to confirm: every tile on the stroke then changes colour.',
    'howto.s3t': 'A single-colour row clears',
    'howto.s3p': 'All black or all white, it counts. In Puzzle, every row in a single stroke.',
    'howto.s4t': 'The frame is a passage',
    'howto.s4p': 'The dots around the grid can be crossed without flipping anything. Holes cannot be crossed.',
    'howto.note': 'Challenge: blocks fall and stack up, only the bottom area can be drawn on. Several rows at once and chains multiply your points. ✕ cancels a stroke.',
    'howto.ok': 'Got it',

    'egg.brother': 'My brother did not approve of this…',
    'egg.ok': 'OK',
    'mega.title': 'MEGA FLIP',
    'mega.sub': ({ n, s }) => `${n} rows at once  +${s}`,
    'secret.chapter': '★ 201',
    'secret.caption': 'Secret level',
    'secret.winTitle': 'The caribou is free',
    'secret.winBody': '200 levels without a hint, then this one. Caribou Labs salutes you.',
    'credits.title': 'CariFlip',
    'credits.by': 'A Caribou Labs game, inspired by Polarium (Nintendo DS, 2004).',
    'credits.stats': 'Your stats',
    'stat.strokes': 'Strokes drawn',
    'stat.flips': 'Tiles flipped',
    'stat.lines': 'Rows cleared in Challenge',
    'stat.bestChain': 'Longest chain',
    'stat.megas': 'Mega combos',
    'stat.games': 'Challenge games',
    'stat.solved': 'Levels solved',
    'stat.stars': 'Stars',
    'update.text': 'A new version is available',
    'update.btn': 'Update',
    'set.title': 'Settings',
    'set.language': 'Language',
    'set.theme': 'Appearance',
    'set.auto': 'Auto',
    'set.fr': 'Français',
    'set.en': 'English',
    'set.light': 'Light',
    'set.dark': 'Dark',
    'set.sound': 'Sound',
    'set.haptics': 'Vibration',
    'set.silent': 'Sound in silent mode',
    'set.silentSub': 'Pauses other apps’ audio when the game plays a sound',
    'set.note': 'Auto follows your device’s language and appearance.',
  },
};

export const LANGS = ['fr', 'en'];

export function deviceLang() {
  const l = ((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
  return l.startsWith('fr') ? 'fr' : 'en';
}

let lang = 'fr';
function resolve() { lang = store.lang && store.lang !== 'auto' ? store.lang : deviceLang(); return lang; }
resolve();

export const currentLang = () => lang;
export const locale = () => (lang === 'fr' ? 'fr-FR' : 'en-GB');
export const fmtNum = (n) => n.toLocaleString(locale());
export const fmtDate = (d) => new Date(d).toLocaleDateString(locale());

export function t(key, params = {}) {
  const v = STR[lang][key] ?? STR.fr[key];
  if (v === undefined) return key;
  return typeof v === 'function' ? v(params) : v;
}

// Textes fixes de la page : éléments marqués data-i18n (texte) et data-i18n-aria (aria-label).
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

const listeners = new Set();
export const onLangChange = (fn) => listeners.add(fn);
function changed() { applyStatic(); listeners.forEach((fn) => fn(lang)); }

export function setLangPref(pref) {
  store.lang = pref; save();
  resolve(); changed();
}
// En mode Auto, suivre un changement de langue du système à chaud.
if (typeof window !== 'undefined') window.addEventListener('languagechange', () => {
  if (!store.lang || store.lang === 'auto') { resolve(); changed(); }
});

// Vérifie que les deux langues ont les mêmes clés (utilisé par les tests).
export function missingKeys() {
  const a = Object.keys(STR.fr), b = Object.keys(STR.en);
  return { inEn: a.filter((k) => !(k in STR.en)), inFr: b.filter((k) => !(k in STR.fr)) };
}
