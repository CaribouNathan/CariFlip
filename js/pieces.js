// Blocs du mode Challenge : motifs de 8 colonnes, 2 à 5 lignes, toujours pleins.
// '#' = tuile noire, '.' = tuile blanche. Aucune ligne n'est uniforme au départ.
// Tous les motifs sont symétriques gauche-droite (chaque ligne est un palindrome) :
// toute grille du Challenge, quel que soit l'empilement, reste symétrique tant que le joueur n'y touche pas.
// Variation : inversion des couleurs, qui conserve la symétrie.
import { BLACK, WHITE } from './board.js';

export const PIECE_W = 8;

export const PATTERNS = [
  ['#.#..#.#', '#.#..#.#', '#.####.#'],                       // piliers
  ['..####..', '.#.##.#.', '.######.', '..#..#..'],           // visage
  ['...##...', '.######.', '...##...'],                       // croix
  ['#......#', '##....##', '###..###'],                       // V
  ['...##...', '..####..', '.##..##.', '..####..', '...##...'], // losange
  ['#.#..#.#', '.#.##.#.'],                                   // damier
  ['.##..##.', '.##..##.'],                                   // barres
  ['##....##', '##....##', '###..###'],                       // H
  ['..#..#..', '.######.', '##.##.##', '#.#..#.#'],           // envahisseur
  ['.##..##.', '#..##..#', '.#....#.', '..#..#..', '...##...'], // cœur
  ['.######.', '...##...', '...##...'],                       // T
  ['...##...', '...##...', '...##...', '...##...'],           // colonne
  ['#......#', '.#....#.'],                                   // chevron
  ['#..##..#', '.##..##.', '#..##..#'],                       // zigzag
  ['#......#', '#......#', '.######.'],                       // U
  ['...##...', '..#..#..', '.#....#.'],                       // flèche
  ['##....##', '##....##', '..####..', '..####..'],           // blocs
  ['.######.', '#..##..#', '.######.'],                       // œil
  ['#..##..#', '.#....#.', '..#..#..'],                       // vague
  ['..####..', '.#.##.#.', '#.####.#', '...##...'],           // champignon
  ['##....##', '#......#', '##....##', '#......#'],           // échelle
  ['#..##..#', '#.####.#'],                                   // créneaux
  ['#......#', '.#....#.', '..#..#..', '.#....#.', '#......#'], // X
  ['.#....#.', '#......#', '.######.'],                       // sourire
  ['#......#', '.#....#.', '..####..'],                       // Y
  ['...##...', '..####..', '.######.'],                       // pyramide
  ['.#....#.', '.#....#.', '.#....#.'],                       // rails
  ['.######.', '..####..', '...##...', '..####..', '.######.'], // sablier
  ['#.#..#.#', '###..###', '.##..##.'],                       // tour
  ['.######.', '.#....#.', '.######.'],                       // cadre
];

// Taille max des motifs par niveau : les grands blocs arrivent plus tard.
const maxRowsFor = (level) => (level <= 1 ? 3 : level <= 3 ? 4 : 5);

const toRow = (s, invert) => [...s].map((c) => ((c === '#') !== invert ? BLACK : WHITE));
const flip = (c) => (c === BLACK ? WHITE : BLACK);
const uniform = (row) => row.every((c) => c === row[0]);

// Renvoie un bloc : tableau de lignes, de haut en bas.
export function randomPiece(level = 1, rnd = Math.random) {
  const pool = PATTERNS.filter((p) => p.length <= maxRowsFor(level));
  const pat = pool[Math.floor(rnd() * pool.length)];
  const invert = rnd() < 0.5;
  const rows = pat.map((s) => toRow(s, invert));
  // À partir du niveau 4, un peu de bruit casse les motifs trop familiers,
  // toujours par paire de cases miroir pour garder la symétrie.
  if (level >= 4) {
    for (const row of rows) {
      if (rnd() < 0.25) {
        const j = Math.floor(rnd() * (PIECE_W / 2)), k = PIECE_W - 1 - j;
        row[j] = flip(row[j]); row[k] = flip(row[k]);
        if (uniform(row)) { row[j] = flip(row[j]); row[k] = flip(row[k]); }
      }
    }
  }
  return rows;
}

export function validatePatterns() {
  const errors = [];
  PATTERNS.forEach((p, i) => {
    if (p.length < 2 || p.length > 5) errors.push(`motif ${i} : ${p.length} lignes`);
    p.forEach((s, r) => {
      if (s.length !== PIECE_W) errors.push(`motif ${i} ligne ${r} : ${s.length} colonnes`);
      if (/^#+$/.test(s) || /^\.+$/.test(s)) errors.push(`motif ${i} ligne ${r} uniforme`);
      if (s !== [...s].reverse().join('')) errors.push(`motif ${i} ligne ${r} non symétrique`);
    });
  });
  return errors;
}
