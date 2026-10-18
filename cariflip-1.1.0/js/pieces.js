// Blocs du mode Challenge : motifs de 8 colonnes, 2 à 5 lignes, toujours pleins.
// '#' = tuile noire, '.' = tuile blanche. Aucune ligne n'est uniforme au départ.
// Chaque motif est tiré au hasard avec miroir horizontal et/ou inversion des couleurs.
import { BLACK, WHITE } from './board.js';

export const PIECE_W = 8;

export const PATTERNS = [
  ['#.#..#.#', '#.#..#.#', '#.####.#'],                       // piliers
  ['..####..', '.#.##.#.', '.######.', '..#..#..'],           // visage
  ['...##...', '.######.', '...##...'],                       // croix
  ['#.......', '##......', '###.....', '####....'],           // escalier
  ['...##...', '..####..', '.##..##.', '..####..', '...##...'], // losange
  ['#.#.#.#.', '.#.#.#.#'],                                   // damier
  ['##..##..', '##..##..'],                                   // barres
  ['##....##', '##....##', '###..###'],                       // H
  ['..#..#..', '.######.', '##.##.##', '#.#..#.#'],           // envahisseur
  ['.##..##.', '#..##..#', '.#....#.', '..#..#..', '...##...'], // cœur
  ['.######.', '...##...', '...##...'],                       // T
  ['...#....', '...#....', '...#....', '...#....'],           // colonne
  ['#......#', '.#....#.'],                                   // chevron
  ['##..##..', '.##..##.', '..##..##'],                       // zigzag
  ['#......#', '#......#', '.######.'],                       // U
  ['...##...', '..#..#..', '.#....#.'],                       // flèche
  ['####....', '####....', '....####', '....####'],           // blocs
  ['.######.', '#..##..#', '.######.'],                       // œil
  ['#..#..#.', '.#..#..#', '..#..#..'],                       // vague
  ['..####..', '.#.##.#.', '#.####.#', '...##...'],           // champignon
  ['##....##', '#......#', '##....##', '#......#'],           // échelle
  ['#..##..#', '#.####.#'],                                   // créneaux
  ['.##.....', '#..#####', '.##..#.#'],                       // clé
  ['.#....#.', '#......#', '.######.'],                       // sourire
  ['#.......', '#.......', '#######.'],                       // équerre
  ['...##...', '..####..', '.######.'],                       // pyramide
  ['.#....#.', '.#....#.', '.#....#.'],                       // rails
  ['#...#...', '.#...#..', '..#...#.', '...#...#'],           // diagonales
  ['####....', '##.#....', '####....', '#.......'],           // drapeau
  ['.######.', '.#....#.', '.######.'],                       // cadre
];

// Taille max des motifs par niveau : les grands blocs arrivent plus tard.
const maxRowsFor = (level) => (level <= 1 ? 3 : level <= 3 ? 4 : 5);

const toRow = (s, invert, mirror) => {
  const chars = mirror ? [...s].reverse() : [...s];
  return chars.map((c) => ((c === '#') !== invert ? BLACK : WHITE));
};
const uniform = (row) => row.every((c) => c === row[0]);

// Renvoie un bloc : tableau de lignes, de haut en bas.
export function randomPiece(level = 1, rnd = Math.random) {
  const pool = PATTERNS.filter((p) => p.length <= maxRowsFor(level));
  const pat = pool[Math.floor(rnd() * pool.length)];
  const invert = rnd() < 0.5, mirror = rnd() < 0.5;
  const rows = pat.map((s) => toRow(s, invert, mirror));
  // À partir du niveau 4, un peu de bruit casse les motifs trop familiers.
  if (level >= 4) {
    for (const row of rows) {
      if (rnd() < 0.25) {
        const j = Math.floor(rnd() * PIECE_W);
        row[j] = row[j] === BLACK ? WHITE : BLACK;
        if (uniform(row)) row[j] = row[j] === BLACK ? WHITE : BLACK;
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
    });
  });
  return errors;
}
