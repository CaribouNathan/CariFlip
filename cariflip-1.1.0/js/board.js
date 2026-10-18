// Règles du jeu, indépendantes de l'affichage.
// Cases : 'B' noire, 'W' blanche, 'F' libre (cadre ou vide : traversable, ne s'inverse pas),
//         'X' trou (infranchissable).
export const BLACK = 'B', WHITE = 'W', FREE = 'F', HOLE = 'X';

export const isTile = (c) => c === BLACK || c === WHITE;
export const isTraversable = (c) => c !== HOLE;
export const flipColor = (c) => (c === BLACK ? WHITE : c === WHITE ? BLACK : c);

export function makeBoard(w, h, fill = FREE) {
  return { w, h, cells: new Array(w * h).fill(fill) };
}
export function cloneBoard(b) {
  return { w: b.w, h: b.h, cells: b.cells.slice() };
}
export const at = (b, x, y) => b.cells[y * b.w + x];
export const set = (b, x, y, v) => { b.cells[y * b.w + x] = v; };
export const inBounds = (b, x, y) => x >= 0 && y >= 0 && x < b.w && y < b.h;
export const isAdjacent = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) === 1;

// Vérifie qu'un tracé est légal : cases adjacentes, sans répétition, sans trou.
export function isValidPath(b, path) {
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    if (!inBounds(b, x, y) || !isTraversable(at(b, x, y))) return false;
    const k = y * b.w + x;
    if (seen.has(k)) return false;
    seen.add(k);
    if (i > 0 && !isAdjacent(path[i - 1], path[i])) return false;
  }
  return true;
}

// Applique le tracé : chaque tuile traversée change de couleur.
export function applyPath(b, path) {
  const out = cloneBoard(b);
  for (const [x, y] of path) set(out, x, y, flipColor(at(out, x, y)));
  return out;
}

// État d'une ligne : null si elle ne contient aucune tuile, sinon true/false (uniforme ou non).
export function rowState(b, y) {
  let first = null;
  for (let x = 0; x < b.w; x++) {
    const c = at(b, x, y);
    if (!isTile(c)) continue;
    if (first === null) first = c;
    else if (c !== first) return false;
  }
  return first === null ? null : true;
}

export function uniformRows(b) {
  const rows = [];
  for (let y = 0; y < b.h; y++) if (rowState(b, y) === true) rows.push(y);
  return rows;
}

export function dirtyRowCount(b) {
  let n = 0;
  for (let y = 0; y < b.h; y++) if (rowState(b, y) === false) n++;
  return n;
}

export const isSolved = (b) => dirtyRowCount(b) === 0;

// Sérialisation compacte (utile pour le partage et les tests).
export const boardToString = (b) => {
  const rows = [];
  for (let y = 0; y < b.h; y++) rows.push(b.cells.slice(y * b.w, (y + 1) * b.w).join(''));
  return rows.join('\n');
};
