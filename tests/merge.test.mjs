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
