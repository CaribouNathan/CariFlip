// Trait optimal : le plus petit nombre de tuiles à inverser pour résoudre une grille.
// Pour les niveaux 1-201, valeurs précalculées (tools/compute-optimal.mjs → OPTIMAL ci-dessous).
// Pour le Puzzle du jour et le contre-la-montre, calcul à la volée (quelques millisecondes).
import { solveBoard } from './solve-board.js';
import { OPTIMAL } from './optimal-data.js';
import { isTile, at } from './board.js';

export const boardLines = (b) => {
  const out = [];
  for (let y = 0; y < b.h; y++) {
    let s = '';
    for (let x = 0; x < b.w; x++) { const c = at(b, x, y); s += c === 'B' ? '#' : c === 'W' ? '.' : c === 'F' ? '-' : 'X'; }
    out.push(s);
  }
  return out;
};
export const flipsOf = (board, path) => path.filter(([x, y]) => isTile(at(board, x, y))).length;

// Calcul direct (tests, Worker). null = aucune solution, undefined = temps dépassé.
export function minFlips(board, budgetMs = 4000) {
  const sol = solveBoard(boardLines(board), { budgetMs });
  return sol ? flipsOf(board, sol) : sol;
}

export const optimalForLevel = (n) => OPTIMAL[n] || null;

