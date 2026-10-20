// Générateur de puzzles à solution garantie.
// Principe (génération inverse) : on part d'une grille où chaque ligne est déjà uniforme,
// on trace un chemin aléatoire, on inverse les tuiles traversées. Le joueur doit retrouver
// un tracé qui ramène toutes les lignes à une seule couleur ; le chemin d'origine en est un.
import { mulberry32, seedForLevel } from './rng.js';
import { BLACK, WHITE, FREE, HOLE, makeBoard, at, set, isTile, isTraversable,
         applyPath, dirtyRowCount, isValidPath, isSolved } from './board.js';

export const LEVEL_COUNT = 200;
export const CHAPTER_SIZE = 25;

// Courbe de difficulté : taille de grille, nombre de tuiles inversées, trous, lignes « sales ».
const TIERS = [
  { upTo: 3,   W: 3, H: 2, flips: [2, 3],   holes: [0, 0], minDirty: 1 },
  { upTo: 10,  W: 4, H: 3, flips: [3, 5],   holes: [0, 0], minDirty: 2 },
  { upTo: 25,  W: 4, H: 4, flips: [5, 8],   holes: [0, 0], minDirty: 3 },
  { upTo: 45,  W: 5, H: 5, flips: [7, 11],  holes: [0, 0], minDirty: 4 },
  { upTo: 70,  W: 6, H: 6, flips: [10, 15], holes: [0, 2], minDirty: 5 },
  { upTo: 100, W: 6, H: 7, flips: [13, 19], holes: [1, 3], minDirty: 6 },
  { upTo: 140, W: 7, H: 8, flips: [17, 25], holes: [2, 4], minDirty: 7 },
  { upTo: 200, W: 8, H: 9, flips: [22, 32], holes: [2, 5], minDirty: 8 },
];

export function levelParams(n) {
  if (n === 201) return { W: 8, H: 8, flips: [0, 0], holes: [0, 0], minDirty: 0 };
  return TIERS.find((t) => n <= t.upTo) || TIERS[TIERS.length - 1];
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function randomWalk(rng, board, targetInner) {
  const { w, h } = board;
  const inner = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1;
  // Départ sur une tuile intérieure.
  const starts = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++)
    if (isTraversable(at(board, x, y))) starts.push([x, y]);
  if (!starts.length) return null;
  const visited = new Uint8Array(w * h);
  let cur = rng.pick(starts);
  const path = [cur];
  visited[cur[1] * w + cur[0]] = 1;
  let innerCount = 1;
  const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !visited[y * w + x] && isTraversable(at(board, x, y));

  while (innerCount < targetInner) {
    const cands = [];
    let total = 0;
    for (const [dx, dy] of DIRS) {
      const nx = cur[0] + dx, ny = cur[1] + dy;
      if (!free(nx, ny)) continue;
      let exits = 0;
      for (const [ex, ey] of DIRS) if (free(nx + ex, ny + ey)) exits++;
      // Préférence pour l'intérieur, pénalité pour les impasses (heuristique de Warnsdorff adoucie).
      const wgt = (inner(nx, ny) ? 3 : 1) * (exits === 0 ? 0.15 : 1);
      cands.push([nx, ny, wgt]);
      total += wgt;
    }
    if (!cands.length) break;
    let r = rng.next() * total, choice = cands[cands.length - 1];
    for (const c of cands) { r -= c[2]; if (r <= 0) { choice = c; break; } }
    cur = [choice[0], choice[1]];
    visited[cur[1] * w + cur[0]] = 1;
    path.push(cur);
    if (inner(cur[0], cur[1])) innerCount++;
  }
  // Les cases de cadre en début/fin de tracé ne servent à rien : on les retire.
  while (path.length && !isTile(at(board, ...path[path.length - 1]))) path.pop();
  while (path.length && !isTile(at(board, ...path[0]))) path.shift();
  return { path, innerCount };
}

export function generatePuzzle(rng, p) {
  const W = p.W, H = p.H;
  const w = W + 2, h = H + 2; // cadre traversable d'une case tout autour
  let best = null;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const base = makeBoard(w, h, FREE);
    for (let y = 1; y <= H; y++) {
      const color = rng.bool() ? BLACK : WHITE;
      for (let x = 1; x <= W; x++) set(base, x, y, color);
    }
    // Trous : jamais deux dans la même ligne, jamais une ligne vidée.
    const holeCount = rng.int(p.holes[0], p.holes[1]);
    const usedRows = new Set();
    for (let i = 0; i < holeCount; i++) {
      const y = rng.int(1, H);
      if (usedRows.has(y)) continue;
      usedRows.add(y);
      set(base, rng.int(1, W), y, HOLE);
    }
    const target = rng.int(p.flips[0], p.flips[1]);
    const walk = randomWalk(rng, base, target);
    if (!walk || walk.path.length < 2) continue;
    const flips = walk.path.filter(([x, y]) => isTile(at(base, x, y))).length;
    if (flips < p.flips[0]) continue;
    const puzzle = applyPath(base, walk.path);
    const dirty = dirtyRowCount(puzzle);
    const cand = { board: puzzle, solution: walk.path, flips, dirty };
    if (dirty >= p.minDirty) return cand;
    if (!best || dirty > best.dirty) best = cand;
  }
  return best;
}

// Niveau secret 201 : un caribou en pixel-art, solution vérifiée par le solveur (js/solver.js).
export const SECRET_LEVEL = 201;
const CARIBOU = ['#..##..#', '#.#..#.#', '.##..##.', '...##...', '..####..', '.######.', '..####..', '...##...'];
const CARIBOU_SOLUTION = [[2, 2], [2, 3], [3, 3], [3, 4], [2, 4], [1, 4], [1, 5], [2, 5], [2, 6], [3, 6], [3, 7], [4, 7], [4, 6], [5, 6], [5, 7], [6, 7], [6, 6], [7, 6], [7, 5], [8, 5], [9, 5], [9, 6], [9, 7], [9, 8], [9, 9], [8, 9], [7, 9], [6, 9], [5, 9], [5, 8], [4, 8], [4, 9], [3, 9], [2, 9], [1, 9], [0, 9], [0, 8], [0, 7], [0, 6], [0, 5], [0, 4], [0, 3], [0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [5, 2], [5, 1], [5, 0], [6, 0], [7, 0], [8, 0], [8, 1], [9, 1], [9, 2], [9, 3], [9, 4], [8, 4], [7, 4], [6, 4], [6, 3], [7, 3], [7, 2]];
function caribouLevel() {
  const board = makeBoard(CARIBOU[0].length + 2, CARIBOU.length + 2, FREE);
  CARIBOU.forEach((r, y) => [...r].forEach((c, x) => set(board, x + 1, y + 1, c === '#' ? BLACK : WHITE)));
  return { n: SECRET_LEVEL, board, solution: CARIBOU_SOLUTION.map(([x, y]) => [x, y]), secret: true };
}

const cache = new Map();
export function generateLevel(n) {
  if (cache.has(n)) return cache.get(n);
  if (n === SECRET_LEVEL) { const l = caribouLevel(); cache.set(n, l); return l; }
  const rng = mulberry32(seedForLevel(n));
  const res = generatePuzzle(rng, levelParams(n));
  const lvl = { n, ...res };
  cache.set(n, lvl);
  return lvl;
}

// Contrôle de cohérence d'un niveau (utilisé par les tests).
export function checkLevel(lvl) {
  return isValidPath(lvl.board, lvl.solution)
    && isSolved(applyPath(lvl.board, lvl.solution))
    && !isSolved(lvl.board);
}
