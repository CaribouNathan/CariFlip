// Lancer : node tests/pieces.test.mjs
import { PATTERNS, validatePatterns, randomPiece } from '../js/pieces.js';
const errs = validatePatterns();
let bad = 0, total = 0;
for (let level = 1; level <= 20; level++) {
  for (let i = 0; i < 2000; i++) {
    for (const row of randomPiece(level)) {
      total++;
      const sym = row.every((c, j) => c === row[row.length - 1 - j]);
      const uni = row.every((c) => c === row[0]);
      if (!sym || uni) bad++;
    }
  }
}
console.log(`${PATTERNS.length} motifs, ${errs.length} erreur(s) de motif, ${bad} ligne(s) invalide(s) sur ${total} générées`);
if (errs.length) console.log(errs.join('\n'));
process.exit(errs.length || bad ? 1 : 0);
