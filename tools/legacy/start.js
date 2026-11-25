// Grille de départ du Challenge / de l'Entraînement, avec garantie du méga-combo :
// on empile des blocs symétriques, puis on ne garde la grille que si le solveur trouve
// un trait unique qui rend toutes les lignes unies. Sinon on en tire une autre.
import { randomPiece } from './pieces.js';
import { solveFullClear, checkFullClear } from './solver.js';

// Grille de secours, vérifiée (c'est celle de la capture de Nathan) : ne sert que si
// aucune grille tirée n'a abouti dans le temps imparti, ce qui ne doit quasiment jamais arriver.
const FALLBACK_10 = ['..####..', '..####..', '...##...', '#......#', '###..###',
  '###..###', '.##..##.', '.#....#.', '.##..##.', '.#....#.'];

const toRows = (strs) => strs.map((s) => [...s].map((c) => (c === '#' ? 'B' : 'W')));

// Renvoie { stack (de bas en haut, format du jeu), solution (trait, coordonnées locales), tries }.
export function buildStartStack(n, { timeMs = 2500, rnd = Math.random } = {}) {
  const t0 = performance.now();
  let tries = 0;
  while (performance.now() - t0 < timeMs) {
    tries++;
    const stack = [];
    while (stack.length < n) {
      const p = randomPiece(1, rnd);
      for (let r = p.length - 1; r >= 0; r--) stack.push(p[r]);
    }
    stack.length = n;
    const top = stack.slice().reverse();
    const solution = solveFullClear(top, { budgetMs: 150, rnd });
    if (solution && checkFullClear(top, solution)) return { stack, solution, tries };
  }
  if (n === FALLBACK_10.length) {
    const top = toRows(FALLBACK_10);
    const solution = solveFullClear(top, { budgetMs: 2000, rnd });
    return { stack: top.slice().reverse(), solution, tries, fallback: true };
  }
  return null;
}
