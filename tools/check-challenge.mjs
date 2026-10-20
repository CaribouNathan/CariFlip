import { readFileSync } from 'fs';
import { solveBoard } from './solve-board.mjs';
const raw = JSON.parse(readFileSync(new URL('./challenge-raw.json', import.meta.url)));
let alone = 0, fail = [];
raw.forEach(([t, g], i) => {
  const rows = g.split('/');
  const lines = ['-----------', ...rows.map((r) => '-' + r + '-')]; // ligne libre au-dessus, cadres latéraux, pile dessous
  const s = solveBoard(lines, { budgetMs: 3000 });
  if (s) alone++; else fail.push([i, t, g, s === undefined ? 'temps' : 'non']);
});
console.log(`${raw.length} blocs, ${alone} effaçables seuls d'un trait`);
console.log(fail.map((f) => f.join(' ')).join('\n'));
