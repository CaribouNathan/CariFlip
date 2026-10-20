import { readFileSync, writeFileSync } from 'fs';
import { solveBoard, checkBoard } from './solve-board.mjs';
const raw = JSON.parse(readFileSync(new URL('./stock-raw.json', import.meta.url)));
const out = [], bad = [];
raw.forEach((g, i) => {
  const lines = g.split('/');
  const t0 = Date.now();
  const sol = solveBoard(lines, { budgetMs: 30000 });
  const ok = sol && checkBoard(lines, sol);
  if (!ok) bad.push([i + 1, sol === undefined ? 'temps dépassé' : 'aucune solution', lines.length - 2 + 'x' + (lines[0].length - 2)]);
  out.push({ n: i + 1, grid: lines, solution: ok ? sol : null });
  process.stdout.write(`${i + 1}:${ok ? 'ok' : 'X'}(${Date.now() - t0}ms) `);
});
console.log('\nproblèmes :', JSON.stringify(bad));
writeFileSync(new URL('./stock-solved.json', import.meta.url), JSON.stringify(out));
