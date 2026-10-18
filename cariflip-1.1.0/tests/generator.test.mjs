// Lancer : node tests/generator.test.mjs
import { generateLevel, checkLevel, LEVEL_COUNT, levelParams } from '../js/generator.js';
import { dirtyRowCount, isValidPath, applyPath, isSolved, boardToString } from '../js/board.js';

let fails = 0;
const t0 = Date.now();
const stats = {};
for (let n = 1; n <= LEVEL_COUNT; n++) {
  const lvl = generateLevel(n);
  if (!lvl || !checkLevel(lvl)) { fails++; console.error('Niveau invalide', n); continue; }
  const p = levelParams(n);
  if (lvl.dirty < p.minDirty) console.warn(`Niveau ${n} : ${lvl.dirty} lignes à corriger (< ${p.minDirty})`);
  const key = `${p.W}x${p.H}`;
  (stats[key] ||= []).push(lvl.flips);
}
const ms = Date.now() - t0;

// Déterminisme : régénération sans cache identique.
const { generatePuzzle } = await import('../js/generator.js');
const { mulberry32, seedForLevel } = await import('../js/rng.js');
for (const n of [1, 57, 200]) {
  const again = generatePuzzle(mulberry32(seedForLevel(n)), levelParams(n));
  if (boardToString(again.board) !== boardToString(generateLevel(n).board)) { fails++; console.error('Non déterministe', n); }
}

for (const [k, v] of Object.entries(stats))
  console.log(k.padEnd(5), `niveaux: ${String(v.length).padStart(3)}  tuiles inversées: ${Math.min(...v)}–${Math.max(...v)}`);
console.log(`\n${LEVEL_COUNT} niveaux générés en ${ms} ms — ${fails ? fails + ' ÉCHEC(S)' : 'tout est valide'}`);
console.log('\nNiveau 1 :\n' + boardToString(generateLevel(1).board));
console.log('\nNiveau 120 :\n' + boardToString(generateLevel(120).board));
process.exit(fails ? 1 : 0);
