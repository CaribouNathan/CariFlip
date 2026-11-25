// Fusion des familles : commutative, idempotente, sans perte.
import assert from 'node:assert/strict';
import { mergeFamily, newProfile, sameFamily } from '../js/storage.js';
const p = newProfile('Nathan', '🦊');
const a = { profiles: { [p.id]: { ...structuredClone(p), solved: { 1: { hints: 2 }, 2: { hints: 0, len: 9 } }, stats: { devA: { strokes: 5 } }, records: [{ score: 10, date: 1 }] } } };
const b = { profiles: { [p.id]: { ...structuredClone(p), name: 'Nat', updated: p.updated + 5, solved: { 1: { hints: 0, len: 12 }, 3: { hints: 1 } }, stats: { devB: { strokes: 3 }, devA: { strokes: 2 } }, records: [{ score: 20, date: 2 }] } } };
const ab = mergeFamily(a, b), ba = mergeFamily(b, a);
assert.ok(sameFamily(ab, ba), 'commutative');
assert.ok(sameFamily(mergeFamily(ab, ab), ab), 'idempotente');
const m = ab.profiles[p.id];
assert.equal(m.name, 'Nat');
assert.deepEqual(m.solved[1], { hints: 0, len: 12 });
assert.deepEqual(m.solved[2], { hints: 0, len: 9 });
assert.ok(m.solved[3]);
assert.equal(m.stats.devA.strokes, 5);
assert.equal(m.stats.devB.strokes, 3);
assert.deepEqual(m.records.map((r) => r.score), [20, 10]);
console.log('merge ok');

// v1.11 : trait enregistré, jours rattrapés, grilles de l'éditeur.
{
  const { encodePath, decodePath } = await import('../js/storage.js');
  const path = [[1, 1], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
  assert.deepEqual(decodePath(encodePath(path)), path);
  const q = newProfile('Q', '🦊');
  const A = { profiles: { [q.id]: { ...structuredClone(q), solved: { 1: { hints: 0, len: 12, path: '11RRD', plen: 12 } }, daily: { '2026-11-01': { hints: 0, len: 5, late: true } } } },
    grids: { ABC: { code: 'ABC', name: 'Un', author: q.id, created: 5, updated: 5, deleted: false } } };
  const B = { profiles: { [q.id]: { ...structuredClone(q), solved: { 1: { hints: 1, len: 10, path: '11DDR', plen: 10 } }, daily: { '2026-11-01': { hints: 1, len: 7 } } } },
    grids: { ABC: { code: 'ABC', name: 'Deux', author: null, created: 9, updated: 8, deleted: false }, XYZ: { code: 'XYZ', name: 'Z', author: null, created: 1, updated: 1, deleted: true } } };
  const ab = mergeFamily(A, B), ba = mergeFamily(B, A);
  assert.ok(sameFamily(ab, ba), 'commutative (v1.11)');
  assert.ok(sameFamily(mergeFamily(ab, ab), ab), 'idempotente (v1.11)');
  assert.deepEqual(ab.profiles[q.id].solved[1], { hints: 0, len: 10, path: '11DDR', plen: 10 });
  assert.equal(ab.profiles[q.id].daily['2026-11-01'].late, undefined, 'résolu le jour même sur un appareil → pas « rattrapé »');
  assert.equal(ab.grids.ABC.name, 'Deux');
  assert.equal(ab.grids.ABC.author, q.id);
  assert.equal(ab.grids.XYZ.deleted, true);
  // Une famille venue d'une ancienne version (sans grilles) ne fait rien perdre.
  assert.ok(sameFamily(mergeFamily(ab, { profiles: {} }), ab));
  console.log('merge v1.11 ok');
}
