// Lancer : node tests/start.test.mjs
// Vérifie que chaque grille de départ admet un trait unique qui efface toutes les lignes.
import { buildStartStack } from '../js/start.js';
import { checkFullClear } from '../js/solver.js';
let fails = 0, fallbacks = 0, tries = 0;
const times = [];
for (const n of [10, 3]) {
  for (let i = 0; i < (n === 10 ? 60 : 30); i++) {
    const t0 = performance.now();
    const r = buildStartStack(n);
    times.push(performance.now() - t0);
    if (!r || !r.solution || !checkFullClear(r.stack.slice().reverse(), r.solution)) { fails++; continue; }
    const symmetric = r.stack.every((row) => row.every((c, j) => c === row[row.length - 1 - j]));
    if (!symmetric) { fails++; console.error('grille non symétrique'); }
    if (r.fallback) fallbacks++;
    tries += r.tries;
  }
}
times.sort((a, b) => a - b);
console.log(`${times.length} grilles : ${fails} échec(s), ${fallbacks} grille(s) de secours, ${(tries / times.length).toFixed(1)} tirage(s) en moyenne, médiane ${times[times.length >> 1].toFixed(0)} ms, max ${times[times.length - 1].toFixed(0)} ms`);
process.exit(fails ? 1 : 0);
