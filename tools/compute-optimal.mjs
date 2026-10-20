// Précalcule le nombre minimal de tuiles à inverser pour les niveaux 1-201 → js/optimal-data.js
import { writeFileSync } from 'fs';
import { generateLevel, LEVEL_COUNT, SECRET_LEVEL } from '../js/generator.js';
import { minFlips, flipsOf } from '../js/optimal.js';
const out = {}, slow = [];
const budget = +process.argv[2] || 60000;
for (const n of [...Array(LEVEL_COUNT).keys()].map((i) => i + 1).concat(SECRET_LEVEL)) {
  const lvl = generateLevel(n);
  const t0 = Date.now();
  let v = minFlips(lvl.board, budget);
  const ref = flipsOf(lvl.board, lvl.solution);
  if (typeof v !== 'number') { slow.push(n); v = ref; } // à défaut : la solution de référence
  if (v > ref) throw new Error(`niveau ${n} : ${v} > ${ref}`);
  out[n] = v;
  process.stdout.write(`${n}:${v}/${ref}(${Date.now() - t0}ms) `);
}
writeFileSync(new URL('../js/optimal-data.js', import.meta.url),
  `// Généré par tools/compute-optimal.mjs : nombre minimal de tuiles à inverser par niveau.\nexport const OPTIMAL = ${JSON.stringify(out)};\n`);
console.log('\nnon prouvés (référence utilisée) :', JSON.stringify(slow));
